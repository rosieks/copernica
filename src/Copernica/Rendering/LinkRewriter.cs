using System.Text;
using Copernica.Spaces;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace Copernica.Rendering;

/// <summary>
/// Updates link targets after a move (005 research R7, FR-011, FR-012). Only the URL text of
/// links, images and reference definitions changes; everything else in the page stays
/// byte-for-byte. Targets resolve exactly as rendering resolves them
/// (<see cref="WikiLinkRewriter.ResolvePath"/>), and the link keeps its style: relative,
/// space-rooted or <c>wiki:</c>, with its fragment, query, brackets and encoding.
/// </summary>
public sealed class LinkRewriter(MarkdownRenderer renderer)
{
    /// <summary>Whether a page that does not move can link to anything in <paramref name="map"/> at all.</summary>
    public static bool MayReference(string markdown, MoveMap map) =>
        map.Needles.Any(n => markdown.Contains(n, StringComparison.Ordinal));

    /// <summary>
    /// The page text with its links updated for <paramref name="map"/>, or null when nothing
    /// changes. <paramref name="oldPagePath"/> is where the page was (links resolve from there),
    /// <paramref name="newPagePath"/> where it will be (relative links are written from there).
    /// </summary>
    public string? Rewrite(string markdown, string oldPagePath, string newPagePath, string spaceId, MoveMap map)
    {
        var document = renderer.ParseWithSourceSpans(markdown);
        var edits = new List<(int Start, int Length, string Text)>();

        foreach (var link in document.Descendants<LinkInline>())
        {
            if (link.IsAutoLink || link.Reference is not null || link.UrlSpan.IsEmpty)
            {
                continue;
            }

            AddEdit(markdown, link.UrlSpan, oldPagePath, newPagePath, spaceId, map, edits);
        }

        foreach (var definition in document.Descendants<LinkReferenceDefinition>())
        {
            if (!definition.UrlSpan.IsEmpty)
            {
                AddEdit(markdown, definition.UrlSpan, oldPagePath, newPagePath, spaceId, map, edits);
            }
        }

        if (edits.Count == 0)
        {
            return null;
        }

        var builder = new StringBuilder(markdown);
        foreach (var (start, length, text) in edits.DistinctBy(e => e.Start).OrderByDescending(e => e.Start))
        {
            builder.Remove(start, length).Insert(start, text);
        }

        return builder.ToString();
    }

    private static void AddEdit(string markdown, SourceSpan span, string oldPagePath, string newPagePath, string spaceId, MoveMap map, List<(int, int, string)> edits)
    {
        var start = span.Start;
        var end = span.End;
        if (start < 0 || end >= markdown.Length || end < start)
        {
            return;
        }

        // `<url with spaces>`: rewrite only what is inside the brackets.
        var bracketed = false;
        if (markdown[start] == '<' && markdown[end] == '>' && end > start)
        {
            start++;
            end--;
            bracketed = true;
        }
        else if (start > 0 && end + 1 < markdown.Length && markdown[start - 1] == '<' && markdown[end + 1] == '>')
        {
            bracketed = true;
        }

        var original = markdown[start..(end + 1)];
        var replacement = NewTarget(original, oldPagePath, newPagePath, spaceId, map, bracketed);
        if (replacement is not null && replacement != original)
        {
            edits.Add((start, end - start + 1, replacement));
        }
    }

    /// <summary>The new link target, or null when the link does not change.</summary>
    internal static string? NewTarget(string target, string oldPagePath, string newPagePath, string spaceId, MoveMap map, bool bracketed = false)
    {
        if (target.StartsWith(WikiLinkRewriter.WikiScheme, StringComparison.OrdinalIgnoreCase))
        {
            return NewWikiTarget(target, spaceId, map, bracketed);
        }

        if (target.Length == 0 || target.StartsWith('#') || WikiLinkRewriter.IsExternal(target))
        {
            return null;
        }

        var (pathPart, suffix) = Split(target);
        if (pathPart.Length == 0)
        {
            return null;
        }

        var oldTarget = WikiLinkRewriter.ResolvePath(oldPagePath, pathPart);
        if (oldTarget is null)
        {
            return null;
        }

        var newTarget = map.Map(oldTarget) ?? oldTarget;
        if (pathPart.StartsWith('/'))
        {
            return newTarget == oldTarget ? null : "/" + Encode(newTarget, pathPart, bracketed) + suffix;
        }

        if (newTarget == oldTarget && oldPagePath == newPagePath)
        {
            return null;
        }

        var relative = Relative(SpacePaths.Parent(newPagePath), newTarget);
        if (pathPart.StartsWith("./", StringComparison.Ordinal) && !relative.StartsWith("../", StringComparison.Ordinal))
        {
            relative = "./" + relative;
        }

        // Same target, same relative form: keep the original bytes (encoding, case of escapes).
        if (WikiLinkRewriter.ResolvePath(newPagePath, pathPart) == newTarget)
        {
            return null;
        }

        return Encode(relative, pathPart, bracketed) + suffix;
    }

    private static string? NewWikiTarget(string target, string spaceId, MoveMap map, bool bracketed)
    {
        var rest = target[WikiLinkRewriter.WikiScheme.Length..];
        var leading = rest.Length - rest.TrimStart('/').Length;
        rest = rest[leading..];
        var slash = rest.IndexOf('/');
        if (slash <= 0 || !string.Equals(rest[..slash], spaceId, StringComparison.Ordinal))
        {
            return null;
        }

        var (pathPart, suffix) = Split(rest[(slash + 1)..]);
        var oldTarget = WikiLinkRewriter.ResolvePath("", "/" + pathPart);
        if (oldTarget is null || map.Map(oldTarget) is not { } newTarget)
        {
            return null;
        }

        return target[..(WikiLinkRewriter.WikiScheme.Length + leading + slash + 1)] + Encode(newTarget, pathPart, bracketed) + suffix;
    }

    private static (string Path, string Suffix) Split(string target)
    {
        var index = target.IndexOfAny(['#', '?']);
        return index >= 0 ? (target[..index], target[index..]) : (target, "");
    }

    /// <summary>Relative path from folder <paramref name="fromFolder"/> to the space path <paramref name="target"/>.</summary>
    internal static string Relative(string fromFolder, string target)
    {
        var from = fromFolder.Length == 0 ? [] : fromFolder.Split('/');
        var to = target.Split('/');
        var common = 0;
        while (common < from.Length && common < to.Length - 1 && from[common] == to[common])
        {
            common++;
        }

        return string.Concat(Enumerable.Repeat("../", from.Length - common)) + string.Join('/', to[common..]);
    }

    /// <summary>Encodes like the original link: percent-encoded if it was, raw otherwise (escaping only what would break the link).</summary>
    private static string Encode(string path, string original, bool bracketed)
    {
        if (original.Contains('%'))
        {
            return string.Join('/', path.Split('/').Select(s => s is ".." or "." ? s : Uri.EscapeDataString(s)));
        }

        if (bracketed)
        {
            return path.Replace("<", "%3C", StringComparison.Ordinal).Replace(">", "%3E", StringComparison.Ordinal);
        }

        return path
            .Replace(" ", "%20", StringComparison.Ordinal)
            .Replace("(", "%28", StringComparison.Ordinal)
            .Replace(")", "%29", StringComparison.Ordinal)
            .Replace("<", "%3C", StringComparison.Ordinal)
            .Replace(">", "%3E", StringComparison.Ordinal);
    }
}
