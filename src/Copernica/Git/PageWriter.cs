using System.Text;
using Copernica.Hosting;
using Copernica.Spaces;
using LibGit2Sharp;

namespace Copernica.Git;

public sealed record PageChange(string Path, string? Content, string Message, PageVersionRef? Base);

public sealed record CommitAuthor(string Name, string Email);

public abstract record SaveOutcome
{
    public sealed record Saved(PageVersionRef Version, bool Merged) : SaveOutcome;

    public sealed record Conflict(
        string BaseSource,
        string TheirsSource,
        PageVersionRef TheirsVersion,
        IReadOnlyList<string> TheirsAuthors,
        string MineSource) : SaveOutcome;

    public sealed record PageExists : SaveOutcome;

    public sealed record PageMissing : SaveOutcome;

    public sealed record InvalidBase : SaveOutcome;

    public sealed record Rejected(string Reason) : SaveOutcome;

    public sealed record HostingUnavailable(string Reason) : SaveOutcome;
}

/// <summary>
/// Turns one save into exactly one commit on the space branch, pushed with the user's
/// credentials (research.md R5). Never force-pushes; mirror refs move only after the push.
/// </summary>
public sealed class PageWriter(SpaceRegistry registry, MirrorRepository mirror, TimeProvider time, ILogger<PageWriter> logger)
{
    private const int MaxAttempts = 3;
    private const string PushRefPrefix = "refs/copernica/push/";

    public async Task<SaveOutcome> SaveAsync(Space space, PageChange change, CommitAuthor author, GitCredentials credentials, CancellationToken cancellationToken)
    {
        using var _ = await registry.LockAsync(space, cancellationToken);
        return await Task.Run(() => Save(space, change, author, credentials), cancellationToken);
    }

    private SaveOutcome Save(Space space, PageChange change, CommitAuthor author, GitCredentials credentials)
    {
        mirror.EnsureInitialized(space);
        var repositoryPath = space.ToRepositoryPath(change.Path);

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                mirror.Fetch(space, credentials);
            }
            catch (LibGit2SharpException ex)
            {
                logger.LogWarning(ex, "Fetch before save failed for space {SpaceId}.", space.Id);
                return new SaveOutcome.HostingUnavailable($"The repository could not be reached: {ex.Message}");
            }

            using var repo = new Repository(space.MirrorPath);
            var tip = repo.Refs[space.TrackingRef]?.ResolveToDirectReference()?.Target as Commit;
            if (tip is null)
            {
                return new SaveOutcome.HostingUnavailable($"Branch '{space.Branch}' does not exist.");
            }

            var plan = Prepare(repo, tip, change, repositoryPath, author);
            if (plan.Outcome is not null)
            {
                return plan.Outcome;
            }

            var candidate = plan.Commit!;
            if (candidate.Sha == tip.Sha)
            {
                // Nothing changed; report the current version.
                return new SaveOutcome.Saved(VersionOf(tip, repositoryPath), Merged: false);
            }

            var push = Publish(repo, space, candidate, credentials);
            switch (push)
            {
                case PushResult.Ok:
                    repo.Refs.UpdateTarget(repo.Refs[space.TrackingRef], candidate.Id, logMessage: "copernica: save");
                    return new SaveOutcome.Saved(VersionOf(candidate, repositoryPath), plan.Merged);
                case PushResult.Stale:
                    logger.LogInformation("Branch of space {SpaceId} moved during save; retrying ({Attempt}/{Max}).", space.Id, attempt, MaxAttempts);
                    continue;
                case PushResult.Rejected rejected:
                    return new SaveOutcome.Rejected(rejected.Reason);
                case PushResult.Unreachable unreachable:
                    return new SaveOutcome.HostingUnavailable(unreachable.Reason);
            }
        }

        return new SaveOutcome.HostingUnavailable("The branch kept changing while saving. Please try again.");
    }

    private sealed record Plan(Commit? Commit, bool Merged, SaveOutcome? Outcome);

    private Plan Prepare(Repository repo, Commit tip, PageChange change, string repositoryPath, CommitAuthor author)
    {
        Commit baseCommit;
        if (change.Base is null)
        {
            // Creating a page: the base is the current tip and the path must be free.
            if (tip[repositoryPath] is not null)
            {
                return new Plan(null, false, new SaveOutcome.PageExists());
            }

            baseCommit = tip;
        }
        else
        {
            if (!PageService.IsCommitId(change.Base.CommitId) || repo.Lookup<Commit>(change.Base.CommitId) is not { } found)
            {
                return new Plan(null, false, new SaveOutcome.InvalidBase());
            }

            baseCommit = found;
            if (baseCommit[repositoryPath] is null)
            {
                return new Plan(null, false, new SaveOutcome.PageMissing());
            }
        }

        var signature = new Signature(author.Name, author.Email, time.GetUtcNow());
        var definition = TreeDefinition.From(baseCommit.Tree);
        if (change.Content is null)
        {
            definition.Remove(repositoryPath);
        }
        else
        {
            var blob = repo.ObjectDatabase.CreateBlob(new MemoryStream(Encoding.UTF8.GetBytes(change.Content)));
            definition.Add(repositoryPath, blob, Mode.NonExecutableFile);
        }

        var tree = repo.ObjectDatabase.CreateTree(definition);
        if (tree.Sha == baseCommit.Tree.Sha && baseCommit.Sha == tip.Sha)
        {
            return new Plan(tip, false, null);
        }

        var message = NormalizeMessage(change.Message);
        var mine = repo.ObjectDatabase.CreateCommit(signature, signature, message, tree, [baseCommit], prettifyMessage: false);
        if (baseCommit.Sha == tip.Sha)
        {
            return new Plan(mine, false, null);
        }

        // The branch moved since the edit started: three-way merge in memory (FR-016).
        var merge = repo.ObjectDatabase.MergeCommits(mine, tip, new MergeTreeOptions { FailOnConflict = false, SkipReuc = true });
        if (merge.Status != MergeTreeStatus.Succeeded)
        {
            return new Plan(null, false, Conflict(repo, baseCommit, tip, repositoryPath, change.Content ?? ""));
        }

        if (merge.Tree.Sha == tip.Tree.Sha)
        {
            return new Plan(tip, true, null);
        }

        // Linear history: one single-parent commit on top of the tip (research.md R5).
        var merged = repo.ObjectDatabase.CreateCommit(signature, signature, message, merge.Tree, [tip], prettifyMessage: false);
        return new Plan(merged, true, null);
    }

    private static SaveOutcome.Conflict Conflict(Repository repo, Commit baseCommit, Commit tip, string repositoryPath, string mine)
    {
        var authors = repo.Commits
            .QueryBy(repositoryPath, new CommitFilter { IncludeReachableFrom = tip, ExcludeReachableFrom = baseCommit })
            .Select(e => e.Commit.Author.Name)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return new SaveOutcome.Conflict(
            Text(baseCommit, repositoryPath),
            Text(tip, repositoryPath),
            VersionOf(tip, repositoryPath),
            authors,
            mine);
    }

    private abstract record PushResult
    {
        public sealed record Ok : PushResult;

        public sealed record Stale : PushResult;

        public sealed record Rejected(string Reason) : PushResult;

        public sealed record Unreachable(string Reason) : PushResult;
    }

    private PushResult Publish(Repository repo, Space space, Commit candidate, GitCredentials credentials)
    {
        if (!space.HasRemote)
        {
            // Repository kept only on the data volume: the mirror is the source of truth.
            return new PushResult.Ok();
        }

        if (CheckedOutBranchConflict(space) is { } reason)
        {
            return new PushResult.Rejected(reason);
        }

        var pushRef = PushRefPrefix + Guid.NewGuid().ToString("N");
        repo.Refs.Add(pushRef, candidate.Id);
        try
        {
            string? error = null;
            var options = new PushOptions { OnPushStatusError = e => error = e.Message };
            MirrorRepository.Apply(credentials, options);
            repo.Network.Push(repo.Network.Remotes[MirrorRepository.RemoteName], $"{pushRef}:refs/heads/{space.Branch}", options);

            if (error is null)
            {
                return new PushResult.Ok();
            }

            return IsStale(error) ? new PushResult.Stale() : new PushResult.Rejected(error);
        }
        catch (NonFastForwardException)
        {
            return new PushResult.Stale();
        }
        catch (LibGit2SharpException ex) when (IsStale(ex.Message))
        {
            return new PushResult.Stale();
        }
        catch (LibGit2SharpException ex)
        {
            logger.LogWarning(ex, "Push to space {SpaceId} failed.", space.Id);
            return IsRejection(ex.Message) ? new PushResult.Rejected(ex.Message) : new PushResult.Unreachable($"The repository could not be reached: {ex.Message}");
        }
        finally
        {
            repo.Refs.Remove(pushRef);
        }
    }

    /// <summary>
    /// Pushing to the checked-out branch of a non-bare local repository would leave its working
    /// tree out of date (git refuses this by default; libgit2's local transport does not), so the
    /// wiki refuses it explicitly (task T109).
    /// </summary>
    private static string? CheckedOutBranchConflict(Space space)
    {
        var url = MirrorRepository.NormalizeRemoteUrl(space.RemoteUrl!);
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && !uri.IsFile)
        {
            return null;
        }

        if (!Repository.IsValid(url))
        {
            return null;
        }

        using var target = new Repository(url);
        if (target.Info.IsBare || target.Head.CanonicalName != $"refs/heads/{space.Branch}")
        {
            return null;
        }

        return $"Branch '{space.Branch}' is checked out in the local repository '{url}', so saving would leave its working files out of date. " +
               "Point the space at a bare repository or at a branch that is not checked out.";
    }

    private static bool IsStale(string message) =>
        message.Contains("non-fast-forward", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("fetch first", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("cannot push because a reference that you are trying to update", StringComparison.OrdinalIgnoreCase);

    private static bool IsRejection(string message) =>
        message.Contains("403", StringComparison.Ordinal) ||
        message.Contains("401", StringComparison.Ordinal) ||
        message.Contains("rejected", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("denied", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("policy", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeMessage(string message) => message.Trim().ReplaceLineEndings("\n") + "\n";

    private static string Text(Commit commit, string path) =>
        commit[path]?.Target is Blob blob ? blob.GetContentText() : "";

    private static PageVersionRef VersionOf(Commit commit, string path) =>
        new(commit.Sha, (commit[path]?.Target as Blob)?.Sha);
}
