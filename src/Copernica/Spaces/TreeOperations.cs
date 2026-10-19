using System.Collections.Concurrent;
using System.Text;
using Copernica.Git;
using Copernica.Hosting;
using Copernica.Rendering;
using LibGit2Sharp;

namespace Copernica.Spaces;

public static class TreeItemKind
{
    public const string Page = "page";
    public const string Folder = "folder";
}

public sealed record MoveOperation(string Base, string Kind, string From, string To, string? Retitle, string Message);

public sealed record DeleteFolderOperation(string Base, string Folder, int? ExpectedPageCount, string Message);

/// <param name="Before">Name of the sibling the item goes before; null puts it last.</param>
public sealed record ReorderOperation(string Base, string Folder, string Item, string? Before, string? Message);

/// <summary>What a move does (dry run) or did.</summary>
public sealed record MoveEffects(MoveMap Map, string Path, int PageCount, int FileCount, IReadOnlyList<string> LinkingPages);

public sealed record FolderContents(int PageCount, int FileCount);

public abstract record TreeOutcome
{
    public sealed record Moved(MoveEffects Effects, string CommitId) : TreeOutcome;

    public sealed record MovePreview(MoveEffects Effects) : TreeOutcome;

    public sealed record FolderDeleted(FolderContents Contents, string CommitId) : TreeOutcome;

    public sealed record FolderPreview(FolderContents Contents) : TreeOutcome;

    public sealed record Reordered(string CommitId) : TreeOutcome;

    /// <summary>Request is malformed (400 <c>validation</c>).</summary>
    public sealed record Invalid(string Title) : TreeOutcome;

    /// <summary>Move onto itself or into its own subtree (400 <c>invalid-move</c>).</summary>
    public sealed record InvalidMove(string Title) : TreeOutcome;

    public sealed record TargetExists(string Path) : TreeOutcome;

    /// <summary>The tree no longer matches what the user saw (409 <c>tree-changed</c>).</summary>
    public sealed record TreeChanged(string Detail, int? PageCount = null) : TreeOutcome;

    public sealed record Rejected(string Reason) : TreeOutcome;

    public sealed record HostingUnavailable(string Reason) : TreeOutcome;
}

/// <summary>
/// Rename, move and delete of pages and folders, each as exactly one commit computed on the
/// fetched branch tip (005 research R1, R2). Links to moved files are rewritten in the same
/// commit (R7) and the commit carries <c>Copernica-Moved</c> trailers (R3).
/// </summary>
public sealed class TreeOperations(RepositoryWriter writer, LinkRewriter links)
{
    // ----- Move -----

    public async Task<TreeOutcome> MoveAsync(Space space, MoveOperation operation, CommitAuthor author, GitCredentials credentials, CancellationToken cancellationToken)
    {
        var outcome = await writer.WriteAsync<TreeOutcome>(space, context =>
        {
            var plan = PlanMove(context.Repository, space, context.Tip, operation, dryRun: false);
            if (plan.Failure is not null)
            {
                return new WritePlan<TreeOutcome>.Fail(plan.Failure);
            }

            var message = RepositoryWriter.NormalizeMessage(MoveTrailers.Append(operation.Message, plan.Effects!.Map.Roots));
            var commit = context.Repository.ObjectDatabase.CreateCommit(context.Signature, context.Signature, message, plan.Tree!, [context.Tip], prettifyMessage: false);
            return new WritePlan<TreeOutcome>.Push(commit, new TreeOutcome.Moved(plan.Effects, commit.Sha));
        }, author, credentials, cancellationToken);

        return Unwrap(outcome);
    }

    /// <summary>The effects of a move on the current head, without committing anything.</summary>
    public TreeOutcome PreviewMove(Space space, string head, MoveOperation operation)
    {
        using var repo = new Repository(space.MirrorPath);
        if (repo.Lookup<Commit>(head) is not { } tip)
        {
            return new TreeOutcome.HostingUnavailable("The space has no content yet.");
        }

        var plan = PlanMove(repo, space, tip, operation, dryRun: true);
        return plan.Failure ?? new TreeOutcome.MovePreview(plan.Effects!);
    }

    private sealed record MovePlan(Tree? Tree, MoveEffects? Effects, TreeOutcome? Failure);

    /// <param name="dryRun">Only compute the effects: no objects are written (research R9).</param>
    private MovePlan PlanMove(Repository repo, Space space, Commit tip, MoveOperation operation, bool dryRun)
    {
        var isFolder = operation.Kind == TreeItemKind.Folder;
        if (!PageService.IsCommitId(operation.Base) || repo.Lookup<Commit>(operation.Base) is not { } baseCommit)
        {
            return Failed(new TreeOutcome.Invalid("The version the tree was loaded at is unknown."));
        }

        var from = operation.From;
        var to = operation.To;
        if (string.Equals(from, to, StringComparison.Ordinal))
        {
            return Failed(new TreeOutcome.InvalidMove("The new location is the same as the current one."));
        }

        if (isFolder && to.StartsWith(from + "/", StringComparison.Ordinal))
        {
            return Failed(new TreeOutcome.InvalidMove("A folder cannot be moved into itself."));
        }

        if (!IsKind(baseCommit, space, from, isFolder) || !IsKind(tip, space, from, isFolder))
        {
            return Failed(new TreeOutcome.TreeChanged($"“{from}” was moved or deleted by someone else."));
        }

        if (Collides(tip, space, from, to))
        {
            return Failed(new TreeOutcome.TargetExists(to));
        }

        // Every file that moves, old → new space path.
        var files = isFolder
            ? FilesUnder(tip, space, from).Select(p => new KeyValuePair<string, string>(p, to + p[from.Length..])).ToList()
            : [new KeyValuePair<string, string>(from, to)];
        var map = new MoveMap([new MoveRecord(from, to, isFolder)], files);

        // Pages: moved ones get their own relative links (and optionally the title) updated,
        // the others only when they link to something that moved.
        var linking = new List<string>();
        var changed = new List<(string RepositoryPath, byte[] Content, Mode Mode)>();
        foreach (var page in PagesAt(tip, space))
        {
            var newPath = map.Map(page.Path);
            var text = Text.Read(page.Blob);
            string? updated;
            if (newPath is not null)
            {
                updated = links.Rewrite(text.Value, page.Path, newPath, space.Id, map);
                if (!isFolder && operation.Retitle is { Length: > 0 } title)
                {
                    updated = PageTitle.ReplaceFirstHeading(updated ?? text.Value, title) ?? updated;
                }
            }
            else
            {
                updated = LinkRewriter.MayReference(text.Value, map) ? links.Rewrite(text.Value, page.Path, page.Path, space.Id, map) : null;
                if (updated is not null)
                {
                    linking.Add(page.Path);
                }
            }

            if (updated is not null && updated != text.Value)
            {
                changed.Add((space.ToRepositoryPath(newPath ?? page.Path), text.Encode(updated), page.Mode));
            }
        }

        var effects = new MoveEffects(
            map,
            to,
            files.Count(f => PageTreeBuilder.IsPage(f.Key)),
            files.Count,
            linking.Order(StringComparer.Ordinal).ToList());
        if (dryRun)
        {
            return new MovePlan(null, effects, null);
        }

        var definition = TreeDefinition.From(tip.Tree);
        definition.Remove(space.ToRepositoryPath(from));
        foreach (var (oldPath, newPath) in files)
        {
            var entry = tip[space.ToRepositoryPath(oldPath)];
            definition.Add(space.ToRepositoryPath(newPath), (Blob)entry.Target, entry.Mode);
        }

        var ids = WriteBlobs(space, changed.Select(c => c.Content).ToList());
        for (var i = 0; i < changed.Count; i++)
        {
            definition.Add(changed[i].RepositoryPath, repo.Lookup<Blob>(ids[i]), changed[i].Mode);
        }

        // The order files of the folders the item leaves and enters (research R8).
        var orders = new OrderFiles(repo, space, tip, definition);
        var source = SpacePaths.Parent(from);
        var destination = SpacePaths.Parent(to);
        var oldEntry = FolderOrder.EntryFor(SpacePaths.Name(from), !isFolder);
        var newEntry = FolderOrder.EntryFor(SpacePaths.Name(to), !isFolder);
        var stillUsed = OrderFiles.Children(tip, space, source)
            .Any(c => c.IsPage == isFolder && string.Equals(c.Entry, oldEntry, StringComparison.OrdinalIgnoreCase));
        if (source == destination)
        {
            orders.Renamed(source, oldEntry, newEntry, stillUsed);
        }
        else
        {
            orders.Removed(source, oldEntry, stillUsed);
            orders.Added(destination, newEntry);
        }

        return new MovePlan(repo.ObjectDatabase.CreateTree(definition), effects, null);

        static MovePlan Failed(TreeOutcome outcome) => new(null, null, outcome);
    }

    // ----- Delete folder -----

    public async Task<TreeOutcome> DeleteFolderAsync(Space space, DeleteFolderOperation operation, CommitAuthor author, GitCredentials credentials, CancellationToken cancellationToken)
    {
        var outcome = await writer.WriteAsync<TreeOutcome>(space, context =>
        {
            var (repo, tip, signature) = context;
            if (CheckFolder(repo, space, tip, operation) is { } failure)
            {
                return new WritePlan<TreeOutcome>.Fail(failure);
            }

            var contents = Contents(tip, space, operation.Folder);
            if (operation.ExpectedPageCount != contents.PageCount)
            {
                return new WritePlan<TreeOutcome>.Fail(new TreeOutcome.TreeChanged(
                    $"The folder now contains {contents.PageCount} pages.", contents.PageCount));
            }

            var definition = TreeDefinition.From(tip.Tree);
            definition.Remove(space.ToRepositoryPath(operation.Folder));
            var parent = SpacePaths.Parent(operation.Folder);
            var entry = FolderOrder.EntryFor(SpacePaths.Name(operation.Folder), isPage: false);
            new OrderFiles(repo, space, tip, definition).Removed(
                parent,
                entry,
                stillUsed: OrderFiles.Children(tip, space, parent).Any(c => c.IsPage && string.Equals(c.Entry, entry, StringComparison.OrdinalIgnoreCase)));
            var tree = repo.ObjectDatabase.CreateTree(definition);
            var commit = repo.ObjectDatabase.CreateCommit(signature, signature, RepositoryWriter.NormalizeMessage(operation.Message), tree, [tip], prettifyMessage: false);
            return new WritePlan<TreeOutcome>.Push(commit, new TreeOutcome.FolderDeleted(contents, commit.Sha));
        }, author, credentials, cancellationToken);

        return Unwrap(outcome);
    }

    public TreeOutcome PreviewDeleteFolder(Space space, string head, DeleteFolderOperation operation)
    {
        using var repo = new Repository(space.MirrorPath);
        if (repo.Lookup<Commit>(head) is not { } tip)
        {
            return new TreeOutcome.HostingUnavailable("The space has no content yet.");
        }

        return CheckFolder(repo, space, tip, operation) ?? new TreeOutcome.FolderPreview(Contents(tip, space, operation.Folder));
    }

    private static TreeOutcome? CheckFolder(Repository repo, Space space, Commit tip, DeleteFolderOperation operation)
    {
        if (!PageService.IsCommitId(operation.Base) || repo.Lookup<Commit>(operation.Base) is null)
        {
            return new TreeOutcome.Invalid("The version the tree was loaded at is unknown.");
        }

        return IsKind(tip, space, operation.Folder, folder: true)
            ? null
            : new TreeOutcome.TreeChanged($"“{operation.Folder}” was moved or deleted by someone else.");
    }

    private static FolderContents Contents(Commit commit, Space space, string folder)
    {
        var files = FilesUnder(commit, space, folder);
        return new FolderContents(files.Count(PageTreeBuilder.IsPage), files.Count);
    }

    // ----- Reorder -----

    public async Task<TreeOutcome> ReorderAsync(Space space, ReorderOperation operation, CommitAuthor author, GitCredentials credentials, CancellationToken cancellationToken)
    {
        var outcome = await writer.WriteAsync<TreeOutcome>(space, context =>
        {
            var (repo, tip, signature) = context;
            if (!PageService.IsCommitId(operation.Base) || repo.Lookup<Commit>(operation.Base) is null)
            {
                return new WritePlan<TreeOutcome>.Fail(new TreeOutcome.Invalid("The version the tree was loaded at is unknown."));
            }

            var definition = TreeDefinition.From(tip.Tree);
            var orders = new OrderFiles(repo, space, tip, definition);
            var children = orders.Ordered(operation.Folder).ToList();
            var item = children.FirstOrDefault(c => c.Name == operation.Item);
            if (item is null || operation.Before is not null && children.All(c => c.Name != operation.Before))
            {
                return new WritePlan<TreeOutcome>.Fail(new TreeOutcome.TreeChanged("The folder changed since you opened it."));
            }

            // Computed on the tip, so items added meanwhile keep their place (spec edge case).
            children.Remove(item);
            var index = operation.Before is null ? children.Count : children.FindIndex(c => c.Name == operation.Before);
            children.Insert(index, item);
            var entries = children.Select(c => c.Entry).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var existing = orders.Get(operation.Folder);
            var updated = existing is null ? FolderOrder.Create(entries) : existing.Rewrite(entries);
            if (existing is not null && updated.ToBytes().AsSpan().SequenceEqual(existing.ToBytes()))
            {
                return new WritePlan<TreeOutcome>.NoChange(new TreeOutcome.Reordered(tip.Sha));
            }

            orders.Set(operation.Folder, updated);
            var message = operation.Message is { Length: > 0 } given
                ? given
                : $"Reorder {(operation.Folder.Length == 0 ? "root" : operation.Folder)}: move {operation.Item} {(operation.Before is null ? "to the end" : $"before {operation.Before}")}";
            var commit = repo.ObjectDatabase.CreateCommit(signature, signature, RepositoryWriter.NormalizeMessage(message), repo.ObjectDatabase.CreateTree(definition), [tip], prettifyMessage: false);
            return new WritePlan<TreeOutcome>.Push(commit, new TreeOutcome.Reordered(commit.Sha));
        }, author, credentials, cancellationToken);

        return Unwrap(outcome);
    }

    // ----- Shared -----

    /// <summary>
    /// Writes blobs in parallel, one repository instance per worker: writing loose objects
    /// dominates large moves on some file systems (SC-006, research R14). Returns their ids in order.
    /// </summary>
    private static ObjectId[] WriteBlobs(Space space, IReadOnlyList<byte[]> contents)
    {
        var ids = new ObjectId[contents.Count];
        if (contents.Count == 0)
        {
            return ids;
        }

        var workers = Math.Clamp(Environment.ProcessorCount, 1, 8);
        var chunk = (contents.Count + workers - 1) / workers;
        Parallel.ForEach(Partitioner.Create(0, contents.Count, chunk), new ParallelOptions { MaxDegreeOfParallelism = workers }, range =>
        {
            using var repo = new Repository(space.MirrorPath);
            for (var i = range.Item1; i < range.Item2; i++)
            {
                ids[i] = repo.ObjectDatabase.CreateBlob(new MemoryStream(contents[i])).Id;
            }
        });
        return ids;
    }

    private static TreeOutcome Unwrap(WriteOutcome<TreeOutcome> outcome) => outcome switch
    {
        WriteOutcome<TreeOutcome>.Done done => done.Value,
        WriteOutcome<TreeOutcome>.Failed failed => (TreeOutcome)failed.Reason,
        WriteOutcome<TreeOutcome>.Rejected rejected => new TreeOutcome.Rejected(rejected.Reason),
        WriteOutcome<TreeOutcome>.HostingUnavailable unavailable => new TreeOutcome.HostingUnavailable(unavailable.Reason),
        _ => throw new InvalidOperationException($"Unexpected outcome {outcome}."),
    };

    private static bool IsKind(Commit commit, Space space, string path, bool folder) =>
        commit[space.ToRepositoryPath(path)]?.Target is var target && (folder ? target is Tree : target is Blob && PageTreeBuilder.IsPage(path));

    /// <summary>
    /// The target exists, or differs only in letter case from another item in its folder (which
    /// would break checkouts on Windows and macOS). A case-only rename of the item itself is fine.
    /// </summary>
    private static bool Collides(Commit tip, Space space, string from, string to)
    {
        if (tip[space.ToRepositoryPath(to)] is not null)
        {
            return true;
        }

        var parent = SpacePaths.Parent(to);
        var folderPath = parent.Length == 0 ? space.Folder : space.ToRepositoryPath(parent);
        if ((folderPath.Length == 0 ? tip.Tree : tip[folderPath]?.Target as Tree) is not { } folder)
        {
            return false;
        }

        var name = SpacePaths.Name(to);
        return folder.Any(e => string.Equals(e.Name, name, StringComparison.OrdinalIgnoreCase)
                               && !string.Equals(SpacePaths.Combine(parent, e.Name), from, StringComparison.Ordinal));
    }

    /// <summary>Space paths of every file under <paramref name="folder"/>.</summary>
    private static List<string> FilesUnder(Commit commit, Space space, string folder)
    {
        var result = new List<string>();
        if (commit[space.ToRepositoryPath(folder)]?.Target is Tree tree)
        {
            Walk(tree, folder, result);
        }

        return result;

        static void Walk(Tree tree, string prefix, List<string> result)
        {
            foreach (var entry in tree)
            {
                var path = $"{prefix}/{entry.Name}";
                switch (entry.Target)
                {
                    case Tree child:
                        Walk(child, path, result);
                        break;
                    case Blob:
                        result.Add(path);
                        break;
                }
            }
        }
    }

    private sealed record PageEntry(string Path, Blob Blob, Mode Mode);

    /// <summary>Every page of the space at <paramref name="commit"/>.</summary>
    private static IEnumerable<PageEntry> PagesAt(Commit commit, Space space)
    {
        var root = space.Folder.Length == 0 ? commit.Tree : commit[space.Folder]?.Target as Tree;
        return root is null ? [] : Walk(root, "");

        static IEnumerable<PageEntry> Walk(Tree tree, string prefix)
        {
            foreach (var entry in tree)
            {
                var path = prefix.Length == 0 ? entry.Name : $"{prefix}/{entry.Name}";
                if (entry.Target is Tree child)
                {
                    foreach (var page in Walk(child, path))
                    {
                        yield return page;
                    }
                }
                else if (entry.Target is Blob blob && PageTreeBuilder.IsPage(path))
                {
                    yield return new PageEntry(path, blob, entry.Mode);
                }
            }
        }
    }

    /// <summary>Page text that is written back with the same byte order mark it was read with.</summary>
    private sealed record Text(string Value, bool Bom)
    {
        private static readonly byte[] Preamble = Encoding.UTF8.GetPreamble();

        public static Text Read(Blob blob)
        {
            using var stream = blob.GetContentStream();
            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            var bytes = buffer.ToArray();
            var bom = bytes.AsSpan().StartsWith(Preamble);
            return new Text(new UTF8Encoding(false).GetString(bom ? bytes[Preamble.Length..] : bytes), bom);
        }

        public byte[] Encode(string value)
        {
            var bytes = new UTF8Encoding(false).GetBytes(value);
            return Bom ? [.. Preamble, .. bytes] : bytes;
        }
    }
}
