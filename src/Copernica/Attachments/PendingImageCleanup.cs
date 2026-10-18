using Copernica.Configuration;
using Copernica.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Copernica.Attachments;

/// <summary>
/// Removes images of abandoned edits (FR-008): rows unused for 24 hours and their files, plus
/// files left without a row. Runs at start and then every hour (003 research R8).
/// </summary>
public sealed class PendingImageCleanup(
    IServiceScopeFactory scopes,
    IOptions<CopernicaOptions> options,
    TimeProvider time,
    ILogger<PendingImageCleanup> logger) : BackgroundService
{
    public static readonly TimeSpan MaxIdle = TimeSpan.FromHours(24);
    public static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Cleanup of pending images failed; retrying in {Interval}.", Interval);
            }

            try
            {
                await Task.Delay(Interval, time, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    public async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        var cutoff = time.GetUtcNow().UtcDateTime - MaxIdle;

        var expired = await db.PendingImages.Where(p => p.LastUsedAt < cutoff).ToListAsync(cancellationToken);
        db.PendingImages.RemoveRange(expired);
        await db.SaveChangesAsync(cancellationToken);

        var folder = PendingImageStore.PendingFolder(options.Value.DataDirectory);
        var removedFiles = 0;
        if (Directory.Exists(folder))
        {
            var known = (await db.PendingImages.Select(p => p.Id).ToListAsync(cancellationToken)).ToHashSet(StringComparer.Ordinal);
            foreach (var file in Directory.EnumerateFiles(folder))
            {
                var name = Path.GetFileName(file);
                var id = name.EndsWith(".tmp", StringComparison.Ordinal) ? name[..^4] : name;
                if (known.Contains(id))
                {
                    continue;
                }

                // Expired rows' files go now; files without a row only once they are old enough
                // (an upload may be between writing the file and inserting the row).
                var isExpiredRow = expired.Any(e => e.Id == id);
                if (isExpiredRow || File.GetLastWriteTimeUtc(file) < cutoff)
                {
                    try
                    {
                        File.Delete(file);
                        removedFiles++;
                    }
                    catch (IOException ex)
                    {
                        logger.LogDebug(ex, "Could not delete pending file {File}.", file);
                    }
                }
            }
        }

        if (expired.Count > 0 || removedFiles > 0)
        {
            logger.LogInformation("Removed {Rows} expired pending images and {Files} files.", expired.Count, removedFiles);
        }
    }
}
