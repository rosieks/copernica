using Ganss.Xss;
using Markdig;
using Markdig.Renderers;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace Copernica.Rendering;

/// <summary>
/// The single Markdown → sanitized HTML pipeline used for pages, previews and comments
/// (research.md R7).
/// </summary>
public sealed class MarkdownRenderer
{
    private readonly MarkdownPipeline _pipeline = new MarkdownPipelineBuilder()
        .UsePipeTables()
        .UseGridTables()
        .UseTaskLists()
        .UseAutoLinks()
        .UseEmphasisExtras()
        .UseAutoIdentifiers(Markdig.Extensions.AutoIdentifiers.AutoIdentifierOptions.GitHub)
        .UseFootnotes()
        .UseDefinitionLists()
        .Build();

    private readonly HtmlSanitizer _sanitizer = HtmlSanitizerFactory.Create();

    /// <summary>Parses with the same pipeline as <see cref="Render"/> (e.g. to find image references).</summary>
    public MarkdownDocument Parse(string markdown) => Markdown.Parse(markdown, _pipeline);

    /// <summary>Renders Markdown and sanitizes the result. <paramref name="links"/> rewrites link targets.</summary>
    public string Render(string markdown, ILinkRewriter? links = null)
    {
        var document = Markdown.Parse(markdown, _pipeline);

        if (links is not null)
        {
            foreach (var link in document.Descendants<LinkInline>())
            {
                links.Rewrite(link);
            }

            foreach (var link in document.Descendants<AutolinkInline>())
            {
                links.Rewrite(link);
            }
        }

        using var writer = new StringWriter();
        var renderer = new HtmlRenderer(writer);
        _pipeline.Setup(renderer);
        renderer.Render(document);
        writer.Flush();

        return _sanitizer.Sanitize(writer.ToString());
    }
}

/// <summary>Adjusts link and image targets in the parsed document before rendering.</summary>
public interface ILinkRewriter
{
    void Rewrite(LinkInline link);

    void Rewrite(AutolinkInline link);
}
