using Copernica.Attachments;

namespace Copernica.Tests.Attachments;

public sealed class AttachmentLocationTests
{
    [Theory]
    [InlineData(".attachments", "index.md", ".attachments")]
    [InlineData(".attachments", "guides/setup.md", ".attachments")]
    [InlineData("images", "guides/setup.md", "images")]
    [InlineData("{page}.assets", "index.md", "index.assets")]
    [InlineData("{page}.assets", "guides/setup.md", "guides/setup.assets")]
    [InlineData("{dir}", "index.md", "")]
    [InlineData("{dir}", "guides/setup.md", "guides")]
    [InlineData("{dir}/img", "index.md", "img")]
    [InlineData("{dir}/img", "guides/setup.md", "guides/img")]
    public void Templates_expand_per_page(string template, string page, string folder)
    {
        Assert.True(AttachmentLocation.TryParse(template, out var location, out var error), error);

        Assert.Equal(folder, location.FolderFor(page));
        Assert.Equal(folder.Length == 0 ? "a.png" : $"{folder}/a.png", location.PathFor(page, "a.png"));
    }

    [Theory]
    [InlineData("..")]
    [InlineData("../x")]
    [InlineData("a/../../x")]
    [InlineData("/abs")]
    [InlineData("a\\b")]
    [InlineData("{unknown}")]
    [InlineData("{page")]
    [InlineData("")]
    [InlineData("   ")]
    public void Invalid_templates_are_rejected(string template)
    {
        Assert.False(AttachmentLocation.TryParse(template, out _, out var error));
        Assert.False(string.IsNullOrEmpty(error));
    }

    [Theory]
    [InlineData("guides/setup.md", ".attachments/x y.png", "../.attachments/x%20y.png")]
    [InlineData("index.md", "images/a.png", "images/a.png")]
    [InlineData("guides/setup.md", "guides/setup.assets/a.png", "setup.assets/a.png")]
    [InlineData("guides/setup.md", "guides/a.png", "a.png")]
    [InlineData("a/b/c.md", "a/x/y.png", "../x/y.png")]
    [InlineData("a/b/c.md", "z.png", "../../z.png")]
    public void Links_are_relative_to_the_page(string page, string target, string link)
    {
        Assert.Equal(link, AttachmentLocation.RelativeLink(page, target));
    }
}
