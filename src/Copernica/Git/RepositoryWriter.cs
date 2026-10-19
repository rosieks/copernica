using Copernica.Hosting;
using Copernica.Spaces;
using LibGit2Sharp;

namespace Copernica.Git;

/// <summary>What a write plan wants done with the branch tip it was given.</summary>
public abstract record WritePlan<T>
{
    /// <summary>Push <paramref name="Candidate"/> (a descendant of the tip) and report <paramref name="Value"/>.</summary>
    public sealed record Push(Commit Candidate, T Value) : WritePlan<T>;

    /// <summary>Nothing to change; report <paramref name="Value"/> without pushing.</summary>
    public sealed record NoChange(T Value) : WritePlan<T>;

    /// <summary>The plan refuses the change; <paramref name="Reason"/> is passed through to the caller.</summary>
    public sealed record Fail(object Reason) : WritePlan<T>;
}

public abstract record WriteOutcome<T>
{
    public sealed record Done(T Value) : WriteOutcome<T>;

    public sealed record Failed(object Reason) : WriteOutcome<T>;

    public sealed record Rejected(string Reason) : WriteOutcome<T>;

    public sealed record HostingUnavailable(string Reason) : WriteOutcome<T>;
}

/// <summary>The fetched branch tip a plan works on, with the signature to commit with.</summary>
public sealed record WriteContext(Repository Repository, Commit Tip, Signature Signature);

/// <summary>
/// Turns one change into exactly one commit on the space branch, pushed with the user's
/// credentials (001 research.md R5, 005 research R1). Under the space lock it fetches, lets the
/// plan build a commit on the fetched tip, and pushes; when the branch moved meanwhile it
/// fetches and asks the plan again. Never force-pushes; mirror refs move only after the push.
/// </summary>
public sealed class RepositoryWriter(SpaceRegistry registry, MirrorRepository mirror, TimeProvider time, ILogger<RepositoryWriter> logger)
{
    private const int MaxAttempts = 3;
    private const string PushRefPrefix = "refs/copernica/push/";

    public async Task<WriteOutcome<T>> WriteAsync<T>(
        Space space,
        Func<WriteContext, WritePlan<T>> plan,
        CommitAuthor author,
        GitCredentials credentials,
        CancellationToken cancellationToken)
    {
        using var _ = await registry.LockAsync(space, cancellationToken);
        return await Task.Run(() => Write(space, plan, author, credentials), cancellationToken);
    }

    private WriteOutcome<T> Write<T>(Space space, Func<WriteContext, WritePlan<T>> plan, CommitAuthor author, GitCredentials credentials)
    {
        mirror.EnsureInitialized(space);

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                mirror.Fetch(space, credentials);
            }
            catch (LibGit2SharpException ex)
            {
                logger.LogWarning(ex, "Fetch before save failed for space {SpaceId}.", space.Id);
                return new WriteOutcome<T>.HostingUnavailable($"The repository could not be reached: {ex.Message}");
            }

            using var repo = new Repository(space.MirrorPath);
            var tip = repo.Refs[space.TrackingRef]?.ResolveToDirectReference()?.Target as Commit;
            if (tip is null)
            {
                return new WriteOutcome<T>.HostingUnavailable($"Branch '{space.Branch}' does not exist.");
            }

            var signature = new Signature(author.Name, author.Email, time.GetUtcNow());
            switch (plan(new WriteContext(repo, tip, signature)))
            {
                case WritePlan<T>.Fail fail:
                    return new WriteOutcome<T>.Failed(fail.Reason);
                case WritePlan<T>.NoChange none:
                    return new WriteOutcome<T>.Done(none.Value);
                case WritePlan<T>.Push push when push.Candidate.Sha == tip.Sha:
                    return new WriteOutcome<T>.Done(push.Value);
                case WritePlan<T>.Push push:
                    switch (Publish(repo, space, push.Candidate, credentials))
                    {
                        case PushResult.Ok:
                            repo.Refs.UpdateTarget(repo.Refs[space.TrackingRef], push.Candidate.Id, logMessage: "copernica: save");
                            return new WriteOutcome<T>.Done(push.Value);
                        case PushResult.Stale:
                            logger.LogInformation("Branch of space {SpaceId} moved during save; retrying ({Attempt}/{Max}).", space.Id, attempt, MaxAttempts);
                            continue;
                        case PushResult.Rejected rejected:
                            return new WriteOutcome<T>.Rejected(rejected.Reason);
                        case PushResult.Unreachable unreachable:
                            return new WriteOutcome<T>.HostingUnavailable(unreachable.Reason);
                    }

                    break;
            }
        }

        return new WriteOutcome<T>.HostingUnavailable("The branch kept changing while saving. Please try again.");
    }

    /// <summary>Commit messages end with exactly one newline and use LF line endings.</summary>
    public static string NormalizeMessage(string message) => message.Trim().ReplaceLineEndings("\n") + "\n";

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
}
