using Copernica.Auth;
using Copernica.Data;
using Copernica.Git;
using Copernica.Rendering;
using Copernica.Spaces;
using Microsoft.EntityFrameworkCore;

namespace Copernica.Discussions;

public sealed record AnchorInput(string? Exact, string? Prefix, string? Suffix, int Start, int End, string? CommitId);

public sealed record UserRef(string Id, string DisplayName);

public sealed record CommentDto(Guid Id, UserRef Author, string? Html, string? Body, DateTime CreatedAt, DateTime? EditedAt, bool Deleted);

public sealed record AnchorDto(string Exact, int Start, int End, string CommitId, string OriginalExact);

public sealed record DiscussionDto(
    Guid Id,
    string Path,
    string State,
    string AnchorStatus,
    AnchorDto Anchor,
    DateTime CreatedAt,
    UserRef? ResolvedBy,
    DateTime? ResolvedAt,
    IReadOnlyList<CommentDto> Comments);

public abstract record DiscussionResult
{
    public sealed record Ok(DiscussionDto Discussion) : DiscussionResult;

    public sealed record CommentOk(CommentDto Comment) : DiscussionResult;

    public sealed record Deleted : DiscussionResult;

    public sealed record NotFound : DiscussionResult;

    public sealed record Invalid(string Message) : DiscussionResult;

    public sealed record AnchorNotFound : DiscussionResult;

    public sealed record NotAuthor : DiscussionResult;
}

/// <summary>Discussions anchored to page fragments (US4, FR-018..FR-025).</summary>
public sealed class DiscussionService(
    CopernicaDbContext db,
    PageService pages,
    MirrorRepository mirror,
    MoveResolver moves,
    MarkdownRenderer renderer,
    TimeProvider time)
{
    /// <summary>Discussions of pages moved through the wiki follow them right away (005 FR-006).</summary>
    public async Task ApplyMovesAsync(Space space, MoveMap map, CancellationToken cancellationToken)
    {
        var paths = map.Files.Keys.Where(PageTreeBuilder.IsPage).ToList();
        var discussions = await db.Discussions
            .Where(d => d.SpaceId == space.Id && paths.Contains(d.PagePath))
            .ToListAsync(cancellationToken);
        foreach (var discussion in discussions)
        {
            discussion.PagePath = map.Map(discussion.PagePath)!;
        }

        if (discussions.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<IReadOnlyList<DiscussionDto>> ListAsync(Space space, string path, string state, CurrentUser viewer, CancellationToken cancellationToken)
    {
        var head = pages.GetHead(space);
        if (head is not null)
        {
            await FollowRenamesAsync(space, head, cancellationToken);
        }

        var query = db.Discussions.Include(d => d.Comments).Where(d => d.SpaceId == space.Id && d.PagePath == path);
        query = state switch
        {
            "resolved" => query.Where(d => d.State == DiscussionState.Resolved),
            "all" => query,
            _ => query.Where(d => d.State == DiscussionState.Open),
        };

        var discussions = await query.ToListAsync(cancellationToken);
        if (head is not null)
        {
            var text = pages.GetPlainText(space, path, head);
            foreach (var discussion in discussions)
            {
                Reanchor(discussion, text, head);
            }

            await db.SaveChangesAsync(cancellationToken);
        }

        return await ToDtosAsync(discussions.OrderBy(d => d.Anchor.Start).ThenBy(d => d.CreatedAt), viewer, cancellationToken);
    }

    public async Task<DiscussionResult> CreateAsync(Space space, string path, AnchorInput anchor, string? body, CurrentUser user, CancellationToken cancellationToken)
    {
        if (ValidateBody(body) is { } invalid)
        {
            return invalid;
        }

        var exact = anchor.Exact ?? "";
        if (exact.Trim().Length == 0 || exact.Length > TextAnchor.MaxExactLength || (anchor.Prefix?.Length ?? 0) > TextAnchor.ContextLength ||
            (anchor.Suffix?.Length ?? 0) > TextAnchor.ContextLength || anchor.CommitId is null || !PageService.IsCommitId(anchor.CommitId))
        {
            return new DiscussionResult.Invalid("The selected fragment is invalid.");
        }

        var text = pages.GetPlainText(space, path, anchor.CommitId);
        if (text is null)
        {
            return new DiscussionResult.NotFound();
        }

        if (anchor.Start < 0 || anchor.End > text.Length || anchor.End - anchor.Start != exact.Length ||
            string.CompareOrdinal(text, anchor.Start, exact, 0, exact.Length) != 0)
        {
            return new DiscussionResult.AnchorNotFound();
        }

        var now = time.GetUtcNow().UtcDateTime;
        var position = Reanchorer.At(text, anchor.Start, anchor.End);
        var discussion = new Discussion
        {
            Id = Guid.CreateVersion7(),
            SpaceId = space.Id,
            PagePath = path,
            CreatedBy = user.Id,
            CreatedAt = now,
            Anchor = new TextAnchor
            {
                Exact = position.Exact,
                Prefix = position.Prefix,
                Suffix = position.Suffix,
                Start = position.Start,
                End = position.End,
                CommitId = anchor.CommitId,
                OriginalExact = position.Exact,
            },
            Comments = [new Comment { Id = Guid.CreateVersion7(), AuthorId = user.Id, Body = body!, CreatedAt = now }],
        };

        db.Discussions.Add(discussion);
        await db.SaveChangesAsync(cancellationToken);
        return new DiscussionResult.Ok((await ToDtosAsync([discussion], user, cancellationToken))[0]);
    }

    public async Task<Discussion?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        await db.Discussions.Include(d => d.Comments).FirstOrDefaultAsync(d => d.Id == id, cancellationToken);

    public async Task<DiscussionResult> ReplyAsync(Discussion discussion, string? body, CurrentUser user, CancellationToken cancellationToken)
    {
        if (ValidateBody(body) is { } invalid)
        {
            return invalid;
        }

        var comment = new Comment { Id = Guid.CreateVersion7(), DiscussionId = discussion.Id, AuthorId = user.Id, Body = body!, CreatedAt = time.GetUtcNow().UtcDateTime };
        db.Comments.Add(comment);
        await db.SaveChangesAsync(cancellationToken);
        return new DiscussionResult.CommentOk(await ToDtoAsync(comment, user, cancellationToken));
    }

    public async Task<DiscussionResult> EditCommentAsync(Discussion discussion, Guid commentId, string? body, CurrentUser user, CancellationToken cancellationToken)
    {
        var comment = discussion.Comments.FirstOrDefault(c => c.Id == commentId && c.DeletedAt is null);
        if (comment is null)
        {
            return new DiscussionResult.NotFound();
        }

        if (comment.AuthorId != user.Id)
        {
            return new DiscussionResult.NotAuthor();
        }

        if (ValidateBody(body) is { } invalid)
        {
            return invalid;
        }

        comment.Body = body!;
        comment.EditedAt = time.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(cancellationToken);
        return new DiscussionResult.CommentOk(await ToDtoAsync(comment, user, cancellationToken));
    }

    /// <summary>
    /// Deletes the caller's comment. The opening comment is only soft-deleted while replies exist;
    /// a discussion whose comments are all deleted is removed.
    /// </summary>
    public async Task<DiscussionResult> DeleteCommentAsync(Discussion discussion, Guid commentId, CurrentUser user, CancellationToken cancellationToken)
    {
        var comment = discussion.Comments.FirstOrDefault(c => c.Id == commentId && c.DeletedAt is null);
        if (comment is null)
        {
            return new DiscussionResult.NotFound();
        }

        if (comment.AuthorId != user.Id)
        {
            return new DiscussionResult.NotAuthor();
        }

        comment.DeletedAt = time.GetUtcNow().UtcDateTime;
        if (discussion.Comments.All(c => c.DeletedAt is not null))
        {
            db.Discussions.Remove(discussion);
        }

        await db.SaveChangesAsync(cancellationToken);
        return new DiscussionResult.Deleted();
    }

    public async Task<DiscussionResult> SetStateAsync(Discussion discussion, string? state, CurrentUser user, CancellationToken cancellationToken)
    {
        switch (state)
        {
            case "resolved":
                discussion.State = DiscussionState.Resolved;
                discussion.ResolvedBy = user.Id;
                discussion.ResolvedAt = time.GetUtcNow().UtcDateTime;
                break;
            case "open":
                discussion.State = DiscussionState.Open;
                discussion.ResolvedBy = null;
                discussion.ResolvedAt = null;
                break;
            default:
                return new DiscussionResult.Invalid("State must be 'open' or 'resolved'.");
        }

        await db.SaveChangesAsync(cancellationToken);
        return new DiscussionResult.Ok((await ToDtosAsync([discussion], user, cancellationToken))[0]);
    }

    /// <summary>Moves the anchor to the current page version, or marks it outdated (FR-023).</summary>
    private static void Reanchor(Discussion discussion, string? text, string head)
    {
        if (discussion.Anchor.CommitId == head)
        {
            return;
        }

        var position = text is null ? null : Reanchorer.Locate(text, discussion.Anchor);
        if (position is null)
        {
            discussion.AnchorStatus = AnchorStatus.Outdated;
            discussion.Anchor.CommitId = head;
            return;
        }

        discussion.AnchorStatus = AnchorStatus.Anchored;
        discussion.Anchor.Start = position.Start;
        discussion.Anchor.End = position.End;
        discussion.Anchor.Exact = position.Exact;
        discussion.Anchor.Prefix = position.Prefix;
        discussion.Anchor.Suffix = position.Suffix;
        discussion.Anchor.CommitId = head;
    }

    /// <summary>Discussions of pages renamed outside the wiki follow the page (spec edge case; 005 research R5).</summary>
    private async Task FollowRenamesAsync(Space space, string head, CancellationToken cancellationToken)
    {
        var stale = await db.Discussions
            .Where(d => d.SpaceId == space.Id && d.Anchor.CommitId != head)
            .ToListAsync(cancellationToken);
        var changed = false;
        foreach (var discussion in stale)
        {
            if (mirror.FindBlob(space, head, space.ToRepositoryPath(discussion.PagePath)) is not null)
            {
                continue;
            }

            if (moves.Resolve(space, head, discussion.PagePath) is MoveResolution.Moved moved)
            {
                discussion.PagePath = moved.Path;
                changed = true;
            }
        }

        if (changed)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private static DiscussionResult? ValidateBody(string? body) =>
        string.IsNullOrWhiteSpace(body) || body.Length > Comment.MaxBodyLength
            ? new DiscussionResult.Invalid($"A comment of 1–{Comment.MaxBodyLength} characters is required.")
            : null;

    private async Task<IReadOnlyList<DiscussionDto>> ToDtosAsync(IEnumerable<Discussion> discussions, CurrentUser viewer, CancellationToken cancellationToken)
    {
        var list = discussions.ToList();
        var userIds = list.SelectMany(d => d.Comments.Select(c => c.AuthorId).Append(d.ResolvedBy ?? "")).Where(id => id.Length > 0).Distinct().ToList();
        var names = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, cancellationToken);
        UserRef Ref(string id) => new(id, names.GetValueOrDefault(id, id));

        return list.Select(d => new DiscussionDto(
            d.Id,
            d.PagePath,
            d.State == DiscussionState.Resolved ? "resolved" : "open",
            d.AnchorStatus == AnchorStatus.Outdated ? "outdated" : "anchored",
            new AnchorDto(d.Anchor.Exact, d.Anchor.Start, d.Anchor.End, d.Anchor.CommitId, d.Anchor.OriginalExact),
            d.CreatedAt,
            d.ResolvedBy is null ? null : Ref(d.ResolvedBy),
            d.ResolvedAt,
            d.Comments.OrderBy(c => c.CreatedAt).ThenBy(c => c.Id).Select(c => ToDto(c, Ref(c.AuthorId), viewer)).ToList())).ToList();
    }

    private async Task<CommentDto> ToDtoAsync(Comment comment, CurrentUser viewer, CancellationToken cancellationToken)
    {
        var name = await db.Users.Where(u => u.Id == comment.AuthorId).Select(u => u.DisplayName).FirstOrDefaultAsync(cancellationToken);
        return ToDto(comment, new UserRef(comment.AuthorId, name ?? comment.AuthorId), viewer);
    }

    private CommentDto ToDto(Comment comment, UserRef author, CurrentUser viewer)
    {
        var deleted = comment.DeletedAt is not null;
        return new CommentDto(
            comment.Id,
            author,
            deleted ? null : renderer.Render(comment.Body),
            !deleted && comment.AuthorId == viewer.Id ? comment.Body : null,
            comment.CreatedAt,
            comment.EditedAt,
            deleted);
    }
}
