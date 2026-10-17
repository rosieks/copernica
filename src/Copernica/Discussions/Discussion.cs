namespace Copernica.Discussions;

public enum DiscussionState
{
    Open,
    Resolved,
}

public enum AnchorStatus
{
    Anchored,
    Outdated,
}

/// <summary>
/// A thread attached to a fragment of a page (data-model.md "Discussion"). Stored only in the
/// application database, never in a repository (FR-024).
/// </summary>
public sealed class Discussion
{
    public Guid Id { get; set; }

    public required string SpaceId { get; set; }

    /// <summary>Space-relative page path; updated when a rename is detected in history.</summary>
    public required string PagePath { get; set; }

    public DiscussionState State { get; set; } = DiscussionState.Open;

    public AnchorStatus AnchorStatus { get; set; } = AnchorStatus.Anchored;

    public required TextAnchor Anchor { get; set; }

    public required string CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public string? ResolvedBy { get; set; }

    public DateTime? ResolvedAt { get; set; }

    public List<Comment> Comments { get; set; } = [];
}

/// <summary>
/// W3C Web Annotation–style anchor over the plain text of the rendered page
/// (TextQuoteSelector + TextPositionSelector, research.md R6).
/// </summary>
public sealed class TextAnchor
{
    public const int MaxExactLength = 2000;
    public const int ContextLength = 32;

    /// <summary>Selected text, 1–2,000 chars, non-whitespace.</summary>
    public required string Exact { get; set; }

    /// <summary>Up to 32 chars before the selection.</summary>
    public string Prefix { get; set; } = "";

    /// <summary>Up to 32 chars after the selection.</summary>
    public string Suffix { get; set; } = "";

    public int Start { get; set; }

    public int End { get; set; }

    /// <summary>Page version the offsets refer to.</summary>
    public required string CommitId { get; set; }

    /// <summary>Immutable copy of the first <see cref="Exact"/>, shown when outdated.</summary>
    public required string OriginalExact { get; set; }
}

/// <summary>An entry in a discussion; the first one opens it (data-model.md "Comment").</summary>
public sealed class Comment
{
    public const int MaxBodyLength = 10_000;

    public Guid Id { get; set; }

    public Guid DiscussionId { get; set; }

    public required string AuthorId { get; set; }

    /// <summary>1–10,000 chars, Markdown.</summary>
    public required string Body { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Non-null ⇒ shown as "edited" (FR-020).</summary>
    public DateTime? EditedAt { get; set; }

    /// <summary>Soft delete keeps thread context.</summary>
    public DateTime? DeletedAt { get; set; }
}
