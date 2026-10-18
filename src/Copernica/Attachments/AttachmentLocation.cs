using Copernica.Spaces;

namespace Copernica.Attachments;

/// <summary>
/// Where new images go in a space: a folder template relative to the space root with the
/// tokens <c>{dir}</c> (the page's folder) and <c>{page}</c> (the page path without
/// <c>.md</c>) (003 research R4).
/// </summary>
public sealed class AttachmentLocation
{
    private const string DirToken = "{dir}";
    private const string PageToken = "{page}";

    private AttachmentLocation(string template) => Template = template;

    public string Template { get; }

    public static AttachmentLocation Default { get; } = new(AttachmentOptions.DefaultPath);

    public static bool TryParse(string? template, out AttachmentLocation location, out string error)
    {
        location = Default;
        error = "";
        var value = template?.Trim() ?? "";
        if (value.Length == 0)
        {
            error = "the path is empty";
            return false;
        }

        var withoutTokens = value.Replace(DirToken, "", StringComparison.Ordinal).Replace(PageToken, "", StringComparison.Ordinal);
        if (withoutTokens.Contains('{') || withoutTokens.Contains('}'))
        {
            error = "only the tokens {dir} and {page} are supported";
            return false;
        }

        var candidate = new AttachmentLocation(value);
        foreach (var sample in new[] { "x.md", "a/b/x.md" })
        {
            var folder = candidate.FolderFor(sample);
            if (value.StartsWith('/') || value.Contains('\\') || (folder.Length > 0 && !SpacePaths.TryNormalize(folder, out _)))
            {
                error = "the path must stay inside the space (no '..', no leading '/', no '\\')";
                return false;
            }
        }

        location = candidate;
        return true;
    }

    /// <summary>Space-relative folder for images of <paramref name="pagePath"/>; empty for the space root.</summary>
    public string FolderFor(string pagePath)
    {
        var slash = pagePath.LastIndexOf('/');
        var dir = slash < 0 ? "" : pagePath[..slash];
        var page = pagePath.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ? pagePath[..^3] : pagePath;
        var expanded = Template.Replace(DirToken, dir, StringComparison.Ordinal).Replace(PageToken, page, StringComparison.Ordinal);
        return string.Join('/', expanded.Split('/', StringSplitOptions.RemoveEmptyEntries));
    }

    public string PathFor(string pagePath, string fileName)
    {
        var folder = FolderFor(pagePath);
        return folder.Length == 0 ? fileName : $"{folder}/{fileName}";
    }

    /// <summary>Link from the page to <paramref name="targetPath"/>, relative and URL-encoded per segment (FR-015).</summary>
    public static string RelativeLink(string fromPagePath, string targetPath)
    {
        var from = fromPagePath.Split('/')[..^1];
        var to = targetPath.Split('/');
        var common = 0;
        while (common < from.Length && common < to.Length - 1 && string.Equals(from[common], to[common], StringComparison.Ordinal))
        {
            common++;
        }

        var parts = Enumerable.Repeat("..", from.Length - common).Concat(to[common..].Select(Uri.EscapeDataString));
        return string.Join('/', parts);
    }
}
