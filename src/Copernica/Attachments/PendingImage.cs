namespace Copernica.Attachments;

/// <summary>
/// An image added during an edit but not saved yet (003 data-model.md). The bytes live in
/// <c>&lt;DataDirectory&gt;/pending/&lt;Id&gt;</c>; only the owner can use it.
/// </summary>
public sealed class PendingImage
{
    public const int MaxOriginalNameLength = 255;

    public required string Id { get; init; }

    public required string UserId { get; init; }

    public required string SpaceId { get; init; }

    public required string PagePath { get; init; }

    /// <summary>Space-relative path the image is committed to when the page is saved.</summary>
    public required string RepositoryPath { get; init; }

    public required string OriginalName { get; init; }

    public required string ContentType { get; init; }

    public long Size { get; init; }

    public DateTime CreatedAt { get; init; }

    public DateTime LastUsedAt { get; set; }
}
