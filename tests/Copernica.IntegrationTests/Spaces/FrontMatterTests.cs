using System.Net;
using System.Text.Json;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Spaces;

/// <summary>The <c>frontMatter</c> of pages and previews, titles and renames (010 contracts/api.md).</summary>
public sealed class FrontMatterTests : IAsyncLifetime
{
    private const string Release = "---\ntitle: Release process\ndescription: How we release.\ntags: [release, ci]\nstatus: deprecated\nowner: Platform team\nweight: 20\nreviewers: [Ana, Bo]\n---\n\n# Releasing\n\nBody text.\n";

    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;
    private string _firstVersion = "";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _firstVersion = _remote.Commit(new Dictionary<string, string?>
        {
            ["release.md"] = Release.Replace("status: deprecated", "status: draft"),
            ["plain.md"] = "# Plain\n\nText.\n",
            ["broken.md"] = "---\ntitle: A\ntitle: B\n---\n\n# Broken\n",
            ["huge.md"] = "---\ntitle: Huge\n---\n\n" + new string('x', 5000),
        });
        _remote.Commit("release.md", Release);
        _factory = new CopernicaFactory().AddSpace("wiki", _remote).Set("Copernica:MaxRenderBytes", "4000");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Page_returns_its_front_matter_and_title()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetPageAsync("wiki", "release.md");

        Assert.Equal("Release process", page.GetProperty("title").GetString());
        var fm = page.GetProperty("frontMatter");
        Assert.True(fm.GetProperty("readable").GetBoolean());
        Assert.Equal(JsonValueKind.Null, fm.GetProperty("raw").ValueKind);
        Assert.Equal("How we release.", fm.GetProperty("description").GetString());
        Assert.Equal(["release", "ci"], Strings(fm, "tags"));
        Assert.Equal("deprecated", fm.GetProperty("status").GetString());
        Assert.Equal(["Platform team"], Strings(fm, "owners"));
        Assert.Empty(Strings(fm, "authors"));
        Assert.Empty(Strings(fm, "aliases"));

        var properties = fm.GetProperty("properties").EnumerateArray().ToList();
        Assert.Equal(["weight", "reviewers"], properties.Select(p => p.GetProperty("name").GetString()));
        Assert.Equal("text", properties[0].GetProperty("value").GetProperty("kind").GetString());
        Assert.Equal("20", properties[0].GetProperty("value").GetProperty("text").GetString());
        var list = properties[1].GetProperty("value");
        Assert.Equal("list", list.GetProperty("kind").GetString());
        Assert.Equal(["Ana", "Bo"], list.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("text").GetString()));

        var html = page.GetProperty("html").GetString()!;
        Assert.DoesNotContain("status", html);
        Assert.DoesNotContain("<hr", html);
    }

    [Fact]
    public async Task Pages_without_a_block_have_null_front_matter()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetPageAsync("wiki", "plain.md");

        Assert.Equal(JsonValueKind.Null, page.GetProperty("frontMatter").ValueKind);
    }

    [Fact]
    public async Task Unreadable_blocks_return_their_raw_text()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetPageAsync("wiki", "broken.md");

        var fm = page.GetProperty("frontMatter");
        Assert.False(fm.GetProperty("readable").GetBoolean());
        Assert.Equal("title: A\ntitle: B\n", fm.GetProperty("raw").GetString());
        Assert.Equal("Broken", page.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Earlier_versions_return_their_own_front_matter()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetFromJsonAsync<JsonElement>($"/api/spaces/wiki/pages/release.md?version={_firstVersion}", Ct);

        Assert.Equal("draft", page.GetProperty("frontMatter").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Too_large_pages_have_null_front_matter()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetPageAsync("wiki", "huge.md");

        Assert.True(page.GetProperty("tooLarge").GetBoolean());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("frontMatter").ValueKind);
    }

    [Fact]
    public async Task Preview_returns_the_front_matter_of_the_posted_markdown()
    {
        var client = await _factory.SignInAsync();

        var response = await client.PostAsJsonAsync("/api/render", new { spaceId = "wiki", path = "release.md", markdown = "---\ntitle: Draft\nstatus: draft\n---\n" }, Ct);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

        Assert.Equal("Draft", preview.GetProperty("frontMatter").GetProperty("title").GetString());
        Assert.Equal("draft", preview.GetProperty("frontMatter").GetProperty("status").GetString());
        Assert.Equal("", preview.GetProperty("html").GetString());
    }

    [Fact]
    public async Task Tree_uses_the_front_matter_title()
    {
        var client = await _factory.SignInAsync();

        var tree = await client.GetStringAsync("/api/spaces/wiki/tree", Ct);

        Assert.Contains("\"Release process\"", tree);
    }

    [Fact]
    public async Task Rename_rewrites_only_the_front_matter_title()
    {
        var client = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var response = await client.MoveAsync("wiki", "release.md", "release-handbook.md", message: "Rename", retitle: "Release handbook");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(before + 1, _remote.Log().Count);
        Assert.Equal(Release.Replace("title: Release process", "title: Release handbook"), _remote.ReadFile("release-handbook.md"));
    }

    [Fact]
    public async Task Rename_without_front_matter_still_rewrites_the_heading()
    {
        var client = await _factory.SignInAsync();

        var response = await client.MoveAsync("wiki", "plain.md", "simple.md", retitle: "Simple");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("# Simple\n\nText.\n", _remote.ReadFile("simple.md"));
    }

    private static List<string?> Strings(JsonElement element, string name) =>
        element.GetProperty(name).EnumerateArray().Select(e => e.GetString()).ToList();

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
