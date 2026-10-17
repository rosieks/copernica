using Copernica.Spaces;
using LibGit2Sharp;

namespace Copernica.Git;

/// <summary>A version of a page (contracts/openapi.yaml <c>PageVersion</c>).</summary>
public sealed record PageVersionDto(string CommitId, string Path, string AuthorName, string AuthorEmail, DateTimeOffset AuthoredAt, string Message);

public sealed record HistoryPage(IReadOnlyList<PageVersionDto> Items, string? NextCursor);

public enum HistoryStart
{
    Ok,

    /// <summary>The start version is not a full commit id.</summary>
    Malformed,

    /// <summary>The start version does not exist or is not on the space branch.</summary>
    NotFound,
}

/// <summary>Page history from git, following renames (FR-014).</summary>
public sealed class HistoryService
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 200;

    /// <summary>
    /// Checks a requested start version: it must be a full commit id reachable from the
    /// branch head, so callers cannot probe arbitrary objects in the mirror.
    /// </summary>
    public HistoryStart CheckStart(Space space, string head, string version)
    {
        if (!PageService.IsCommitId(version))
        {
            return HistoryStart.Malformed;
        }

        using var repo = new Repository(space.MirrorPath);
        if (repo.Lookup<Commit>(version) is not { } start || repo.Lookup<Commit>(head) is not { } tip)
        {
            return HistoryStart.NotFound;
        }

        return repo.ObjectDatabase.FindMergeBase(start, tip)?.Sha == start.Sha ? HistoryStart.Ok : HistoryStart.NotFound;
    }

    public HistoryPage GetHistory(Space space, string head, string path, string? cursor, int? limit)
    {
        var take = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);
        var skip = int.TryParse(cursor, out var offset) && offset > 0 ? offset : 0;

        using var repo = new Repository(space.MirrorPath);
        var entries = repo.Commits
            .QueryBy(space.ToRepositoryPath(path), new CommitFilter { IncludeReachableFrom = head, SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time })
            .Skip(skip)
            .Take(take + 1)
            .Select(e => new PageVersionDto(
                e.Commit.Sha,
                space.ToSpacePath(e.Path) ?? e.Path,
                e.Commit.Author.Name,
                e.Commit.Author.Email,
                e.Commit.Author.When,
                e.Commit.MessageShort))
            .ToList();

        var hasMore = entries.Count > take;
        return new HistoryPage(entries.Take(take).ToList(), hasMore ? (skip + take).ToString(System.Globalization.CultureInfo.InvariantCulture) : null);
    }

    /// <summary>Content of <paramref name="path"/> at <paramref name="commitId"/>, or empty when it did not exist.</summary>
    public string? GetSource(Space space, string commitId, string path)
    {
        using var repo = new Repository(space.MirrorPath);
        if (repo.Lookup<Commit>(commitId) is not { } commit)
        {
            return null;
        }

        return commit[space.ToRepositoryPath(path)]?.Target is Blob blob ? blob.GetContentText() : "";
    }
}
