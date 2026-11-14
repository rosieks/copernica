using System.Text;
using Markdig.Renderers.Html;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace Copernica.Rendering;

/// <summary>A heading a reader can link to (009 data-model.md). <see cref="Id"/> has no prefix.</summary>
public sealed record Section(int Level, string Id, string Text);

/// <summary>Rendered, sanitized HTML with the sections of the same document.</summary>
public sealed record RenderedMarkdown(string Html, IReadOnlyList<Section> Sections);

/// <summary>
/// Lists the H1–H3 headings of a parsed document with the ids Markdig's auto identifiers gave
/// them. Headings in code blocks are code, and raw HTML headings have no auto id, so neither is
/// listed.
/// </summary>
public static class SectionExtractor
{
    public const int MaxLevel = 3;

    public static IReadOnlyList<Section> Extract(MarkdownDocument document)
    {
        var sections = new List<Section>();
        foreach (var heading in document.Descendants<HeadingBlock>())
        {
            if (heading.Level > MaxLevel || heading.GetAttributes().Id is not { Length: > 0 } id)
            {
                continue;
            }

            sections.Add(new Section(heading.Level, id, PlainText(heading.Inline)));
        }

        return sections;
    }

    private static string PlainText(ContainerInline? inline)
    {
        var text = new StringBuilder();
        Append(text, inline);
        return string.Join(' ', text.ToString().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static void Append(StringBuilder text, Inline? inline)
    {
        switch (inline)
        {
            case LiteralInline literal:
                text.Append(literal.Content.ToString());
                break;
            case CodeInline code:
                text.Append(code.Content);
                break;
            case HtmlEntityInline entity:
                text.Append(entity.Transcoded.ToString());
                break;
            case AutolinkInline autolink:
                text.Append(autolink.Url);
                break;
            case LineBreakInline:
                text.Append(' ');
                break;
            case ContainerInline container:
                foreach (var child in container)
                {
                    Append(text, child);
                }

                break;
        }
    }
}
