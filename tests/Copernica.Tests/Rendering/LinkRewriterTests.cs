using Copernica.Git;
using Copernica.Rendering;
using Copernica.Spaces;

namespace Copernica.Tests.Rendering;

public sealed class LinkRewriterTests
{
    private readonly LinkRewriter _rewriter = new(new MarkdownRenderer());

    private static MoveMap PageMove(string from, string to) =>
        new([new MoveRecord(from, to, false)], [new KeyValuePair<string, string>(from, to)]);

    private string? Rewrite(string markdown, MoveMap map, string page = "index.md", string? newPage = null) =>
        _rewriter.Rewrite(markdown, page, newPage ?? page, "handbook", map);

    [Theory]
    [InlineData("[Setup](guides/setup.md)", "[Setup](howto/install.md)")]
    [InlineData("[Setup](./guides/setup.md)", "[Setup](./howto/install.md)")]
    [InlineData("[Setup](/guides/setup.md)", "[Setup](/howto/install.md)")]
    [InlineData("[Setup](wiki:handbook/guides/setup.md)", "[Setup](wiki:handbook/howto/install.md)")]
    [InlineData("[Setup](guides/setup.md#install)", "[Setup](howto/install.md#install)")]
    [InlineData("[Setup](guides/setup.md?x=1#a)", "[Setup](howto/install.md?x=1#a)")]
    [InlineData("[Setup](guides/setup.md \"Title\")", "[Setup](howto/install.md \"Title\")")]
    [InlineData("![shot](guides/setup.md)", "![shot](howto/install.md)")]
    public void Links_to_a_moved_page_keep_their_style(string markdown, string expected)
    {
        Assert.Equal(expected, Rewrite(markdown, PageMove("guides/setup.md", "howto/install.md")));
    }

    [Fact]
    public void Links_from_a_sibling_folder_use_the_shortest_relative_path()
    {
        var result = Rewrite("[s](../guides/setup.md)", PageMove("guides/setup.md", "reference/setup.md"), page: "reference/api.md");

        Assert.Equal("[s](setup.md)", result);
    }

    [Fact]
    public void Reference_definitions_are_rewritten_and_reference_links_are_left_alone()
    {
        var markdown = "See [setup][s] and [x].\n\n[s]: guides/setup.md\n[x]: <guides/setup.md> \"Setup\"\n";

        var result = Rewrite(markdown, PageMove("guides/setup.md", "howto/install.md"));

        Assert.Equal("See [setup][s] and [x].\n\n[s]: howto/install.md\n[x]: <howto/install.md> \"Setup\"\n", result);
    }

    [Fact]
    public void Brackets_and_percent_encoding_are_kept()
    {
        var map = PageMove("guides/getting started.md", "howto/first steps.md");

        Assert.Equal("[a](<howto/first steps.md>)", Rewrite("[a](<guides/getting started.md>)", map));
        Assert.Equal("[a](howto/first%20steps.md)", Rewrite("[a](guides/getting%20started.md)", map));
    }

    [Theory]
    [InlineData("Inline `guides/setup.md` and [x](guides/setup.md) in `code`")]
    [InlineData("```\n[x](guides/setup.md)\n```\n")]
    [InlineData("    [x](guides/setup.md)\n")]
    [InlineData("<https://example.com/guides/setup.md>")]
    [InlineData("[ext](https://example.com/guides/setup.md)")]
    [InlineData("<a href=\"guides/setup.md\">raw</a>")]
    [InlineData("[other](wiki:service/guides/setup.md)")]
    [InlineData("[anchor](#guides)")]
    [InlineData("[other page](guides/faq.md)")]
    public void Code_external_raw_html_other_spaces_and_unrelated_links_are_untouched(string markdown)
    {
        var result = Rewrite(markdown, PageMove("guides/setup.md", "howto/install.md"));

        if (markdown.StartsWith("Inline", StringComparison.Ordinal))
        {
            Assert.Equal("Inline `guides/setup.md` and [x](howto/install.md) in `code`", result);
        }
        else
        {
            Assert.Null(result);
        }
    }

    [Fact]
    public void Relative_links_inside_a_moved_page_still_reach_their_targets()
    {
        var markdown = "# Setup\n\nSee [API](../reference/api.md), ![](../.attachments/s.png), [root](/index.md) and [self](#x).\n";

        var result = Rewrite(markdown, PageMove("guides/setup.md", "reference/deep/setup.md"), page: "guides/setup.md", newPage: "reference/deep/setup.md");

        Assert.Equal("# Setup\n\nSee [API](../api.md), ![](../../.attachments/s.png), [root](/index.md) and [self](#x).\n", result);
    }

    [Fact]
    public void Relative_links_that_still_resolve_after_the_move_are_kept_as_written()
    {
        var markdown = "See [API](../reference/api.md) and ![](../.attachments/s.png).\n";

        Assert.Null(Rewrite(markdown, PageMove("guides/setup.md", "reference/setup.md"), page: "guides/setup.md", newPage: "reference/setup.md"));
    }

    [Fact]
    public void A_moved_page_linking_to_itself_follows_its_new_name()
    {
        var result = Rewrite("[top](setup.md#top)", PageMove("guides/setup.md", "guides/install.md"), page: "guides/setup.md", newPage: "guides/install.md");

        Assert.Equal("[top](install.md#top)", result);
    }

    [Fact]
    public void Links_between_pages_moved_together_stay_byte_identical()
    {
        var map = new MoveMap(
            [new MoveRecord("guides", "docs/guides", true)],
            [new("guides/a.md", "docs/guides/a.md"), new("guides/b.md", "docs/guides/b.md")]);

        Assert.Null(Rewrite("[b](b.md) [b2](./b.md)", map, page: "guides/a.md", newPage: "docs/guides/a.md"));
        Assert.Equal("[i](../../index.md)", Rewrite("[i](../index.md)", map, page: "guides/a.md", newPage: "docs/guides/a.md"));
    }

    [Fact]
    public void Output_differs_from_input_only_inside_url_spans()
    {
        var markdown = "# Title *with* [Setup](guides/setup.md \"t\")\n\n| a | [b](guides/setup.md) |\n|---|---|\n\n- [ ] task [c](/guides/setup.md)\n\nTrailing   spaces   kept.  \n";

        var result = Rewrite(markdown, PageMove("guides/setup.md", "g/s.md"));

        Assert.Equal(markdown.Replace("guides/setup.md", "g/s.md", StringComparison.Ordinal), result);
    }

    [Fact]
    public void Prefilter_matches_names_raw_and_encoded()
    {
        var map = PageMove("guides/getting started.md", "x.md");

        Assert.True(LinkRewriter.MayReference("[a](guides/getting%20started.md)", map));
        Assert.True(LinkRewriter.MayReference("[a](<guides/getting started.md>)", map));
        Assert.False(LinkRewriter.MayReference("[a](guides/other.md)", map));
    }

    [Theory]
    [InlineData("", "a.md", "a.md")]
    [InlineData("guides", "guides/a.md", "a.md")]
    [InlineData("guides", "reference/a.md", "../reference/a.md")]
    [InlineData("a/b/c", "a/x.md", "../../x.md")]
    [InlineData("a", "index.md", "../index.md")]
    public void Relative_paths(string from, string target, string expected)
    {
        Assert.Equal(expected, LinkRewriter.Relative(from, target));
    }
}
