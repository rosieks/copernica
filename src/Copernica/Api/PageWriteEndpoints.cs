using System.Text;
using Copernica.Attachments;
using Copernica.Auth;
using Copernica.Git;
using Copernica.Hosting;
using Copernica.Spaces;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Copernica.Api;

/// <param name="Attachments">Pending images of this edit (003 contracts/api.md §3).</param>
public sealed record SavePageRequest(PageVersionRef? Base, string? Markdown, string? Message, IReadOnlyList<string>? Attachments = null);

public sealed record DeletePageRequest(PageVersionRef? Base, string? Message);

public sealed record RenderRequest(string? SpaceId, string? Path, string? Markdown, IReadOnlyList<string>? Attachments = null);

/// <summary>Create, update and delete pages; editor preview (FR-010..FR-017).</summary>
public static class PageWriteEndpoints
{
    public const int MaxMessageLength = 500;
    public const int MaxMarkdownBytes = 1_048_576;

    public static RouteGroupBuilder MapPageWriteEndpoints(this RouteGroupBuilder api)
    {
        api.MapPut("/spaces/{spaceId}/pages/{**path}", SaveAsync);
        api.MapDelete("/spaces/{spaceId}/pages/{**path}", DeleteAsync);
        api.MapPost("/render", RenderAsync);
        api.MapGet("/spaces/{spaceId}/history/{**path}", HistoryAsync);
        api.MapGet("/spaces/{spaceId}/diff/{**path}", DiffAsync);
        return api;
    }

    private static async Task<IResult> SaveAsync(
        string spaceId,
        string path,
        SavePageRequest request,
        HttpContext context,
        PermissionService permissions,
        PageWriteService writer,
        PendingImageStore pending,
        ReferencedImages referenced)
    {
        var access = await permissions.RequireWriteAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (Validate(path, request.Message, out var normalized) is { } invalid)
        {
            return invalid;
        }

        if (request.Markdown is null || Encoding.UTF8.GetByteCount(request.Markdown) > MaxMarkdownBytes)
        {
            return ProblemTypes.BadRequest("The page content is missing or larger than 1 MiB.");
        }

        // Commit the edit's pending images that the saved text still references (003 FR-007).
        var images = await pending.ResolveAsync(access.User!, spaceId, normalized, request.Attachments, context.RequestAborted);
        var used = referenced.Collect(request.Markdown, normalized);
        var files = new List<AddedFile>();
        foreach (var image in images.Where(i => used.Contains(i.RepositoryPath)))
        {
            files.Add(new AddedFile(image.RepositoryPath, await pending.ReadAllAsync(image, context.RequestAborted)));
        }

        var change = new PageChange(normalized, request.Markdown, request.Message!, request.Base) { Files = files };
        var result = await writer.WriteAsync(access, change, context.RequestAborted);
        if (result is Ok<SaveResult> && images.Count > 0)
        {
            // The edit is over: committed images are repository files now, the others are discarded.
            await pending.DeleteAsync(images, context.RequestAborted);
        }

        return result;
    }

    private static async Task<IResult> DeleteAsync(string spaceId, string path, [Microsoft.AspNetCore.Mvc.FromBody] DeletePageRequest request, HttpContext context, PermissionService permissions, PageWriteService writer)
    {
        var access = await permissions.RequireWriteAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (Validate(path, request.Message, out var normalized) is { } invalid)
        {
            return invalid;
        }

        if (request.Base is null)
        {
            return ProblemTypes.BadRequest("The version the deletion is based on is required.");
        }

        var result = await writer.WriteAsync(access, new PageChange(normalized, null, request.Message!, request.Base), context.RequestAborted);
        return result is Ok<SaveResult> ? Results.NoContent() : result;
    }

    private static async Task<IResult> RenderAsync(RenderRequest request, HttpContext context, PermissionService permissions, PageService pages, PendingImageStore pending)
    {
        var access = await permissions.RequireReadAsync(context, request.SpaceId ?? "");
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (!SpacePaths.TryNormalizePage(request.Path, out var normalized))
        {
            return ProblemTypes.BadRequest("The page path is invalid.");
        }

        if (request.Markdown is null || Encoding.UTF8.GetByteCount(request.Markdown) > MaxMarkdownBytes)
        {
            return ProblemTypes.BadRequest("The content is missing or larger than 1 MiB.");
        }

        // Unsaved images of this edit are shown from their upload URL (003 R5); this also keeps them alive.
        var images = await pending.ResolveAsync(access.User!, access.Space!.Id, normalized, request.Attachments, context.RequestAborted);
        var urls = images.ToDictionary(i => i.RepositoryPath, i => $"/api/uploads/{i.Id}", StringComparer.Ordinal);
        return Results.Ok(new { html = pages.RenderPreview(access.Space!, normalized, request.Markdown, urls) });
    }

    private static async Task<IResult> HistoryAsync(
        string spaceId, string path, string? cursor, int? limit, string? version, HttpContext context, PermissionService permissions, PageService pages, HistoryService history)
    {
        var access = await permissions.RequireReadAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (!SpacePaths.TryNormalizePage(path, out var normalized))
        {
            return ProblemTypes.NotFound();
        }

        var head = pages.GetHead(access.Space!);
        if (head is null)
        {
            return SpacesEndpoints.SpaceUnavailable(access.Space!);
        }

        // Optional start commit (002 api-changes.md §1): history as of an older version.
        if (!string.IsNullOrEmpty(version))
        {
            switch (history.CheckStart(access.Space!, head, version))
            {
                case HistoryStart.Malformed:
                    return ProblemTypes.BadRequest("The version must be a full commit id.");
                case HistoryStart.NotFound:
                    return ProblemTypes.NotFound();
            }

            head = version;
        }

        var result = history.GetHistory(access.Space!, head, normalized, cursor, limit);
        return result.Items.Count == 0 && cursor is null ? ProblemTypes.NotFound() : Results.Ok(result);
    }

    private static async Task<IResult> DiffAsync(
        string spaceId, string path, string? from, string? to, HttpContext context, PermissionService permissions, HistoryService history)
    {
        var access = await permissions.RequireReadAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (!SpacePaths.TryNormalizePage(path, out var normalized) || from is null || to is null || !PageService.IsCommitId(from) || !PageService.IsCommitId(to))
        {
            return ProblemTypes.BadRequest("A page path and two full commit ids are required.");
        }

        var fromSource = history.GetSource(access.Space!, from, normalized);
        var toSource = history.GetSource(access.Space!, to, normalized);
        return fromSource is null || toSource is null
            ? ProblemTypes.NotFound()
            : Results.Ok(new { fromSource, toSource });
    }

    private static IResult? Validate(string path, string? message, out string normalized)
    {
        if (!SpacePaths.TryNormalizePage(path, out normalized))
        {
            return ProblemTypes.BadRequest("The page path is invalid.", "Paths are relative to the space, end in .md and contain no '.' or '..' segments.");
        }

        var trimmed = message?.Trim() ?? "";
        if (trimmed.Length is 0 or > MaxMessageLength)
        {
            return ProblemTypes.BadRequest($"A change description of 1–{MaxMessageLength} characters is required.");
        }

        return null;
    }
}

public sealed record SaveResult(PageVersionRef Version, bool Merged, IReadOnlyList<string> MergedAuthors);

/// <summary>Maps <see cref="PageWriter"/> outcomes to HTTP results.</summary>
public sealed class PageWriteService(
    PageWriter writer,
    HostingProviders providers,
    UserService users,
    SpaceRegistry registry,
    SpaceSynchronizer synchronizer,
    ILogger<PageWriteService> logger)
{
    public async Task<IResult> WriteAsync(SpaceAccess access, PageChange change, CancellationToken cancellationToken)
    {
        var space = access.Space!;
        var user = access.User!;
        if (registry.GetStatus(space).State == Data.SpaceState.Unavailable)
        {
            return SpacesEndpoints.SpaceUnavailable(space);
        }

        GitCredentials credentials;
        try
        {
            credentials = await providers.For(space).GetUserGitCredentialsAsync(user, space, cancellationToken);
        }
        catch (Hosting.AzureDevOps.PatRequiredException ex)
        {
            return ProblemTypes.Forbidden("pat-required", "A personal access token is required.", ex.Message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException and not ReauthenticationRequiredException)
        {
            logger.LogWarning(ex, "Could not obtain git credentials for user {UserId} on space {SpaceId}.", user.Id, space.Id);
            return ProblemTypes.Unavailable("hosting-unavailable", "The git hosting platform is not available.", "Your changes were not saved. Try again later.");
        }

        var author = new CommitAuthor(user.DisplayName, users.CommitEmail(user));
        var outcome = await writer.SaveAsync(space, change, author, credentials, cancellationToken);

        switch (outcome)
        {
            case SaveOutcome.Saved saved:
                await synchronizer.MarkHeadAsync(space, saved.Version.CommitId, cancellationToken);
                return TypedResults.Ok(new SaveResult(saved.Version, saved.Merged, saved.MergedAuthors));
            case SaveOutcome.Conflict conflict:
                return Results.Problem(
                    title: "The page was changed by someone else.",
                    detail: "Review the differences and save again.",
                    statusCode: StatusCodes.Status409Conflict,
                    type: ProblemTypes.For("edit-conflict"),
                    extensions: new Dictionary<string, object?>
                    {
                        ["baseSource"] = conflict.BaseSource,
                        ["theirsSource"] = conflict.TheirsSource,
                        ["theirsVersion"] = conflict.TheirsVersion,
                        ["theirsAuthors"] = conflict.TheirsAuthors,
                        ["mineSource"] = conflict.MineSource,
                    });
            case SaveOutcome.AttachmentExists exists:
                return Results.Problem(
                    title: "An image with the same name already exists.",
                    detail: $"'{exists.SpacePath}' is already in the repository. Remove the image from the page and paste it again.",
                    statusCode: StatusCodes.Status409Conflict,
                    type: ProblemTypes.For("attachment-exists"));
            case SaveOutcome.PageExists:
                return Results.Problem(title: "A page with this path already exists.", statusCode: StatusCodes.Status409Conflict, type: ProblemTypes.For("page-exists"));
            case SaveOutcome.PageMissing:
                return ProblemTypes.NotFound("The page does not exist in the version the edit started from.");
            case SaveOutcome.InvalidBase:
                return ProblemTypes.BadRequest("The version the edit started from is unknown.");
            case SaveOutcome.Rejected rejected:
                return ProblemTypes.Forbidden("push-rejected", "The git hosting platform rejected the change.", rejected.Reason);
            case SaveOutcome.HostingUnavailable unavailable:
                return ProblemTypes.Unavailable("hosting-unavailable", "The git hosting platform is not available.", unavailable.Reason);
            default:
                throw new InvalidOperationException($"Unexpected outcome {outcome}.");
        }
    }
}
