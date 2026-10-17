using Copernica.Rendering;

namespace Copernica.Tests.Rendering;

public sealed class SanitizationTests
{
    private readonly MarkdownRenderer _renderer = new();

    [Theory]
    [InlineData("<script>alert(1)</script>", "<script")]
    [InlineData("<img src=x onerror=alert(1)>", "onerror")]
    [InlineData("[click](javascript:alert(1))", "javascript:")]
    [InlineData("<a href=\"javascript:alert(1)\">x</a>", "javascript:")]
    [InlineData("<iframe src=\"https://example.test\"></iframe>", "<iframe")]
    [InlineData("<style>body{display:none}</style>", "<style")]
    [InlineData("<p style=\"position:fixed\">x</p>", "style=")]
    [InlineData("<form action=\"/x\"><input type=\"text\"></form>", "<form")]
    [InlineData("<input type=\"text\" value=\"x\">", "<input")]
    [InlineData("<object data=\"x.swf\"></object>", "<object")]
    [InlineData("<svg><script>alert(1)</script></svg>", "<script")]
    [InlineData("<a href=\"data:text/html,<script>alert(1)</script>\">x</a>", "data:")]
    public void Unsafe_markup_is_removed(string markdown, string forbidden)
    {
        var html = _renderer.Render(markdown);

        Assert.DoesNotContain(forbidden, html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Tables_are_kept()
    {
        var html = _renderer.Render("| a | b |\n|---|---|\n| 1 | 2 |");

        Assert.Contains("<table>", html);
        Assert.Contains("<td>1</td>", html);
    }

    [Fact]
    public void Task_lists_keep_disabled_checkboxes()
    {
        var html = _renderer.Render("- [x] done\n- [ ] open");

        Assert.Contains("type=\"checkbox\"", html);
        Assert.Contains("disabled", html);
        Assert.Contains("checked", html);
    }

    [Fact]
    public void Code_blocks_are_kept_and_escaped()
    {
        var html = _renderer.Render("```html\n<script>alert(1)</script>\n```");

        Assert.Contains("<pre><code class=\"language-html\">", html);
        Assert.Contains("&lt;script&gt;", html);
    }

    [Fact]
    public void Images_are_kept()
    {
        var html = _renderer.Render("![diagram](https://example.test/a.png)");

        Assert.Contains("<img src=\"https://example.test/a.png\" alt=\"diagram\">", html);
    }

    [Fact]
    public void External_links_get_noopener_noreferrer()
    {
        var html = _renderer.Render("[site](https://example.test)");

        Assert.Contains("rel=\"noopener noreferrer\"", html);
    }

    [Fact]
    public void Headings_get_ids_for_anchors()
    {
        var html = _renderer.Render("# Getting started");

        Assert.Contains("id=\"getting-started\"", html);
    }
}
