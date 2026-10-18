using System.Security.Cryptography;
using Copernica.Auth;
using Copernica.Configuration;
using Copernica.Data;
using Copernica.Spaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Copernica.Attachments;

public abstract record UploadResult
{
    public sealed record Created(PendingImage Image) : UploadResult;

    public sealed record TooLarge(long MaxBytes) : UploadResult;

    public sealed record QuotaExceeded(long MaxBytes) : UploadResult;

    public sealed record Unsupported : UploadResult;
}

/// <summary>
/// Unsaved images (003 research R1): bytes under <c>&lt;DataDirectory&gt;/pending/</c>, metadata
/// in <c>pending_images</c>. Every lookup is scoped to the owner.
/// </summary>
public sealed class PendingImageStore(CopernicaDbContext db, IOptions<CopernicaOptions> options, TimeProvider time)
{
    private const int MaxNameAttempts = 5;

    public AttachmentOptions Limits => options.Value.Attachments;

    public string Folder => PendingFolder(options.Value.DataDirectory);

    public static string PendingFolder(string dataDirectory) => Path.Combine(Path.GetFullPath(dataDirectory), "pending");

    public async Task<UploadResult> CreateAsync(CurrentUser user, Space space, string pagePath, string? originalName, Stream content, CancellationToken cancellationToken)
    {
        var limits = Limits;
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await content.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > limits.MaxBytes)
            {
                return new UploadResult.TooLarge(limits.MaxBytes);
            }

            buffer.Write(chunk, 0, read);
        }

        var bytes = buffer.ToArray();
        var format = ImageFormat.Detect(bytes.AsSpan(0, Math.Min(bytes.Length, ImageFormat.HeaderLength)));
        if (format is null || bytes.Length == 0)
        {
            return new UploadResult.Unsupported();
        }

        var pendingTotal = await db.PendingImages.Where(p => p.UserId == user.Id).SumAsync(p => (long?)p.Size, cancellationToken) ?? 0;
        if (pendingTotal + bytes.Length > limits.MaxPendingBytesPerUser)
        {
            return new UploadResult.QuotaExceeded(limits.MaxPendingBytesPerUser);
        }

        Directory.CreateDirectory(Folder);
        var id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
        var file = Path.Combine(Folder, id);
        var temp = file + ".tmp";
        await File.WriteAllBytesAsync(temp, bytes, cancellationToken);
        File.Move(temp, file, overwrite: false);

        var now = time.GetUtcNow().UtcDateTime;
        var name = Path.GetFileName(originalName ?? "");
        for (var attempt = 1; ; attempt++)
        {
            var image = new PendingImage
            {
                Id = id,
                UserId = user.Id,
                SpaceId = space.Id,
                PagePath = pagePath,
                RepositoryPath = space.Attachments.PathFor(pagePath, AttachmentNames.Create(name, format)),
                OriginalName = name.Length > PendingImage.MaxOriginalNameLength ? name[..PendingImage.MaxOriginalNameLength] : name,
                ContentType = format.ContentType,
                Size = bytes.Length,
                CreatedAt = now,
                LastUsedAt = now,
            };
            db.PendingImages.Add(image);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return new UploadResult.Created(image);
            }
            catch (DbUpdateException) when (attempt < MaxNameAttempts)
            {
                // Another pending image already targets this path: pick a new suffix.
                db.Entry(image).State = EntityState.Detached;
            }
            catch
            {
                File.Delete(file);
                throw;
            }
        }
    }

    public Task<PendingImage?> GetOwnedAsync(CurrentUser user, string id, CancellationToken cancellationToken) =>
        IsId(id)
            ? db.PendingImages.SingleOrDefaultAsync(p => p.Id == id && p.UserId == user.Id, cancellationToken)
            : Task.FromResult<PendingImage?>(null);

    /// <summary>The user's own pending images among <paramref name="ids"/> for this space and page; refreshes their last use.</summary>
    public async Task<IReadOnlyList<PendingImage>> ResolveAsync(CurrentUser user, string spaceId, string pagePath, IEnumerable<string>? ids, CancellationToken cancellationToken)
    {
        var wanted = (ids ?? []).Where(IsId).Distinct(StringComparer.Ordinal).Take(100).ToList();
        if (wanted.Count == 0)
        {
            return [];
        }

        var images = await db.PendingImages
            .Where(p => wanted.Contains(p.Id) && p.UserId == user.Id && p.SpaceId == spaceId && p.PagePath == pagePath)
            .ToListAsync(cancellationToken);
        await TouchAsync(images, cancellationToken);
        return images;
    }

    public async Task TouchAsync(IEnumerable<PendingImage> images, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow().UtcDateTime;
        foreach (var image in images)
        {
            image.LastUsedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(IEnumerable<PendingImage> images, CancellationToken cancellationToken)
    {
        var list = images.ToList();
        db.PendingImages.RemoveRange(list);
        await db.SaveChangesAsync(cancellationToken);
        foreach (var image in list)
        {
            TryDeleteFile(image.Id);
        }
    }

    public Stream OpenRead(PendingImage image) => File.OpenRead(Path.Combine(Folder, image.Id));

    public Task<byte[]> ReadAllAsync(PendingImage image, CancellationToken cancellationToken) =>
        File.ReadAllBytesAsync(Path.Combine(Folder, image.Id), cancellationToken);

    internal void TryDeleteFile(string id)
    {
        try
        {
            File.Delete(Path.Combine(Folder, id));
        }
        catch (IOException)
        {
            // Retried by the cleanup sweep (orphan files).
        }
    }

    public static bool IsId(string? id) => id is { Length: 32 } && id.All(char.IsAsciiHexDigitLower);
}
