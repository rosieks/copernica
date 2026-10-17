namespace Copernica.Data;

/// <summary>
/// Server-side cache entry for tokens used on a user's behalf (data-model.md "DelegatedToken",
/// Constitution III "Delegated access"). <see cref="Value"/> is always encrypted with ASP.NET Core
/// Data Protection; it is never returned by any API.
/// </summary>
public sealed class DelegatedToken
{
    /// <summary>Cache key: MSAL account key for Entra tokens, or <c>pat:{userId}</c> for personal access tokens.</summary>
    public required string CacheKey { get; set; }

    public required byte[] Value { get; set; }

    public DateTime? ExpiresAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
