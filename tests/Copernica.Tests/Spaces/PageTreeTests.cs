using Copernica.Spaces;

namespace Copernica.Tests.Spaces;

public sealed class PageTreeTests
{
    [Theory]
    [InlineData("# Getting Started\n\nText", "getting-started.md", "Getting Started")]
    [InlineData("Intro\n\n# Real Title", "x.md", "Real Title")]
    [InlineData("---\ntitle: front\n---\n# From Heading", "x.md", "From Heading")]
    [InlineData("```\n# not a heading\n```\n# Heading", "x.md", "Heading")]
    [InlineData("## Only level two", "release-notes_2026.md", "release notes 2026")]
    [InlineData("", "plain.md", "plain")]
    [InlineData("#NoSpace", "x.md", "x")]
    [InlineData("#  Trailing hashes ##", "x.md", "Trailing hashes")]
    public void Title_is_first_level_one_heading_or_file_name(string content, string path, string expected)
    {
        Assert.Equal(expected, PageTitle.Resolve(content, path));
    }

    [Fact]
    public void Tree_mirrors_folders_with_only_markdown_pages_folders_first()
    {
        var files = new Dictionary<string, string>
        {
            ["zeta.md"] = "# Zeta",
            ["alpha.md"] = "# Alpha",
            ["guides/setup.md"] = "# Setup",
            ["guides/img/diagram.png"] = "binary",
            ["README.txt"] = "not a page",
            ["Beta/b.md"] = "",
        };

        var root = PageTreeBuilder.Build(files.Keys, path => files[path]);

        Assert.Equal(["Beta", "guides", "alpha.md", "zeta.md"], root.Children!.Select(c => c.Name));
        var guides = root.Children!.Single(c => c.Name == "guides");
        Assert.Equal("folder", guides.Kind);
        Assert.Equal("guides", guides.Path);
        var setup = Assert.Single(guides.Children!);
        Assert.Equal(("page", "guides/setup.md", "Setup"), (setup.Kind, setup.Path, setup.Title));
    }

    [Fact]
    public void Folders_without_pages_are_omitted()
    {
        var files = new Dictionary<string, string> { ["img/a.png"] = "", ["index.md"] = "# Home" };

        var root = PageTreeBuilder.Build(files.Keys, path => files[path]);

        Assert.Equal(["index.md"], root.Children!.Select(c => c.Name));
    }
}
