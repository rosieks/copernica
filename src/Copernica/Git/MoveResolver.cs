using Copernica.Spaces;
using LibGit2Sharp;
using Microsoft.Extensions.Caching.Memory;

namespace Copernica.Git;

/// <summary>Where a page that no longer exists went (005 data-model.md "MoveRecord / MoveResolver").</summary>
public abstract record MoveResolution
{
    public sealed record Exists : MoveResolution;

    public sealed record Moved(string Path, string MovedIn) : MoveResolution;

    /// <param name="LastVersion">The commit before the deletion, where the page still exists (its history starts there).</param>
    public sealed record Deleted(string DeletedIn, string LastVersion) : MoveResolution;

    public sealed record Unknown : MoveResolution;
}

/// <summary>
/// Follows page moves through history (005 research R3–R6): the <c>Copernica-Moved</c> trailers of
/// wiki moves first, git rename detection for moves made elsewhere. Nothing is stored; results
/// are cached per head commit.
/// </summary>
public sealed class MoveResolver(IMemoryCache cache)
{
    public const int MaxCommits = 10_000;
    public const int MaxHops = 20;

    /// <summary>The current location at <paramref name="head"/> of the space path <paramref name="path"/>.</summary>
    public MoveResolution Resolve(Space space, string head, string path) =>
        cache.GetOrCreate((nameof(MoveResolver), space.Id, head, path), entry =>
        {
            entry.SlidingExpiration = TimeSpan.FromMinutes(30);
            return Compute(space, head, path);
        })!;

    /// <summary>
    /// The path <paramref name="path"/> had in the parent of <paramref name="addedIn"/>, when that
    /// commit is a wiki move that produced it; null otherwise.
    /// </summary>
    public static string? PreviousPath(Commit addedIn, string path) =>
        MoveTrailers.Parse(addedIn.Message).Select(m => m.Unmap(path)).FirstOrDefault(p => p is not null);

    private static MoveResolution Compute(Space space, string head, string path)
    {
        using var repo = new Repository(space.MirrorPath);
        if (repo.Lookup<Commit>(head) is not { } tip)
        {
            return new MoveResolution.Unknown();
        }

        if (tip[space.ToRepositoryPath(path)] is not null)
        {
            return new MoveResolution.Exists();
        }

        var visited = new HashSet<string>(StringComparer.Ordinal) { path };
        var current = path;
        for (var hop = 0; hop < MaxHops; hop++)
        {
            var removal = FindRemoval(tip, space.ToRepositoryPath(current));
            if (removal is null)
            {
                return new MoveResolution.Unknown();
            }

            var next = MapThrough(repo, space, removal, current);
            if (next is null)
            {
                return new MoveResolution.Deleted(removal.Sha, removal.Parents.First().Sha);
            }

            if (tip[space.ToRepositoryPath(next)] is not null)
            {
                return new MoveResolution.Moved(next, removal.Sha);
            }

            if (!visited.Add(next))
            {
                return new MoveResolution.Unknown();
            }

            current = next;
        }

        return new MoveResolution.Unknown();
    }

    /// <summary>The newest commit on the first-parent chain where <paramref name="repositoryPath"/> stopped existing.</summary>
    private static Commit? FindRemoval(Commit tip, string repositoryPath)
    {
        var commit = tip;
        for (var i = 0; i < MaxCommits; i++)
        {
            var parent = commit.Parents.FirstOrDefault();
            if (parent is null)
            {
                return null;
            }

            if (commit[repositoryPath] is null && parent[repositoryPath] is not null)
            {
                return commit;
            }

            commit = parent;
        }

        return null;
    }

    private static string? MapThrough(Repository repo, Space space, Commit removal, string path)
    {
        foreach (var move in MoveTrailers.Parse(removal.Message))
        {
            if (move.Map(path) is { } mapped)
            {
                return mapped;
            }
        }

        var parent = removal.Parents.First();
        var repositoryPath = space.ToRepositoryPath(path);
        var changes = repo.Diff.Compare<TreeChanges>(parent.Tree, removal.Tree, new CompareOptions { Similarity = SimilarityOptions.Renames });
        var renamed = changes.Renamed.FirstOrDefault(c => c.OldPath == repositoryPath);
        return renamed is null ? null : space.ToSpacePath(renamed.Path);
    }
}
