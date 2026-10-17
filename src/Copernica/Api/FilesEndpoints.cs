using Copernica.Auth;
using Copernica.Git;
using Copernica.Spaces;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Net.Http.Headers;

namespace Copernica.Api;

/// <summary>Raw repository files referenced by pages: images inline, everything else as a download.</summary>
public static class FilesEndpoints
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    private static readonly HashSet<string> InlineImageTypes =
    [
        "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon", "image/svg+xml",
    ];

    public static RouteGroupBuilder MapFilesEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/spaces/{spaceId}/files/{**path}", GetFileAsync);
        return api;
    }

    private static async Task<IResult> GetFileAsync(
        string spaceId,
        string path,
        string? version,
        HttpContext context,
        PermissionService permissions,
        PageService pages,
        MirrorRepository mirror)
    {
        var access = await permissions.RequireReadAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (!SpacePaths.TryNormalize(path, out var normalized) || (!string.IsNullOrEmpty(version) && !PageService.IsCommitId(version)))
        {
            return ProblemTypes.NotFound();
        }

        var space = access.Space!;
        var commitId = string.IsNullOrEmpty(version) ? pages.GetHead(space) : version;
        var blob = commitId is null ? null : mirror.ReadBlob(space, commitId, space.ToRepositoryPath(normalized));
        if (blob is null)
        {
            return ProblemTypes.NotFound();
        }

        ContentTypes.TryGetContentType(normalized, out var contentType);
        var headers = context.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.CacheControl = string.IsNullOrEmpty(version) ? "private, no-cache" : "private, max-age=31536000, immutable";

        if (contentType is not null && InlineImageTypes.Contains(contentType))
        {
            if (contentType == "image/svg+xml")
            {
                // SVG can carry script; a sandbox CSP neutralizes it when opened directly.
                headers.ContentSecurityPolicy = "sandbox";
            }

            return Results.Bytes(blob.Content, contentType);
        }

        var download = new ContentDispositionHeaderValue("attachment");
        download.SetHttpFileName(Path.GetFileName(normalized));
        headers.ContentDisposition = download.ToString();
        return Results.Bytes(blob.Content, "application/octet-stream");
    }
}
