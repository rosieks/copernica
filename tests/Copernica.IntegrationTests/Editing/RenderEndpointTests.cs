using System.Net;
using System.Text.Json;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Editing;

public sealed class RenderEndpointTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit(new Dictionary<string, string?>
        {
            ["guides/page.md"] = "# Page\n\nSee [index](../index.md) and [missing](missing.md).\n<script>alert(1)</script>",
            ["index.md"] = "# Index",
        });
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Preview_matches_the_page_pipeline()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("wiki", "guides/page.md");

        var response = await client.PostAsJsonAsync("/api/render", new { spaceId = "wiki", path = "guides/page.md", markdown = page.GetProperty("source").GetString() }, Ct);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

        Assert.Equal(page.GetProperty("html").GetString(), preview.GetProperty("html").GetString());
        Assert.DoesNotContain("<script", preview.GetProperty("html").GetString());
    }

    [Fact]
    public async Task Preview_requires_antiforgery_token()
    {
        await _factory.SignInAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/render")
        {
            Content = JsonContent.Create(new { spaceId = "wiki", path = "a.md", markdown = "x" }),
        };
        request.Headers.Add("X-Skip-Antiforgery", "1");
        var client = await _factory.SignInAsync();

        var response = await client.SendAsync(request, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
