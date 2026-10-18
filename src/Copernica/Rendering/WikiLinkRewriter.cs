using Markdig.Renderers.Html;
using Markdig.Syntax.Inlines;

namespace Copernica.Rendering;

/// <summary>
/// Turns repository-relative links into wiki routes (research.md R7):
/// <list type="bullet">
/// <item><c>other.md</c>, <c>../x.md</c>, <c>/x.md</c> (space root) → <c>/s/{space}/{path}</c></item>
/// <item><c>wiki:{space}/{path}</c> → <c>/s/{space}/{path}</c></item>
/// <item>other relative targets and images → <c>/api/spaces/{space}/files/{path}?version={commit}</c></item>
/// </list>
/// Links to pages that do not exist, or that escape the space, get the <c>broken-link</c> class.
/// </summary>
public sealed class WikiLinkRewriter(
    string spaceId,
    string pagePath,
    string commitId,
    Func<string, bool> pageExists,
    IReadOnlyDictionary<string, string>? pendingImages = null) : ILinkRewriter
{
    public const string WikiScheme = "wiki:";
    public const string BrokenLinkClass = "broken-link";

    public void Rewrite(LinkInline link)
    {
        if (string.IsNullOrEmpty(link.Url))
        {
            return;
        }

        var (url, broken) = Resolve(link.Url, link.IsImage);
        if (url is not null)
        {
            link.Url = url;
        }

        if (broken)
        {
            link.GetAttributes().AddClass(BrokenLinkClass);
        }
    }

    public void Rewrite(AutolinkInline link)
    {
    }

    internal (string? Url, bool Broken) Resolve(string target, bool isImage)
    {
        if (target.StartsWith(WikiScheme, StringComparison.OrdinalIgnoreCase))
        {
            var rest = target[WikiScheme.Length..].TrimStart('/');
            var slash = rest.IndexOf('/');
            return slash <= 0
                ? (null, true)
                : ($"/s/{rest[..slash]}/{rest[(slash + 1)..]}", false);
        }

        if (target.StartsWith('#') || IsExternal(target))
        {
            return (null, false);
        }

        var fragmentIndex = target.IndexOfAny(['#', '?']);
        var pathPart = fragmentIndex >= 0 ? target[..fragmentIndex] : target;
        var fragment = fragmentIndex >= 0 && target[fragmentIndex] == '#' ? target[fragmentIndex..] : "";

        var resolved = Combine(pathPart);
        if (resolved is null)
        {
            return ("", true);
        }

        // Images added in the current edit and not saved yet are shown from the upload (003 R5).
        if (isImage && pendingImages is not null && pendingImages.TryGetValue(resolved, out var pendingUrl))
        {
            return (pendingUrl, false);
        }

        if (!isImage && resolved.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
        {
            return ($"/s/{spaceId}/{Encode(resolved)}{fragment}", !pageExists(resolved));
        }

        return ($"/api/spaces/{spaceId}/files/{Encode(resolved)}?version={commitId}", false);
    }

    private string? Combine(string relative) => ResolvePath(pagePath, relative);

    /// <summary>
    /// True for links with a scheme (<c>https:</c>, <c>mailto:</c>) or protocol-relative ones.
    /// A leading <c>/</c> is a space-root link, even though .NET on Linux parses "/x" as an
    /// absolute file URI.
    /// </summary>
    internal static bool IsExternal(string target) =>
        target.StartsWith("//", StringComparison.Ordinal)
        || (!target.StartsWith('/') && Uri.TryCreate(target, UriKind.Absolute, out _));

    /// <summary>
    /// Resolves a link target against the folder of <paramref name="pagePath"/>; targets starting
    /// with <c>/</c> resolve from the space root. Null if the result escapes the space.
    /// </summary>
    internal static string? ResolvePath(string pagePath, string relative)
    {
        var decoded = Uri.UnescapeDataString(relative).Replace('\\', '/');
        var segments = new List<string>();
        if (!decoded.StartsWith('/'))
        {
            segments.AddRange(pagePath.Split('/')[..^1]);
        }

        foreach (var segment in decoded.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            switch (segment)
            {
                case ".":
                    continue;
                case "..":
                    if (segments.Count == 0)
                    {
                        return null;
                    }

                    segments.RemoveAt(segments.Count - 1);
                    break;
                default:
                    segments.Add(segment);
                    break;
            }
        }

        return segments.Count == 0 ? null : string.Join('/', segments);
    }

    private static string Encode(string path) => string.Join('/', path.Split('/').Select(Uri.EscapeDataString));
}
