using Copernica.Configuration;
using Copernica.Data;
using Copernica.Git;
using Copernica.Hosting;
using LibGit2Sharp;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Copernica.Spaces;

/// <summary>Brings one space's mirror up to date and records its status.</summary>
public sealed class SpaceSynchronizer(
    SpaceRegistry registry,
    MirrorRepository mirror,
    IServiceScopeFactory scopes,
    TimeProvider time,
    ILogger<SpaceSynchronizer> logger)
{
    public async Task SyncAsync(Space space, CancellationToken cancellationToken)
    {
        if (!space.IsValid)
        {
            return;
        }

        var previous = registry.GetStatus(space);
        SpaceStatus next;
        try
        {
            GitCredentials credentials;
            await using (var scope = scopes.CreateAsyncScope())
            {
                var providers = scope.ServiceProvider.GetRequiredService<HostingProviders>();
                credentials = await providers.For(space).GetSyncGitCredentialsAsync(space, cancellationToken);
            }

            using (await registry.LockAsync(space, cancellationToken))
            {
                await Task.Run(() =>
                {
                    mirror.EnsureInitialized(space);
                    mirror.Fetch(space, credentials);
                }, cancellationToken);
            }

            next = new SpaceStatus
            {
                SpaceId = space.Id,
                State = SpaceState.Ready,
                HeadCommit = mirror.GetHead(space),
                LastSyncAt = time.GetUtcNow().UtcDateTime,
            };
            if (next.HeadCommit != previous.HeadCommit)
            {
                logger.LogInformation("Space {SpaceId} moved to {HeadCommit}.", space.Id, next.HeadCommit);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Keep serving the last known content when there is some (spec edge case "repository unreachable").
            var head = previous.HeadCommit ?? SafeHead(space);
            next = new SpaceStatus
            {
                SpaceId = space.Id,
                State = head is null ? SpaceState.Unavailable : SpaceState.OutOfSync,
                HeadCommit = head,
                LastSyncAt = previous.LastSyncAt,
                LastError = Describe(ex),
            };
            logger.LogWarning(ex, "Synchronizing space {SpaceId} failed.", space.Id);
        }

        registry.SetStatus(next);
        await PersistAsync(next, cancellationToken);
    }

    /// <summary>Records a new head after a successful write.</summary>
    public async Task MarkHeadAsync(Space space, string commitId, CancellationToken cancellationToken)
    {
        var next = new SpaceStatus
        {
            SpaceId = space.Id,
            State = SpaceState.Ready,
            HeadCommit = commitId,
            LastSyncAt = time.GetUtcNow().UtcDateTime,
        };
        registry.SetStatus(next);
        await PersistAsync(next, cancellationToken);
    }

    private string? SafeHead(Space space)
    {
        try
        {
            return Repository.IsValid(space.MirrorPath) ? mirror.GetHead(space) : null;
        }
        catch (LibGit2SharpException)
        {
            return null;
        }
    }

    private static string Describe(Exception ex) => ex switch
    {
        GitBranchNotFoundException => ex.Message,
        LibGit2SharpException => $"The repository could not be reached: {ex.Message}",
        _ => "The repository could not be synchronized.",
    };

    private async Task PersistAsync(SpaceStatus status, CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();

        // Upsert: the timer and on-demand syncs may persist the same space concurrently.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO space_status ("SpaceId", "State", "HeadCommit", "LastSyncAt", "LastError")
            VALUES ({status.SpaceId}, {status.State.ToString()}, {status.HeadCommit}, {status.LastSyncAt}, {status.LastError})
            ON CONFLICT ("SpaceId") DO UPDATE SET
                "State" = excluded."State",
                "HeadCommit" = excluded."HeadCommit",
                "LastSyncAt" = excluded."LastSyncAt",
                "LastError" = excluded."LastError"
            """,
            cancellationToken);
    }
}

/// <summary>Fetches every space on start and then every <c>SyncInterval</c> (FR-007).</summary>
public sealed class SpaceSyncService(
    SpaceRegistry registry,
    SpaceSynchronizer synchronizer,
    IOptions<CopernicaOptions> options,
    TimeProvider time,
    ILogger<SpaceSyncService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(options.Value.SyncInterval, time);
        do
        {
            // One space's failure never stops the others (FR-026).
            await Parallel.ForEachAsync(
                registry.Valid,
                new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = stoppingToken },
                async (space, ct) =>
                {
                    try
                    {
                        await synchronizer.SyncAsync(space, ct);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        logger.LogError(ex, "Unexpected error while synchronizing space {SpaceId}.", space.Id);
                    }
                });
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
