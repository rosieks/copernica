namespace Copernica.Data;

/// <summary>
/// A signed-in person. Created on first sign-in, updated on each sign-in and never deleted,
/// so past comments keep showing the stored name (data-model.md "User").
/// </summary>
public sealed class User
{
    /// <summary>Stable subject from the identity provider (Entra <c>oid</c>, or local account name).</summary>
    public required string Id { get; set; }

    public required string DisplayName { get; set; }

    public string? Email { get; set; }

    public DateTime LastSeenAt { get; set; }
}
