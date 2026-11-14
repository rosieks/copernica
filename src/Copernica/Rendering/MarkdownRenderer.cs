using Ganss.Xss;
using Markdig;
using Markdig.Extensions.CustomContainers;
using Markdig.Extensions.Yaml;
using Markdig.Renderers;
using Markdig.Renderers.Html;
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
        .UseYamlFrontMatter()
        .UsePipeTables()
        .UseGridTables()
        .UseTaskLists()
        .UseAutoLinks()
        .UseEmphasisExtras()
        .UseAutoIdentifiers(Markdig.Extensions.AutoIdentifiers.AutoIdentifierOptions.GitHub)
        .UseFootnotes()
        .UseDefinitionLists()
        .Use<BlockContainersExtension>()
        .Build();

    /// <summary>The same extensions with exact source spans, for editing link targets in place (005 research R7).</summary>
    private readonly MarkdownPipeline _spanPipeline = new MarkdownPipelineBuilder()
        .UseYamlFrontMatter()
        .UsePipeTables()
        .UseGridTables()
        .UseTaskLists()
        .UseAutoLinks()
        .UseEmphasisExtras()
        .UseAutoIdentifiers(Markdig.Extensions.AutoIdentifiers.AutoIdentifierOptions.GitHub)
        .UseFootnotes()
        .UseDefinitionLists()
        .Use<BlockContainersExtension>()
        .UsePreciseSourceLocation()
        .Build();

    /// <summary>Comments have no front matter: a leading <c>---</c> block stays visible text (010).</summary>
    private readonly MarkdownPipeline _commentPipeline = new MarkdownPipelineBuilder()
        .UsePipeTables()
        .UseGridTables()
        .UseTaskLists()
        .UseAutoLinks()
        .UseEmphasisExtras()
        .UseAutoIdentifiers(Markdig.Extensions.AutoIdentifiers.AutoIdentifierOptions.GitHub)
        .UseFootnotes()
        .UseDefinitionLists()
        .Use<BlockContainersExtension>()
        .Build();

    private readonly HtmlSanitizer _sanitizer = HtmlSanitizerFactory.Create();

    /// <summary>Parses with the same pipeline as <see cref="Render"/> (e.g. to find image references).</summary>
    public MarkdownDocument Parse(string markdown) => Markdown.Parse(markdown, _pipeline);

    /// <summary>Parses like <see cref="Parse"/>, with precise source spans for links and reference definitions.</summary>
    public MarkdownDocument ParseWithSourceSpans(string markdown) => Markdown.Parse(markdown, _spanPipeline);

    /// <summary>
    /// Renders a comment and sanitizes the result. <paramref name="links"/> rewrites link targets.
    /// Unlike pages, a leading <c>---</c> block is not front matter.
    /// </summary>
    public string Render(string markdown, ILinkRewriter? links = null) =>
        Render(markdown, _commentPipeline, links, diagrams: false).Html;

    /// <summary>
    /// Renders a page: sanitized HTML, the H1–H3 sections of the document (009), taken from the same
    /// parse so their ids match the rendered headings, and its front matter (010), which is left out
    /// of the HTML. <paramref name="diagrams"/> turns Mermaid blocks into diagram figures.
    /// </summary>
    public RenderedMarkdown RenderWithSections(string markdown, ILinkRewriter? links = null, bool diagrams = false)
    {
        if (FrontMatter.Locate(markdown) is not { } block)
        {
            return Render(markdown, _pipeline, links, diagrams);
        }

        // Markdig does not take every block FrontMatter.Locate does (an empty one, research R1);
        // those are blanked out, keeping every offset after them.
        if (!Markdown.Parse(markdown, _pipeline).OfType<YamlFrontMatterBlock>().Any())
        {
            var blanked = markdown.ToCharArray();
            for (var i = block.Start; i < block.End; i++)
            {
                blanked[i] = blanked[i] is '\n' or '\r' ? blanked[i] : ' ';
            }

            markdown = new string(blanked);
        }

        return Render(markdown, _pipeline, links, diagrams) with { FrontMatter = FrontMatterParser.Parse(block.Body) };
    }

    private RenderedMarkdown Render(string markdown, MarkdownPipeline pipeline, ILinkRewriter? links, bool diagrams)
    {
        var document = Markdown.Parse(markdown, pipeline);
        var sections = SectionExtractor.Extract(document);

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
        pipeline.Setup(renderer);
        if (diagrams)
        {
            Replace<CodeBlockRenderer>(renderer, new DiagramCodeBlockRenderer(links));
            Replace<HtmlCustomContainerRenderer>(renderer, new DiagramContainerRenderer(markdown, links));
        }

        renderer.Render(document);
        writer.Flush();

        return new RenderedMarkdown(_sanitizer.Sanitize(writer.ToString()), sections);
    }

    private static void Replace<T>(HtmlRenderer renderer, IMarkdownObjectRenderer replacement)
        where T : IMarkdownObjectRenderer
    {
        var index = renderer.ObjectRenderers.FindIndex(r => r is T);
        renderer.ObjectRenderers[index] = replacement;
    }
}

/// <summary>
/// The block part of Markdig's custom containers (<c>::: mermaid</c>, Azure DevOps Wiki). Unlike
/// <c>UseCustomContainers()</c> it leaves out the inline <c>::text::</c> form, which would change
/// existing text such as <c>std::vector::size</c>.
/// </summary>
internal sealed class BlockContainersExtension : IMarkdownExtension
{
    public void Setup(MarkdownPipelineBuilder pipeline)
    {
        if (!pipeline.BlockParsers.Contains<CustomContainerParser>())
        {
            pipeline.BlockParsers.InsertBefore<Markdig.Parsers.FencedCodeBlockParser>(new CustomContainerParser());
        }
    }

    public void Setup(MarkdownPipeline pipeline, IMarkdownRenderer renderer)
    {
        if (renderer is HtmlRenderer html && !html.ObjectRenderers.Contains<HtmlCustomContainerRenderer>())
        {
            html.ObjectRenderers.InsertBefore<CodeBlockRenderer>(new HtmlCustomContainerRenderer());
        }
    }
}

/// <summary>Adjusts link and image targets in the parsed document before rendering.</summary>
public interface ILinkRewriter
{
    void Rewrite(LinkInline link);

    void Rewrite(AutolinkInline link);

    /// <summary>Resolves a bare link target (a diagram click link); null when the target is rejected.</summary>
    string? ResolveUrl(string target);
}
