using System.Collections.Concurrent;
using Copernica.Configuration;
using Copernica.Data;
using Microsoft.Extensions.Options;

namespace Copernica.Spaces;

/// <summary>Configured spaces, their runtime status and per-space write locks (single replica, Constitution V).</summary>
public sealed class SpaceRegistry
{
    private readonly Dictionary<string, Space> _byId;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, SpaceStatus> _status = new(StringComparer.Ordinal);

    public SpaceRegistry(IOptions<CopernicaOptions> options)
    {
        All = Space.CreateAll(options.Value.Spaces, options.Value.DataDirectory, options.Value.Attachments.Path);

        // Invalid entries stay in All (and are reported) but cannot be looked up by a duplicate id.
        _byId = All.Where(s => s.IsValid).ToDictionary(s => s.Id, StringComparer.Ordinal);
        foreach (var space in All)
        {
            _status[space.Id] = space.IsValid
                ? new SpaceStatus { SpaceId = space.Id, State = SpaceState.Initializing }
                : new SpaceStatus { SpaceId = space.Id, State = SpaceState.Unavailable, LastError = string.Join(" ", space.ConfigurationErrors) };
        }
    }

    public IReadOnlyList<Space> All { get; }

    public IEnumerable<Space> Valid => All.Where(s => s.IsValid);

    public Space? Find(string id) => _byId.GetValueOrDefault(id);

    public SpaceStatus GetStatus(Space space) => _status[space.Id];

    public void SetStatus(SpaceStatus status) => _status[status.SpaceId] = status;

    /// <summary>Serializes fetches and writes of one space.</summary>
    public async Task<IDisposable> LockAsync(Space space, CancellationToken cancellationToken)
    {
        var semaphore = _locks.GetOrAdd(space.Id, _ => new SemaphoreSlim(1, 1));
        await semaphore.WaitAsync(cancellationToken);
        return new Releaser(semaphore);
    }

    private sealed class Releaser(SemaphoreSlim semaphore) : IDisposable
    {
        private int _released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
            {
                semaphore.Release();
            }
        }
    }
}
