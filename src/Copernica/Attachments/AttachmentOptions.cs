namespace Copernica.Attachments;

/// <summary>Images pasted or dropped into the editor (003, contracts/configuration.md).</summary>
public sealed class AttachmentOptions
{
    public const string DefaultPath = ".attachments";

    /// <summary>Folder template for new images, relative to the space root; tokens <c>{dir}</c> and <c>{page}</c>.</summary>
    public string Path { get; set; } = DefaultPath;

    /// <summary>Maximum size of one image in bytes (FR-003).</summary>
    public long MaxBytes { get; set; } = 10 * 1024 * 1024;

    /// <summary>Maximum total size of one user's unsaved images, so one user cannot fill the data volume.</summary>
    public long MaxPendingBytesPerUser { get; set; } = 200 * 1024 * 1024;
}

/// <summary>Per-space override of <see cref="AttachmentOptions.Path"/>.</summary>
public sealed class SpaceAttachmentOptions
{
    public string? Path { get; set; }
}
