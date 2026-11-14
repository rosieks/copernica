using Copernica.Rendering;
using Copernica.Spaces;
using Copernica.Tests.Rendering;

namespace Copernica.Tests.Spaces;

/// <summary>Page titles from front matter and renaming them in place (010 US2, research R5–R6).</summary>
public sealed class FrontMatterTitleTests
{
    [Theory]
    [InlineData("---\ntitle: Release process\n---\n# Heading\n", "Release process")]
    [InlineData("---\ntitle: \"  \"\n---\n# Heading\n", "Heading")]
    [InlineData("---\ntitle:\n---\n# Heading\n", "Heading")]
    [InlineData("---\ntitle: [a, b]\n---\n# Heading\n", "Heading")]
    [InlineData("---\ntitle: A\ntitle: B\n---\n# Heading\n", "Heading")]
    [InlineData("---\ntitle: A\ntitle: B\n---\n", "release process")]
    [InlineData("---\ntitle: Unclosed\n# Heading\n", "Heading")]
    public void Title_rule(string content, string expected)
    {
        Assert.Equal(expected, PageTitle.Resolve(content, "ops/release-process.md"));
    }

    public static TheoryData<string> Corpus() => FrontMatterFixtures.Names("corpus");

    [Theory]
    [MemberData(nameof(Corpus))]
    public void Corpus_titles(string name)
    {
        var expected = FrontMatterFixtures.Expected("corpus", name).GetProperty("title").GetString();

        Assert.Equal(expected, PageTitle.Resolve(FrontMatterFixtures.Read("corpus", name), name));
    }

    [Theory]
    [InlineData("title: Old\n", "New title", "title: New title\n")]
    [InlineData("title: Old # note\n", "New title", "title: New title # note\n")]
    [InlineData("title: Old\n", "Release: v2", "title: \"Release: v2\"\n")]
    [InlineData("title: Old\n", "#1 priority", "title: \"#1 priority\"\n")]
    [InlineData("title: Old\n", "true", "title: \"true\"\n")]
    [InlineData("title: Old\n", "123", "title: \"123\"\n")]
    [InlineData("title: Old\n", "a #b", "title: \"a #b\"\n")]
    [InlineData("title: Old\n", "  Padded  ", "title: Padded\n")]
    [InlineData("title: \"Old\"\n", "Say \"hi\" \\ bye", "title: \"Say \\\"hi\\\" \\\\ bye\"\n")]
    [InlineData("title: 'Old'\n", "It's", "title: 'It''s'\n")]
    [InlineData("title: >\n  Old\n  folded\nnext: 1\n", "New", "title: \"New\"\nnext: 1\n")]
    [InlineData("title: |\n  Old\n", "New", "title: \"New\"\n")]
    [InlineData("layout: x\nTitle: Old\n", "New", "layout: x\nTitle: New\n")]
    public void Replace_changes_only_the_title_value(string yaml, string title, string expectedYaml)
    {
        var content = $"---\n{yaml}---\n\n# Heading\n";

        var updated = FrontMatterTitle.Replace(content, title);

        Assert.Equal($"---\n{expectedYaml}---\n\n# Heading\n", updated);
        Assert.Equal(title.Trim(), FrontMatterParser.Parse(FrontMatter.Locate(updated!)!.Body).Title);
    }

    [Fact]
    public void Replace_keeps_crlf_and_bom()
    {
        const string content = "﻿---\r\ntitle: Old\r\nowner: A\r\n---\r\nBody\r\n";

        Assert.Equal("﻿---\r\ntitle: New\r\nowner: A\r\n---\r\nBody\r\n", FrontMatterTitle.Replace(content, "New"));
    }

    [Theory]
    [InlineData("# Heading\n")]
    [InlineData("---\nlayout: x\n---\n# Heading\n")]
    [InlineData("---\ntitle: A\ntitle: B\n---\n")]
    [InlineData("---\ntitle: [a]\n---\n")]
    public void Replace_returns_null_without_a_title(string content)
    {
        Assert.Null(FrontMatterTitle.Replace(content, "New"));
    }
}
