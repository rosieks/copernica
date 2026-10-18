using Markdig.Extensions.CustomContainers;
using Markdig.Renderers;
using Markdig.Renderers.Html;
using Markdig.Syntax;

namespace Copernica.Rendering;

/// <summary>
/// Writes the diagram figure of 004 contracts/rendering.md: escaped source in a
/// <c>pre</c>, metadata in <c>data-diagram*</c> attributes and click links as a plain list.
/// The browser draws the picture in an isolated frame (constitution v1.3.0).
/// </summary>
internal static class DiagramHtmlRenderer
{
    public const string Language = "mermaid";

    public static bool IsDiagram(string? info) =>
        info is not null && string.Equals(info.Trim().Split(' ', 2)[0], Language, StringComparison.OrdinalIgnoreCase);

    public static void Write(HtmlRenderer renderer, string source, ILinkRewriter? links)
    {
        var block = DiagramBlock.Parse(source);

        renderer.EnsureLine();
        renderer.Write("<figure class=\"diagram\" data-diagram=\"mermaid\" data-diagram-type=\"").WriteEscape(block.Type)
            .Write("\" data-diagram-name=\"").WriteEscape(block.Name).Write('"');
        if (block.Description is not null)
        {
            renderer.Write(" data-diagram-description=\"").WriteEscape(block.Description).Write('"');
        }

        if (block.TooLarge)
        {
            renderer.Write(" data-diagram-too-large=\"true\"");
        }

        renderer.Write("><pre class=\"diagram__source\"><code>").WriteEscape(source).Write("</code></pre>");

        var items = block.Clicks
            .Select(c => (Url: ResolveClick(c.Url, links), c.Label))
            .Where(c => c.Url is not null)
            .ToList();
        if (items.Count > 0)
        {
            renderer.Write("<ul class=\"diagram__links\" aria-label=\"Links in this diagram\">");
            foreach (var (url, label) in items)
            {
                renderer.Write("<li><a href=\"").WriteEscapeUrl(url).Write("\">").WriteEscape(label).Write("</a></li>");
            }

            renderer.Write("</ul>");
        }

        renderer.WriteLine("</figure>");
    }

    /// <summary>The link target, as a text link would get it; null when rejected.</summary>
    private static string? ResolveClick(string target, ILinkRewriter? links)
    {
        target = target.Trim();
        if (target.Length == 0)
        {
            return null;
        }

        if (WikiLinkRewriter.IsExternal(target))
        {
            return Uri.TryCreate(target, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "mailto" ? target : null;
        }

        if (target.StartsWith('#'))
        {
            return target;
        }

        return links?.ResolveUrl(target);
    }
}

/// <summary>Fenced code blocks: <c>mermaid</c> ones become diagrams, the rest render as before.</summary>
internal sealed class DiagramCodeBlockRenderer(ILinkRewriter? links) : CodeBlockRenderer
{
    protected override void Write(HtmlRenderer renderer, CodeBlock obj)
    {
        if (obj is FencedCodeBlock fenced && DiagramHtmlRenderer.IsDiagram(fenced.Info))
        {
            DiagramHtmlRenderer.Write(renderer, obj.Lines.ToString() + "\n", links);
            return;
        }

        base.Write(renderer, obj);
    }
}

/// <summary>
/// Azure DevOps Wiki <c>::: mermaid</c> containers. Markdig parses their content as Markdown,
/// so the source is cut from the original text between the opening and closing fences.
/// </summary>
internal sealed class DiagramContainerRenderer(string markdown, ILinkRewriter? links) : HtmlCustomContainerRenderer
{
    protected override void Write(HtmlRenderer renderer, CustomContainer obj)
    {
        if (!DiagramHtmlRenderer.IsDiagram(obj.Info))
        {
            base.Write(renderer, obj);
            return;
        }

        var text = markdown.Substring(obj.Span.Start, Math.Min(obj.Span.Length, markdown.Length - obj.Span.Start)).Replace("\r\n", "\n");
        var lines = text.Split('\n').ToList();
        lines.RemoveAt(0);
        while (lines.Count > 0 && lines[^1].Trim().Length == 0)
        {
            lines.RemoveAt(lines.Count - 1);
        }

        if (lines.Count > 0 && lines[^1].TrimStart().StartsWith(":::", StringComparison.Ordinal))
        {
            lines.RemoveAt(lines.Count - 1);
        }

        DiagramHtmlRenderer.Write(renderer, string.Join('\n', lines) + "\n", links);
    }
}
