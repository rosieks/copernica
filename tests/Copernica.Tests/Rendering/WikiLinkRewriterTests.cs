using Copernica.Rendering;

namespace Copernica.Tests.Rendering;

public sealed class WikiLinkRewriterTests
{
    private static readonly HashSet<string> Pages = ["index.md", "guides/setup.md", "guides/deep/more.md", "My Page.md"];

    private static string Render(string markdown, string pagePath = "guides/setup.md")
    {
        var rewriter = new WikiLinkRewriter("handbook", pagePath, "abc123", Pages.Contains);
        return new MarkdownRenderer().Render(markdown, rewriter);
    }

    [Theory]
    [InlineData("[x](deep/more.md)", "href=\"/s/handbook/guides/deep/more.md\"")]
    [InlineData("[x](../index.md)", "href=\"/s/handbook/index.md\"")]
    [InlineData("[x](./setup.md#install)", "href=\"/s/handbook/guides/setup.md#install\"")]
    [InlineData("[x](/index.md)", "href=\"/s/handbook/index.md\"")]
    [InlineData("[x](../My%20Page.md)", "href=\"/s/handbook/My%20Page.md\"")]
    public void Relative_markdown_links_become_wiki_routes(string markdown, string expected)
    {
        Assert.Contains(expected, Render(markdown));
    }

    [Fact]
    public void Cross_space_links_use_the_wiki_scheme()
    {
        var html = Render("[x](wiki:payments-docs/api/overview.md)");

        Assert.Contains("href=\"/s/payments-docs/api/overview.md\"", html);
    }

    [Fact]
    public void Relative_images_point_to_the_files_endpoint_at_the_page_version()
    {
        var html = Render("![d](../img/diagram.png)");

        Assert.Contains("src=\"/api/spaces/handbook/files/img/diagram.png?version=abc123\"", html);
    }

    [Fact]
    public void Relative_non_markdown_links_point_to_the_files_endpoint()
    {
        var html = Render("[pdf](files/spec.pdf)");

        Assert.Contains("href=\"/api/spaces/handbook/files/guides/files/spec.pdf?version=abc123\"", html);
    }

    [Fact]
    public void Links_to_missing_pages_are_marked_broken()
    {
        var html = Render("[x](missing.md)");

        Assert.Contains("class=\"broken-link\"", html);
        Assert.Contains("href=\"/s/handbook/guides/missing.md\"", html);
    }

    [Fact]
    public void Links_escaping_the_space_are_not_resolved()
    {
        var html = Render("[x](../../outside.md)");

        Assert.DoesNotContain("/s/handbook", html);
        Assert.Contains("class=\"broken-link\"", html);
    }

    [Theory]
    [InlineData("[x](https://example.test/a.md)", "href=\"https://example.test/a.md\"")]
    [InlineData("[x](#section)", "href=\"#section\"")]
    [InlineData("[x](mailto:team@example.test)", "href=\"mailto:team@example.test\"")]
    public void Absolute_and_fragment_links_are_unchanged(string markdown, string expected)
    {
        Assert.Contains(expected, Render(markdown));
    }

    [Fact]
    public void External_links_get_noopener()
    {
        Assert.Contains("rel=\"noopener noreferrer\"", Render("[x](https://example.test)"));
    }

    [Fact]
    public void Root_relative_images_resolve_from_the_space_root()
    {
        // Azure DevOps Wiki style (003 FR-016); also on Linux, where .NET parses "/x" as a file URI.
        var html = Render("![x](/.attachments/x.png)");

        Assert.Contains("src=\"/api/spaces/handbook/files/.attachments/x.png?version=abc123\"", html);
    }

    [Fact]
    public void Root_relative_images_cannot_escape_the_space()
    {
        var html = Render("![y](/../secret.png)");

        Assert.DoesNotContain("secret.png", html);
    }

    [Fact]
    public void Pending_images_are_shown_from_their_upload()
    {
        var rewriter = new WikiLinkRewriter("handbook", "guides/setup.md", "abc123", Pages.Contains,
            new Dictionary<string, string> { [".attachments/new.png"] = "/api/uploads/0123" });

        var html = new MarkdownRenderer().Render("![n](../.attachments/new.png) ![o](../img/old.png)", rewriter);

        Assert.Contains("src=\"/api/uploads/0123\"", html);
        Assert.Contains("src=\"/api/spaces/handbook/files/img/old.png?version=abc123\"", html);
    }

    [Theory]
    [InlineData("/x", false)]
    [InlineData("//cdn.example.com/x.png", true)]
    [InlineData("https://example.com/x.png", true)]
    [InlineData("mailto:a@example.com", true)]
    [InlineData("x.png", false)]
    public void External_targets_are_recognized(string target, bool external)
    {
        Assert.Equal(external, WikiLinkRewriter.IsExternal(target));
    }
}
