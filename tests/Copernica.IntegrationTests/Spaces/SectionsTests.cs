using System.Text.Json;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Spaces;

/// <summary>The <c>sections</c> list of pages and previews (009 contracts/api.md).</summary>
public sealed class SectionsTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;
    private string _firstVersion = "";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _firstVersion = _remote.Commit(new Dictionary<string, string?>
        {
            ["guide.md"] = "# Guide\n\n## Setup\n\n## Setup\n\n#### Detail\n",
            ["huge.md"] = "# Huge\n\n## Part\n\n" + new string('x', 5000),
        });
        _remote.Commit("guide.md", "# Guide\n\n## Intro\n\n## Setup\n\n### Zażółć gęślą jaźń\n");
        _factory = new CopernicaFactory().AddSpace("wiki", _remote).Set("Copernica:MaxRenderBytes", "4000");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Page_lists_its_h1_to_h3_sections()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetPageAsync("wiki", "guide.md");

        Assert.Equal(
            [(1, "guide", "Guide"), (2, "intro", "Intro"), (2, "setup", "Setup"), (3, "zażółć-gęślą-jaźń", "Zażółć gęślą jaźń")],
            Sections(page));
        Assert.Contains("id=\"user-content-setup\"", page.GetProperty("html").GetString());
    }

    [Fact]
    public async Task Earlier_versions_list_their_own_sections()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetFromJsonAsync<JsonElement>($"/api/spaces/wiki/pages/guide.md?version={_firstVersion}", Ct);

        Assert.Equal([(1, "guide", "Guide"), (2, "setup", "Setup"), (2, "setup-1", "Setup")], Sections(page));
    }

    [Fact]
    public async Task Too_large_pages_have_no_sections()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetPageAsync("wiki", "huge.md");

        Assert.True(page.GetProperty("tooLarge").GetBoolean());
        Assert.Empty(page.GetProperty("sections").EnumerateArray());
    }

    [Fact]
    public async Task Preview_lists_the_sections_of_the_posted_markdown()
    {
        var client = await _factory.SignInAsync();

        var response = await client.PostAsJsonAsync("/api/render", new { spaceId = "wiki", path = "guide.md", markdown = "# New\n\n## Unsaved\n" }, Ct);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

        Assert.Equal([(1, "new", "New"), (2, "unsaved", "Unsaved")], Sections(preview));
    }

    private static List<(int, string, string)> Sections(JsonElement response) =>
        response.GetProperty("sections").EnumerateArray()
            .Select(s => (s.GetProperty("level").GetInt32(), s.GetProperty("id").GetString()!, s.GetProperty("text").GetString()!))
            .ToList();

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
