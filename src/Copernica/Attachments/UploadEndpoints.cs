using Copernica.Auth;
using Copernica.Spaces;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;

namespace Copernica.Attachments;

public sealed record PendingUploadDto(string Id, string RepositoryPath, string Link, string Name, string ContentType, long Size, string PreviewUrl);

/// <summary>Uploading images for a page edit and previewing them (003 contracts/api.md §1–2).</summary>
public static class UploadEndpoints
{
    /// <summary>Room for the multipart framing around the file.</summary>
    private const long MultipartOverhead = 64 * 1024;

    public static RouteGroupBuilder MapUploadEndpoints(this RouteGroupBuilder api)
    {
        // The antiforgery header is checked for every state-changing /api request (UseCopernicaAntiforgery).
        api.MapPost("/spaces/{spaceId}/uploads", UploadAsync);
        api.MapGet("/uploads/{id}", GetAsync);
        return api;
    }

    private static async Task<IResult> UploadAsync(
        string spaceId,
        string? page,
        HttpContext context,
        PermissionService permissions,
        PendingImageStore store,
        IOptions<Configuration.CopernicaOptions> options)
    {
        // Reject oversized bodies before reading them.
        var limits = options.Value.Attachments;
        if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } size)
        {
            size.MaxRequestBodySize = limits.MaxBytes + MultipartOverhead;
        }

        if (context.Request.ContentLength > limits.MaxBytes + MultipartOverhead)
        {
            return TooLarge(limits.MaxBytes);
        }

        var access = await permissions.RequireWriteAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        var space = access.Space!;
        if (!space.IsValid)
        {
            return Api.SpacesEndpoints.SpaceUnavailable(space);
        }

        if (!SpacePaths.TryNormalizePage(page, out var pagePath))
        {
            return ProblemTypes.BadRequest("The page path is invalid.");
        }

        if (!context.Request.HasFormContentType)
        {
            return ProblemTypes.BadRequest("Send the image as multipart/form-data in a part named 'file'.");
        }

        IFormCollection form;
        try
        {
            form = await context.Request.ReadFormAsync(context.RequestAborted);
        }
        catch (Exception ex) when (ex is BadHttpRequestException or InvalidDataException)
        {
            return ex is BadHttpRequestException { StatusCode: StatusCodes.Status413PayloadTooLarge }
                ? TooLarge(limits.MaxBytes)
                : ProblemTypes.BadRequest("The upload could not be read.");
        }

        if (form.Files.Count != 1 || form.Files[0].Name != "file")
        {
            return ProblemTypes.BadRequest("Send exactly one image in a part named 'file'.");
        }

        var file = form.Files[0];
        if (file.Length > limits.MaxBytes)
        {
            return TooLarge(limits.MaxBytes);
        }

        await using var content = file.OpenReadStream();
        var result = await store.CreateAsync(access.User!, space, pagePath, file.FileName, content, context.RequestAborted);
        return result switch
        {
            UploadResult.Created created => Results.Created($"/api/uploads/{created.Image.Id}", ToDto(created.Image, pagePath)),
            UploadResult.TooLarge tooLarge => TooLarge(tooLarge.MaxBytes),
            UploadResult.QuotaExceeded quota => Results.Problem(
                title: "Too many unsaved images.",
                detail: $"Your unsaved images can take at most {Megabytes(quota.MaxBytes)}. Save or discard your edits first.",
                statusCode: StatusCodes.Status413PayloadTooLarge,
                type: ProblemTypes.For("attachment-too-large")),
            _ => Results.Problem(
                title: "This file is not a supported image.",
                detail: "Only PNG, JPEG, GIF, WebP and SVG images are accepted.",
                statusCode: StatusCodes.Status415UnsupportedMediaType,
                type: ProblemTypes.For("unsupported-image")),
        };
    }

    private static async Task<IResult> GetAsync(string id, HttpContext context, PendingImageStore store)
    {
        var user = context.GetCurrentUser();
        var image = await store.GetOwnedAsync(user, id, context.RequestAborted);
        if (image is null)
        {
            return ProblemTypes.NotFound();
        }

        var headers = context.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.CacheControl = "private, no-store";
        if (image.ContentType == ImageFormat.Svg.ContentType)
        {
            // As for SVG files from repositories: never run scripts from it.
            headers.ContentSecurityPolicy = "sandbox";
        }

        return Results.Stream(store.OpenRead(image), image.ContentType);
    }

    public static PendingUploadDto ToDto(PendingImage image, string pagePath) => new(
        image.Id,
        image.RepositoryPath,
        AttachmentLocation.RelativeLink(pagePath, image.RepositoryPath),
        image.OriginalName,
        image.ContentType,
        image.Size,
        $"/api/uploads/{image.Id}");

    private static IResult TooLarge(long maxBytes) => Results.Problem(
        title: "The image is too large.",
        detail: $"Images can be at most {Megabytes(maxBytes)}.",
        statusCode: StatusCodes.Status413PayloadTooLarge,
        type: ProblemTypes.For("attachment-too-large"));

    private static string Megabytes(long bytes) => $"{bytes / (1024.0 * 1024.0):0.#} MB";
}
