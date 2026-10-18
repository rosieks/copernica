using Copernica.Rendering;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace Copernica.Attachments;

/// <summary>
/// The space paths of images a page refers to, resolved like rendering does (relative to the
/// page, or from the space root for targets starting with <c>/</c>). Used to commit only the
/// pending images the saved text still references (FR-007).
/// </summary>
public sealed class ReferencedImages(MarkdownRenderer renderer)
{
    public IReadOnlySet<string> Collect(string markdown, string pagePath)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var link in renderer.Parse(markdown).Descendants<LinkInline>())
        {
            if (!link.IsImage || string.IsNullOrEmpty(link.Url))
            {
                continue;
            }

            var target = link.Url;
            if (target.StartsWith(WikiLinkRewriter.WikiScheme, StringComparison.OrdinalIgnoreCase)
                || target.StartsWith('#')
                || WikiLinkRewriter.IsExternal(target))
            {
                continue;
            }

            var end = target.IndexOfAny(['#', '?']);
            var path = WikiLinkRewriter.ResolvePath(pagePath, end >= 0 ? target[..end] : target);
            if (path is not null)
            {
                result.Add(path);
            }
        }

        return result;
    }
}
