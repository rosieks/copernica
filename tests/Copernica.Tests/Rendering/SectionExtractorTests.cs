using System.Text.Json;
using Copernica.Rendering;

namespace Copernica.Tests.Rendering;

/// <summary>
/// Section ids and the H1–H3 list (009). The golden slugs are also checked against the browser's
/// resolver in src/web/src/sections/resolveSection.test.ts, and guard against changes to existing
/// section addresses (SC-006).
/// </summary>
public sealed class SectionExtractorTests
{
    private readonly MarkdownRenderer _renderer = new();

    public static TheoryData<string, string> Slugs()
    {
        var data = new TheoryData<string, string>();
        var path = Path.Combine(FindRoot(), "tests", "fixtures", "sections", "slugs.json");
        var slugs = JsonSerializer.Deserialize<List<Slug>>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        foreach (var slug in slugs)
        {
            data.Add(slug.Text, slug.Id);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Slugs))]
    public void Section_ids_are_unchanged(string text, string id)
    {
        var rendered = _renderer.RenderWithSections($"## {text}\n");

        Assert.Equal(id, Assert.Single(rendered.Sections).Id);
        Assert.Contains($"id=\"user-content-{id}\"", rendered.Html);
    }

    [Fact]
    public void Duplicates_get_numbered_suffixes_in_page_order()
    {
        var rendered = _renderer.RenderWithSections("## Setup\n\n## Setup\n\n## Setup\n\n## Setup-1\n");

        Assert.Equal(["setup", "setup-1", "setup-2", "setup-1-1"], rendered.Sections.Select(s => s.Id));
    }

    [Fact]
    public void Only_levels_one_to_three_are_listed_in_document_order()
    {
        var rendered = _renderer.RenderWithSections("### Three\n\n# One\n\n#### Four\n\n## Two\n");

        Assert.Equal([(3, "three"), (1, "one"), (2, "two")], rendered.Sections.Select(s => (s.Level, s.Id)));
        Assert.Contains("id=\"user-content-four\"", rendered.Html);
    }

    [Fact]
    public void Headings_in_quotes_and_lists_are_listed_but_not_code_or_raw_html()
    {
        var rendered = _renderer.RenderWithSections(
            "> ## In quote\n\n- ## In list\n\n```\n## In code\n```\n\n<h2>Raw</h2>\n\n<h2 id=\"custom\">Custom</h2>\n");

        Assert.Equal(["in-quote", "in-list"], rendered.Sections.Select(s => s.Id));
    }

    [Fact]
    public void Text_is_the_visible_heading_text()
    {
        var rendered = _renderer.RenderWithSections("## `code` and **bold** [link](x) &amp; more\n");

        var section = Assert.Single(rendered.Sections);
        Assert.Equal("code and bold link & more", section.Text);
        Assert.Equal(2, section.Level);
        Assert.DoesNotContain("user-content-", section.Id);
    }

    [Fact]
    public void Setext_headings_are_listed()
    {
        var rendered = _renderer.RenderWithSections("Title\n=====\n\nPart\n----\n");

        Assert.Equal([(1, "title"), (2, "part")], rendered.Sections.Select(s => (s.Level, s.Id)));
    }

    private static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Copernica.slnx")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("Repository root not found.");
    }

    private sealed record Slug(string Text, string Id);
}
