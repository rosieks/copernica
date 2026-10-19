using System.Text;
using Copernica.Hosting;
using Copernica.Spaces;
using LibGit2Sharp;

namespace Copernica.Git;

public sealed record PageChange(string Path, string? Content, string Message, PageVersionRef? Base)
{
    /// <summary>Files committed together with the page in the same commit (003 FR-007), e.g. pasted images.</summary>
    public IReadOnlyList<AddedFile> Files { get; init; } = [];
}

/// <summary>A new file at a space-relative path; never overwrites an existing file.</summary>
public sealed record AddedFile(string SpacePath, byte[] Content);

public sealed record CommitAuthor(string Name, string Email);

public abstract record SaveOutcome
{
    /// <param name="MergedAuthors">
    /// Authors (oldest first) of the commits that changed this page between the edit's base and
    /// the tip it was merged with; empty when nothing was merged into this page.
    /// </param>
    /// <param name="Path">
    /// Space path the page was saved at: differs from the requested path when the page was moved
    /// after the edit started (005 research R6).
    /// </param>
    public sealed record Saved(PageVersionRef Version, bool Merged, IReadOnlyList<string> MergedAuthors, string Path) : SaveOutcome;

    public sealed record Conflict(
        string BaseSource,
        string TheirsSource,
        PageVersionRef TheirsVersion,
        IReadOnlyList<string> TheirsAuthors,
        string MineSource) : SaveOutcome;

    public sealed record PageExists : SaveOutcome;

    /// <summary>A file to add already exists in the repository (003 contracts/api.md §3).</summary>
    public sealed record AttachmentExists(string SpacePath) : SaveOutcome;

    public sealed record PageMissing : SaveOutcome;

    /// <summary>The page was deleted after the edit started; the user's text is handed back (005 research R6).</summary>
    public sealed record PageDeleted(string MineSource) : SaveOutcome;

    public sealed record InvalidBase : SaveOutcome;

    public sealed record Rejected(string Reason) : SaveOutcome;

    public sealed record HostingUnavailable(string Reason) : SaveOutcome;
}

/// <summary>
/// Saves, creates and deletes single pages as one commit each through <see cref="RepositoryWriter"/>;
/// edits made on an older version are three-way merged with the tip (FR-016).
/// </summary>
public sealed class PageWriter(RepositoryWriter writer, MoveResolver moves)
{
    public async Task<SaveOutcome> SaveAsync(Space space, PageChange change, CommitAuthor author, GitCredentials credentials, CancellationToken cancellationToken)
    {
        var outcome = await writer.WriteAsync<SaveOutcome>(space, context => Plan(context, space, change), author, credentials, cancellationToken);
        return outcome switch
        {
            WriteOutcome<SaveOutcome>.Done done => done.Value,
            WriteOutcome<SaveOutcome>.Failed failed => (SaveOutcome)failed.Reason,
            WriteOutcome<SaveOutcome>.Rejected rejected => new SaveOutcome.Rejected(rejected.Reason),
            WriteOutcome<SaveOutcome>.HostingUnavailable unavailable => new SaveOutcome.HostingUnavailable(unavailable.Reason),
            _ => throw new InvalidOperationException($"Unexpected outcome {outcome}."),
        };
    }

    private WritePlan<SaveOutcome> Plan(WriteContext context, Space space, PageChange change)
    {
        var (repo, tip, signature) = context;
        var repositoryPath = space.ToRepositoryPath(change.Path);
        var targetPath = change.Path;

        Commit baseCommit;
        if (change.Base is null)
        {
            // Creating a page: the base is the current tip and the path must be free.
            if (tip[repositoryPath] is not null)
            {
                return new WritePlan<SaveOutcome>.Fail(new SaveOutcome.PageExists());
            }

            baseCommit = tip;
        }
        else
        {
            if (!PageService.IsCommitId(change.Base.CommitId) || repo.Lookup<Commit>(change.Base.CommitId) is not { } found)
            {
                return new WritePlan<SaveOutcome>.Fail(new SaveOutcome.InvalidBase());
            }

            baseCommit = found;
            if (baseCommit[repositoryPath] is null)
            {
                return new WritePlan<SaveOutcome>.Fail(new SaveOutcome.PageMissing());
            }

            // The page was moved or deleted after the edit started (005 research R6).
            if (change.Content is not null && tip[repositoryPath] is null)
            {
                switch (moves.Resolve(space, tip.Sha, change.Path))
                {
                    case MoveResolution.Moved moved:
                        targetPath = moved.Path;
                        break;
                    case MoveResolution.Deleted:
                        return new WritePlan<SaveOutcome>.Fail(new SaveOutcome.PageDeleted(change.Content));
                }
            }
        }

        var targetRepositoryPath = space.ToRepositoryPath(targetPath);

        // Added files are new paths: never overwrite one that exists at the base or the tip.
        foreach (var file in change.Files)
        {
            var path = space.ToRepositoryPath(file.SpacePath);
            if (baseCommit[path] is not null || tip[path] is not null)
            {
                return new WritePlan<SaveOutcome>.Fail(new SaveOutcome.AttachmentExists(file.SpacePath));
            }
        }

        var message = RepositoryWriter.NormalizeMessage(change.Message);

        // The edit's starting point. When the page moved meanwhile, a synthetic ancestor that
        // already contains the move lets the merge combine just the contents (005 research R6).
        var mineBase = baseCommit;
        var theirs = tip;
        if (targetRepositoryPath != repositoryPath)
        {
            var moved = TreeDefinition.From(baseCommit.Tree);
            var entry = baseCommit[repositoryPath];
            moved.Remove(repositoryPath);
            moved.Add(targetRepositoryPath, (Blob)entry.Target, entry.Mode);
            mineBase = repo.ObjectDatabase.CreateCommit(signature, signature, "base\n", repo.ObjectDatabase.CreateTree(moved), [], prettifyMessage: false);
            theirs = repo.ObjectDatabase.CreateCommit(signature, signature, "tip\n", tip.Tree, [mineBase], prettifyMessage: false);
        }

        var definition = TreeDefinition.From(mineBase.Tree);
        foreach (var file in change.Files)
        {
            var blob = repo.ObjectDatabase.CreateBlob(new MemoryStream(file.Content));
            definition.Add(space.ToRepositoryPath(file.SpacePath), blob, Mode.NonExecutableFile);
        }

        if (change.Content is null)
        {
            definition.Remove(repositoryPath);
        }
        else
        {
            var blob = repo.ObjectDatabase.CreateBlob(new MemoryStream(Encoding.UTF8.GetBytes(change.Content)));
            definition.Add(targetRepositoryPath, blob, Mode.NonExecutableFile);
        }

        if (change.Base is null)
        {
            Added(new OrderFiles(repo, space, mineBase, definition), mineBase, space, change.Path);
        }
        else if (change.Content is null)
        {
            var parent = SpacePaths.Parent(change.Path);
            var entry = FolderOrder.EntryFor(SpacePaths.Name(change.Path), isPage: true);
            new OrderFiles(repo, space, mineBase, definition).Removed(
                parent,
                entry,
                stillUsed: OrderFiles.Children(mineBase, space, parent).Any(c => !c.IsPage && string.Equals(c.Entry, entry, StringComparison.OrdinalIgnoreCase)));
        }

        var tree = repo.ObjectDatabase.CreateTree(definition);
        if (tree.Sha == baseCommit.Tree.Sha && baseCommit.Sha == tip.Sha)
        {
            return new WritePlan<SaveOutcome>.NoChange(Saved(tip, targetRepositoryPath, targetPath, merged: false, []));
        }

        var mine = repo.ObjectDatabase.CreateCommit(signature, signature, message, tree, [mineBase], prettifyMessage: false);
        if (baseCommit.Sha == tip.Sha)
        {
            return new WritePlan<SaveOutcome>.Push(mine, Saved(mine, targetRepositoryPath, targetPath, merged: false, []));
        }

        // The branch moved since the edit started: three-way merge in memory (FR-016).
        var merge = repo.ObjectDatabase.MergeCommits(mine, theirs, new MergeTreeOptions { FailOnConflict = false, SkipReuc = true });
        if (merge.Status != MergeTreeStatus.Succeeded)
        {
            return new WritePlan<SaveOutcome>.Fail(Conflict(repo, baseCommit, tip, repositoryPath, targetRepositoryPath, change.Content ?? ""));
        }

        var mergedAuthors = ChangedBy(repo, baseCommit, tip, targetRepositoryPath).Reverse().Distinct(StringComparer.Ordinal).ToList();
        if (merge.Tree.Sha == tip.Tree.Sha)
        {
            return new WritePlan<SaveOutcome>.NoChange(Saved(tip, targetRepositoryPath, targetPath, merged: true, mergedAuthors));
        }

        // Linear history: one single-parent commit on top of the tip (research.md R5).
        var merged = repo.ObjectDatabase.CreateCommit(signature, signature, message, merge.Tree, [tip], prettifyMessage: false);
        return new WritePlan<SaveOutcome>.Push(merged, Saved(merged, targetRepositoryPath, targetPath, merged: true, mergedAuthors));
    }

    /// <summary>
    /// A new page joins its folder's <c>.order</c>; when it also creates folders, the top-most new
    /// folder joins its parent's (005 FR-021).
    /// </summary>
    private static void Added(OrderFiles orders, Commit commit, Space space, string path)
    {
        var segments = path.Split('/');
        for (var i = 0; i < segments.Length - 1; i++)
        {
            var parent = string.Join('/', segments[..i]);
            if (!OrderFiles.Children(commit, space, parent).Any(c => !c.IsPage && c.Name == segments[i]))
            {
                orders.Added(parent, FolderOrder.EntryFor(segments[i], isPage: false));
                return;
            }
        }

        orders.Added(SpacePaths.Parent(path), FolderOrder.EntryFor(segments[^1], isPage: true));
    }

    private static SaveOutcome.Saved Saved(Commit commit, string repositoryPath, string spacePath, bool merged, IReadOnlyList<string> mergedAuthors) =>
        new(VersionOf(commit, repositoryPath), merged, mergedAuthors, spacePath);

    private static SaveOutcome.Conflict Conflict(Repository repo, Commit baseCommit, Commit tip, string basePath, string tipPath, string mine)
    {
        var authors = ChangedBy(repo, baseCommit, tip, tipPath).Distinct(StringComparer.Ordinal).ToList();

        return new SaveOutcome.Conflict(
            Text(baseCommit, basePath),
            Text(tip, tipPath),
            VersionOf(tip, tipPath),
            authors,
            mine);
    }

    /// <summary>Author names, newest first, of commits after <paramref name="baseCommit"/> that changed the file.</summary>
    private static IEnumerable<string> ChangedBy(Repository repo, Commit baseCommit, Commit tip, string repositoryPath) =>
        repo.Commits
            .QueryBy(repositoryPath, new CommitFilter { IncludeReachableFrom = tip, ExcludeReachableFrom = baseCommit })
            .Select(e => e.Commit.Author.Name)
            .ToList();

    private static string Text(Commit commit, string path) =>
        commit[path]?.Target is Blob blob ? blob.GetContentText() : "";

    internal static PageVersionRef VersionOf(Commit commit, string path) =>
        new(commit.Sha, (commit[path]?.Target as Blob)?.Sha);
}
