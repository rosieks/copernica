using AngleSharp.Html.Parser;
using Copernica.Rendering;

namespace Copernica.Tests.Rendering;

/// <summary>Server markup for Mermaid blocks (004 contracts/rendering.md).</summary>
public sealed class DiagramTests
{
    private static readonly HashSet<string> Pages = ["index.md", "guides/setup.md", "guides/x.md"];

    private static string Render(string markdown, bool diagrams = true) =>
        new MarkdownRenderer().Render(markdown, new WikiLinkRewriter("handbook", "guides/setup.md", "abc123", Pages.Contains), diagrams);

    private static string Fence(string source) => $"```mermaid\n{source}\n```";

    private static AngleSharp.Dom.IElement Figure(string html) =>
        new HtmlParser().ParseDocument($"<body>{html}</body>").QuerySelector("figure.diagram")
        ?? throw new Xunit.Sdk.XunitException($"No diagram figure in: {html}");

    [Theory]
    [InlineData("```mermaid\ngraph TD\n  A --> B\n```")]
    [InlineData("```Mermaid\ngraph TD\n  A --> B\n```")]
    [InlineData("::: mermaid\ngraph TD\n  A --> B\n:::")]
    public void Mermaid_blocks_become_figures(string markdown)
    {
        var figure = Figure(Render(markdown));

        Assert.Equal("mermaid", figure.GetAttribute("data-diagram"));
        Assert.Equal("Flowchart", figure.GetAttribute("data-diagram-type"));
        Assert.Equal("graph TD\n  A --> B\n", figure.QuerySelector("pre.diagram__source > code")!.TextContent);
    }

    [Fact]
    public void Container_source_is_not_parsed_as_markdown()
    {
        var figure = Figure(Render("::: mermaid\nmindmap\n  root\n    - item\n    *bold*\n:::"));

        Assert.Equal("mindmap\n  root\n    - item\n    *bold*\n", figure.QuerySelector("code")!.TextContent);
        Assert.Null(figure.QuerySelector("ul, em"));
    }

    [Fact]
    public void Other_code_blocks_are_unchanged()
    {
        var html = Render("```js\nlet a = 1;\n```");

        Assert.Contains("<pre><code class=\"language-js\">", html);
        Assert.DoesNotContain("diagram", html);
    }

    [Fact]
    public void Comments_keep_diagram_text_as_code()
    {
        var html = Render(Fence("graph TD\n  A --> B"), diagrams: false);

        Assert.Contains("<code class=\"language-mermaid\">", html);
        Assert.DoesNotContain("<figure", html);
    }

    [Theory]
    [InlineData("std::vector::size and a::b::c")]
    [InlineData("Scope ::x:: here")]
    public void Double_colons_in_text_stay_literal(string text)
    {
        var html = Render(text);

        Assert.Equal($"<p>{text}</p>\n", html);
    }

    [Theory]
    [InlineData("flowchart LR", "Flowchart")]
    [InlineData("graph TD", "Flowchart")]
    [InlineData("sequenceDiagram", "Sequence")]
    [InlineData("classDiagram", "Class")]
    [InlineData("stateDiagram", "State")]
    [InlineData("stateDiagram-v2", "State")]
    [InlineData("erDiagram", "Entity relationship")]
    [InlineData("gantt", "Gantt")]
    [InlineData("pie", "Pie chart")]
    [InlineData("gitGraph", "Git graph")]
    [InlineData("journey", "User journey")]
    [InlineData("mindmap", "Mind map")]
    [InlineData("timeline", "Timeline")]
    [InlineData("quadrantChart", "Quadrant chart")]
    [InlineData("xychart", "XY chart")]
    [InlineData("xychart-beta", "XY chart")]
    [InlineData("sankey-beta", "Mermaid")]
    [InlineData("%% comment\n%%{init: {}}%%\nsequenceDiagram", "Sequence")]
    [InlineData("---\ntitle: Front\n---\nclassDiagram", "Class")]
    public void Type_comes_from_the_first_keyword(string source, string type)
    {
        Assert.Equal(type, DiagramBlock.Parse(source).Type);
    }

    [Theory]
    [InlineData("gantt\n  title Release plan\n  accTitle: Plan for 2.0\n", "Plan for 2.0")]
    [InlineData("gantt\n  title Release plan\n", "Release plan")]
    [InlineData("pie title Pets adopted\n  \"Dogs\" : 3\n", "Pets adopted")]
    [InlineData("---\ntitle: Front matter name\n---\nflowchart LR\n  A-->B\n", "Front matter name")]
    [InlineData("flowchart LR\n  A-->B\n", "Flowchart diagram")]
    [InlineData("sankey-beta\n", "Mermaid diagram")]
    public void Name_prefers_acc_title_then_title_then_type(string source, string name)
    {
        Assert.Equal(name, DiagramBlock.Parse(source).Name);
    }

    [Fact]
    public void Name_is_limited_to_200_characters()
    {
        var name = DiagramBlock.Parse($"flowchart LR\n  accTitle: {new string('n', 300)}\n").Name;

        Assert.Equal(200, name.Length);
    }

    [Theory]
    [InlineData("flowchart LR\n  accDescr: One line\n", "One line")]
    [InlineData("flowchart LR\n  accDescr {\n    First line\n    second line\n  }\n  A-->B\n", "First line second line")]
    [InlineData("flowchart LR\n  A-->B\n", null)]
    public void Description_comes_from_acc_descr(string source, string? description)
    {
        Assert.Equal(description, DiagramBlock.Parse(source).Description);
    }

    [Fact]
    public void Description_is_limited_to_1000_characters()
    {
        var description = DiagramBlock.Parse($"flowchart LR\n  accDescr: {new string('d', 1500)}\n").Description;

        Assert.Equal(1000, description!.Length);
    }

    [Fact]
    public void Metadata_is_written_as_attributes()
    {
        var figure = Figure(Render(Fence("sequenceDiagram\n  accTitle: Login sequence\n  accDescr: How a user signs in\n  A->>B: hi")));

        Assert.Equal("Sequence", figure.GetAttribute("data-diagram-type"));
        Assert.Equal("Login sequence", figure.GetAttribute("data-diagram-name"));
        Assert.Equal("How a user signs in", figure.GetAttribute("data-diagram-description"));
        Assert.False(figure.HasAttribute("data-diagram-too-large"));
    }

    [Fact]
    public void Sources_over_the_limit_are_marked_too_large()
    {
        var source = "flowchart LR\n" + string.Concat(Enumerable.Repeat("  A --> B\n", 2_100));
        var figure = Figure(Render(Fence(source)));

        Assert.Equal("true", figure.GetAttribute("data-diagram-too-large"));
        Assert.True(source.Length > DiagramBlock.MaxSourceLength);
    }

    [Fact]
    public void Click_links_become_a_list_of_wiki_links()
    {
        var figure = Figure(Render(Fence(
            "flowchart LR\n  A-->B\n" +
            "  click A \"x.md\" \"Setup\"\n" +
            "  click B href \"https://example.com\"\n" +
            "  click C \"javascript:alert(1)\"\n" +
            "  click D \"data:text/html,hi\"\n" +
            "  click E \"../../escape.md\"\n" +
            "  click F call fn()\n" +
            "  click G callback \"tooltip\"")));

        var links = figure.QuerySelectorAll("ul.diagram__links > li > a")
            .Select(a => (Href: a.GetAttribute("href"), Label: a.TextContent))
            .ToList();

        Assert.Equal("Links in this diagram", figure.QuerySelector("ul.diagram__links")!.GetAttribute("aria-label"));
        Assert.Equal([("/s/handbook/guides/x.md", "Setup"), ("https://example.com", "B")], links);
    }

    [Fact]
    public void Diagrams_without_links_have_no_list()
    {
        Assert.Null(Figure(Render(Fence("flowchart LR\n  A-->B"))).QuerySelector("ul"));
    }

    [Fact]
    public void Source_is_escaped()
    {
        var html = Render(Fence("flowchart LR\n  A[\"<script>alert(1)</script>\"] --> B[\"<img src=x onerror=alert(1)>\"]"));

        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", html);
        Assert.DoesNotContain("<script", html);
        Assert.DoesNotContain("<img", html);
    }

    [Fact]
    public void Attribute_values_are_escaped()
    {
        var figure = Figure(Render(Fence("flowchart LR\n  accTitle: a\" onmouseover=\"alert(1)\n  A-->B")));

        Assert.False(figure.HasAttribute("onmouseover"));
        Assert.Equal("a\" onmouseover=\"alert(1)", figure.GetAttribute("data-diagram-name"));
    }

    [Fact]
    public void Sanitizer_keeps_diagram_markup_and_strips_handlers()
    {
        var sanitizer = HtmlSanitizerFactory.Create();
        var html = sanitizer.Sanitize(
            "<figure class=\"diagram\" data-diagram=\"mermaid\" data-diagram-type=\"Flowchart\" data-diagram-name=\"n\" " +
            "data-diagram-description=\"d\" data-diagram-too-large=\"true\" data-other=\"x\" onclick=\"alert(1)\">" +
            "<pre class=\"diagram__source\"><code>graph</code></pre>" +
            "<ul class=\"diagram__links\" aria-label=\"Links in this diagram\"><li><a href=\"/s/a/b.md\">b</a></li></ul></figure>");

        var figure = Figure(html);
        Assert.Equal("diagram", figure.ClassName);
        foreach (var name in new[] { "data-diagram", "data-diagram-type", "data-diagram-name", "data-diagram-description", "data-diagram-too-large" })
        {
            Assert.True(figure.HasAttribute(name), name);
        }

        Assert.False(figure.HasAttribute("onclick"));
        Assert.False(figure.HasAttribute("data-other"));
        Assert.NotNull(figure.QuerySelector("pre.diagram__source"));
        Assert.Equal("Links in this diagram", figure.QuerySelector("ul.diagram__links")!.GetAttribute("aria-label"));
    }

    [Fact]
    public void Plain_text_is_the_source_followed_by_link_labels()
    {
        var html = Render("Before\n\n" + Fence("flowchart LR\n  A-->B\n  click A \"x.md\" \"Setup\"") + "\n\nAfter");

        Assert.Equal("Before\nflowchart LR\n  A-->B\n  click A \"x.md\" \"Setup\"\nSetup\nAfter\n", PlainTextExtractor.Extract(html));
    }
}
