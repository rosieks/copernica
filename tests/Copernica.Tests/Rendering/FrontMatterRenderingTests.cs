using Copernica.Rendering;

namespace Copernica.Tests.Rendering;

/// <summary>Front matter is left out of rendered pages and returned as data (010 FR-002, FR-018, FR-021).</summary>
public sealed class FrontMatterRenderingTests
{
    private readonly MarkdownRenderer _renderer = new();

    [Fact]
    public void Block_is_not_rendered()
    {
        var rendered = _renderer.RenderWithSections("---\ntitle: Setext trap\nowner: Ana\n---\n\nBody text.\n");

        Assert.Equal("<p>Body text.</p>\n", rendered.Html);
        Assert.Empty(rendered.Sections);
        Assert.Equal("Setext trap", rendered.FrontMatter?.Title);
    }

    [Fact]
    public void Pages_without_a_block_have_no_front_matter()
    {
        var rendered = _renderer.RenderWithSections("# Title\n\n---\n\nText\n");

        Assert.Null(rendered.FrontMatter);
        Assert.Contains("<hr>", rendered.Html);
    }

    [Fact]
    public void Unreadable_blocks_are_hidden_too()
    {
        var rendered = _renderer.RenderWithSections("---\ntitle: A\ntitle: B\n---\n\nBody.\n");

        Assert.Equal("<p>Body.</p>\n", rendered.Html);
        Assert.False(rendered.FrontMatter?.Readable);
    }

    [Fact]
    public void Hostile_values_never_reach_the_html()
    {
        var text = FrontMatterFixtures.Read("hostile", "script-values.md");

        var rendered = _renderer.RenderWithSections(text);

        Assert.DoesNotContain("alert", rendered.Html);
        Assert.DoesNotContain("script", rendered.Html);
        Assert.Equal("<script>alert(1)</script>", rendered.FrontMatter?.Title);
    }

    [Fact]
    public void Comments_keep_a_leading_block_as_text()
    {
        var html = _renderer.Render("---\nnot: front matter\n---\n\nComment.\n");

        Assert.Contains("not: front matter", html);
    }

    /// <summary>SC-007: pages without front matter render as before.</summary>
    [Theory]
    [InlineData("# Getting started\n\nSome *text*.\n", "<h1 id=\"user-content-getting-started\">Getting started</h1>\n<p>Some <em>text</em>.</p>\n")]
    [InlineData("Intro\n\n---\n\nAfter\n", "<p>Intro</p>\n<hr>\n<p>After</p>\n")]
    [InlineData("- [x] done\n- [ ] todo\n", "<ul class=\"contains-task-list\">\n<li class=\"task-list-item\"><input disabled=\"disabled\" type=\"checkbox\" checked=\"checked\"> done</li>\n<li class=\"task-list-item\"><input disabled=\"disabled\" type=\"checkbox\"> todo</li>\n</ul>\n")]
    public void Pages_without_front_matter_are_unchanged(string markdown, string html)
    {
        Assert.Equal(html, _renderer.RenderWithSections(markdown).Html);
    }

    public static TheoryData<string> Corpus() => FrontMatterFixtures.Names("corpus");

    [Theory]
    [MemberData(nameof(Corpus))]
    public void Section_ids_below_the_block_do_not_change(string name)
    {
        var text = FrontMatterFixtures.Read("corpus", name);
        var block = FrontMatter.Locate(text);
        var without = block is null ? text : text[block.End..];

        var rendered = _renderer.RenderWithSections(text);

        Assert.Equal(_renderer.RenderWithSections(without).Sections, rendered.Sections);
        Assert.Equal(_renderer.RenderWithSections(without).Html, rendered.Html);
    }
}
