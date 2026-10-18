using Copernica.Attachments;
using Copernica.Rendering;

namespace Copernica.Tests.Attachments;

public sealed class ReferencedImagesTests
{
    private readonly ReferencedImages _images = new(new MarkdownRenderer());

    [Fact]
    public void Relative_root_relative_and_reference_style_images_are_collected()
    {
        const string markdown = """
            ![a](../.attachments/x.png)
            ![b](/.attachments/y.png "title")
            ![c][ref]
            ![d](z%20space.png#frag)

            [ref]: ../img/r.png
            """;

        var paths = _images.Collect(markdown, "guides/setup.md");

        Assert.Equal(
            new[] { ".attachments/x.png", ".attachments/y.png", "img/r.png", "guides/z space.png" }.Order(),
            paths.Order());
    }

    [Fact]
    public void External_wiki_html_and_escaping_targets_are_ignored()
    {
        const string markdown = """
            ![web](https://example.com/a.png)
            ![proto](//cdn.example.com/a.png)
            ![wiki](wiki:other/a.png)
            ![out](../../../a.png)
            <img src=".attachments/html.png">
            [link, not image](.attachments/link.png)
            """;

        Assert.Empty(_images.Collect(markdown, "guides/setup.md"));
    }
}
