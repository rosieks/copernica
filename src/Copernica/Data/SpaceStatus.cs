namespace Copernica.Data;

public enum SpaceState
{
    Initializing,
    Ready,
    OutOfSync,
    Unavailable,
}

/// <summary>Synchronization status of a space (data-model.md "SpaceStatus").</summary>
public sealed class SpaceStatus
{
    public required string SpaceId { get; set; }

    public SpaceState State { get; set; }

    /// <summary>Commit id of the branch tip in the local mirror.</summary>
    public string? HeadCommit { get; set; }

    /// <summary>Last successful fetch (UTC).</summary>
    public DateTime? LastSyncAt { get; set; }

    /// <summary>Human-readable reason, shown to users of the space.</summary>
    public string? LastError { get; set; }
}
