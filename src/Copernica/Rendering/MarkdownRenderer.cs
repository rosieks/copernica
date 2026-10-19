using Ganss.Xss;
using Markdig;
using Markdig.Extensions.CustomContainers;
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

    private readonly HtmlSanitizer _sanitizer = HtmlSanitizerFactory.Create();

    /// <summary>Parses with the same pipeline as <see cref="Render"/> (e.g. to find image references).</summary>
    public MarkdownDocument Parse(string markdown) => Markdown.Parse(markdown, _pipeline);

    /// <summary>Parses like <see cref="Parse"/>, with precise source spans for links and reference definitions.</summary>
    public MarkdownDocument ParseWithSourceSpans(string markdown) => Markdown.Parse(markdown, _spanPipeline);

    /// <summary>
    /// Renders Markdown and sanitizes the result. <paramref name="links"/> rewrites link targets;
    /// <paramref name="diagrams"/> turns Mermaid blocks into diagram figures (pages and previews, not comments).
    /// </summary>
    public string Render(string markdown, ILinkRewriter? links = null, bool diagrams = false)
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
        if (diagrams)
        {
            Replace<CodeBlockRenderer>(renderer, new DiagramCodeBlockRenderer(links));
            Replace<HtmlCustomContainerRenderer>(renderer, new DiagramContainerRenderer(markdown, links));
        }

        renderer.Render(document);
        writer.Flush();

        return _sanitizer.Sanitize(writer.ToString());
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
