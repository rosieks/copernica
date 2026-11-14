using Copernica.Rendering;
using Markdig;
using Markdig.Extensions.Yaml;
using Markdig.Syntax;

namespace Copernica.Tests.Rendering;

/// <summary>Which text is a front matter block (010 FR-001, research R1).</summary>
public sealed class FrontMatterLocateTests
{
    [Theory]
    [InlineData("---\ntitle: A\n---\nBody\n", "title: A\n")]
    [InlineData("---\r\ntitle: A\r\n---\r\nBody\r\n", "title: A\r\n")]
    [InlineData("﻿---\ntitle: A\n---\n", "title: A\n")]
    [InlineData("---   \ntitle: A\n---\t\n", "title: A\n")]
    [InlineData("---\ntitle: A\n...\nBody\n", "title: A\n")]
    [InlineData("---\n---\n", "")]
    [InlineData("---\ntitle: A\n---", "title: A\n")]
    public void Finds_the_block_and_its_body(string text, string body)
    {
        var block = FrontMatter.Locate(text);

        Assert.NotNull(block);
        Assert.Equal(body, block.Body);
        Assert.Equal(body, text[block.BodyStart..block.BodyEnd]);
        Assert.Equal(text.StartsWith('﻿') ? 1 : 0, block.Start);
    }

    [Theory]
    [InlineData("\n---\ntitle: A\n---\n")]
    [InlineData("Intro\n---\ntitle: A\n---\n")]
    [InlineData("---\ntitle: A\nno closing line\n")]
    [InlineData("+++\ntitle = \"A\"\n+++\n")]
    [InlineData("----\ntitle: A\n----\n")]
    [InlineData(" ---\ntitle: A\n---\n")]
    [InlineData("# Page\n\n---\n\nText\n")]
    [InlineData("")]
    public void Other_text_is_not_a_block(string text)
    {
        Assert.Null(FrontMatter.Locate(text));
    }

    [Fact]
    public void Block_end_is_after_the_closing_line()
    {
        const string text = "---\na: 1\n---\n# Title\n";

        var block = FrontMatter.Locate(text)!;

        Assert.Equal("# Title\n", text[block.End..]);
    }

    public static TheoryData<string, string> AllFixtures()
    {
        var data = new TheoryData<string, string>();
        foreach (var set in new[] { "corpus", "hostile" })
        {
            foreach (var name in FrontMatterFixtures.Files(set))
            {
                data.Add(set, name);
            }
        }

        return data;
    }

    /// <summary>
    /// Markdig's extension takes the block <see cref="FrontMatter.Locate"/> finds (research R1). The one
    /// known difference, an empty block, is blanked out by the renderer (FrontMatterRenderingTests).
    /// </summary>
    [Theory]
    [MemberData(nameof(AllFixtures))]
    public void Markdig_agrees_with_locate(string set, string name)
    {
        var text = FrontMatterFixtures.Read(set, name);
        var pipeline = new MarkdownPipelineBuilder().UseYamlFrontMatter().Build();

        var markdig = Markdown.Parse(text, pipeline).Descendants<YamlFrontMatterBlock>().SingleOrDefault();
        var block = FrontMatter.Locate(text);

        Assert.Equal(block is not null && block.Body.Length > 0, markdig is not null);
        if (block is not null && markdig is not null)
        {
            Assert.Equal(block.Start, markdig.Span.Start);
        }
    }
}
