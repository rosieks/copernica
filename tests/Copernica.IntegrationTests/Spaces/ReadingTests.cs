using System.Net;
using System.Text.Json;
using Copernica.Hosting;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Spaces;

public sealed class ReadingTests : IAsyncLifetime
{
    private readonly TestRemote _handbook = new();
    private readonly TestRemote _service = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _handbook.Commit(new Dictionary<string, string?>
        {
            ["index.md"] = "# Team Handbook\n\nSee [setup](guides/setup.md) and [payments](wiki:service/api.md).",
            ["guides/setup.md"] = "# Setup\n\n![diagram](../img/diagram.png)",
            ["guides/unsafe.md"] = "# Unsafe\n\n<script>alert(1)</script><img src=x onerror=alert(1)>",
            ["img/diagram.png"] = "PNG",
        });
        _service.Commit(new Dictionary<string, string?>
        {
            ["src/Program.cs"] = "class P {}",
            ["README.md"] = "# Not in the space",
            ["docs/api.md"] = "# Payments API",
        });

        _factory = new CopernicaFactory()
            .AddSpace("handbook", _handbook, displayName: "Team Handbook")
            .AddSpace("service", _service, folder: "docs");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Anonymous_users_get_401()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/api/spaces", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Signed_in_user_sees_both_spaces()
    {
        var client = await _factory.SignInAsync();

        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        var list = spaces.EnumerateArray().ToList();
        Assert.Equal(["handbook", "service"], list.Select(s => s.GetProperty("id").GetString()));
        Assert.Equal("Team Handbook", list[0].GetProperty("displayName").GetString());
        Assert.All(list, s => Assert.Equal("ready", s.GetProperty("state").GetString()));
        Assert.All(list, s => Assert.True(s.GetProperty("canWrite").GetBoolean()));
    }

    [Fact]
    public async Task Me_returns_the_signed_in_user()
    {
        var client = await _factory.SignInAsync("bob");

        var me = await client.GetFromJsonAsync<JsonElement>("/api/me", Ct);

        Assert.Equal("bob", me.GetProperty("id").GetString());
        Assert.Equal("Bob Example", me.GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task Tree_respects_the_space_folder()
    {
        var client = await _factory.SignInAsync();

        var tree = await client.GetFromJsonAsync<JsonElement>("/api/spaces/service/tree", Ct);

        var children = tree.GetProperty("children").EnumerateArray().ToList();
        var page = Assert.Single(children);
        Assert.Equal("api.md", page.GetProperty("path").GetString());
        Assert.Equal("Payments API", page.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Page_is_rendered_with_version_and_wiki_links()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetFromJsonAsync<JsonElement>("/api/spaces/handbook/pages/index.md", Ct);

        Assert.Equal("Team Handbook", page.GetProperty("title").GetString());
        var html = page.GetProperty("html").GetString();
        Assert.Contains("href=\"/s/handbook/guides/setup.md\"", html);
        Assert.Contains("href=\"/s/service/api.md\"", html);
        Assert.Equal(_handbook.Tip().Sha, page.GetProperty("version").GetProperty("commitId").GetString());
        Assert.False(string.IsNullOrEmpty(page.GetProperty("version").GetProperty("blobId").GetString()));
        Assert.True(page.GetProperty("isCurrent").GetBoolean());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("source").ValueKind);
    }

    [Fact]
    public async Task Source_is_returned_on_request()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetFromJsonAsync<JsonElement>("/api/spaces/handbook/pages/guides/setup.md?source=true", Ct);

        Assert.StartsWith("# Setup", page.GetProperty("source").GetString());
    }

    [Fact]
    public async Task Unsafe_content_is_sanitized()
    {
        var client = await _factory.SignInAsync();

        var page = await client.GetFromJsonAsync<JsonElement>("/api/spaces/handbook/pages/guides/unsafe.md", Ct);

        var html = page.GetProperty("html").GetString()!;
        Assert.DoesNotContain("<script", html);
        Assert.DoesNotContain("onerror", html);
    }

    [Theory]
    [InlineData("/api/spaces/handbook/pages/missing.md")]
    [InlineData("/api/spaces/handbook/pages/img/diagram.png")]
    [InlineData("/api/spaces/nope/pages/index.md")]
    [InlineData("/api/spaces/service/pages/../README.md")]
    public async Task Missing_or_invalid_pages_return_404(string url)
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync(url, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Commits_pushed_outside_the_wiki_become_visible_after_sync()
    {
        var client = await _factory.SignInAsync();
        _handbook.Commit("guides/setup.md", "# Setup v2");

        await _factory.SyncAsync();
        var page = await client.GetFromJsonAsync<JsonElement>("/api/spaces/handbook/pages/guides/setup.md", Ct);

        Assert.Equal("Setup v2", page.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Old_versions_can_be_read()
    {
        var client = await _factory.SignInAsync();
        var first = _handbook.Tip().Sha;
        _handbook.Commit("index.md", "# Renamed Handbook");
        await _factory.SyncAsync();

        var page = await client.GetFromJsonAsync<JsonElement>($"/api/spaces/handbook/pages/index.md?version={first}", Ct);

        Assert.Equal("Team Handbook", page.GetProperty("title").GetString());
        Assert.False(page.GetProperty("isCurrent").GetBoolean());
    }

    [Fact]
    public async Task Unreachable_space_does_not_affect_others()
    {
        using var broken = new CopernicaFactory()
            .AddSpace("handbook", _handbook)
            .AddSpace("broken", null, remoteUrl: Path.Combine(Path.GetTempPath(), "copernica-missing-" + Guid.NewGuid().ToString("N")));
        _ = broken.Server;
        await broken.SyncAsync();
        var client = await broken.SignInAsync();

        var spaces = (await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct)).EnumerateArray().ToList();
        var page = await client.GetAsync("/api/spaces/handbook/pages/index.md", Ct);

        Assert.Equal("unavailable", spaces.Single(s => s.GetProperty("id").GetString() == "broken").GetProperty("state").GetString());
        Assert.False(string.IsNullOrEmpty(spaces.Single(s => s.GetProperty("id").GetString() == "broken").GetProperty("message").GetString()));
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
    }

    [Fact]
    public async Task Space_the_user_cannot_read_is_hidden_and_returns_404()
    {
        _factory.Hosting.Set("alice", "service", RepositoryPermission.None);
        var client = await _factory.SignInAsync();

        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.DoesNotContain("service", spaces.EnumerateArray().Select(s => s.GetProperty("id").GetString()));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/spaces/service/tree", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/spaces/service/pages/api.md", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/spaces/service/files/api.md", Ct)).StatusCode);
    }

    [Fact]
    public async Task Failing_permission_checks_deny_access()
    {
        _factory.Hosting.FailPermissionChecks = true;
        var client = await _factory.SignInAsync();

        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.Empty(spaces.EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/spaces/handbook/pages/index.md", Ct)).StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _handbook.Dispose();
        _service.Dispose();
        return ValueTask.CompletedTask;
    }
}
