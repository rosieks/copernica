using System.Net;
using System.Text.Json;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Editing;

public sealed class HistoryTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;
    private readonly List<string> _commits = [];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        for (var i = 1; i <= 5; i++)
        {
            _commits.Add(_remote.Commit("page.md", $"# Version {i}\n", $"Change {i}"));
        }

        _remote.Commit("other.md", "# Other\n", "Unrelated");
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task History_lists_versions_newest_first_with_pagination()
    {
        var client = await _factory.SignInAsync();

        var first = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/history/page.md?limit=2", Ct);
        var cursor = first.GetProperty("nextCursor").GetString();
        var second = await client.GetFromJsonAsync<JsonElement>($"/api/spaces/wiki/history/page.md?limit=2&cursor={cursor}", Ct);
        var all = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/history/page.md", Ct);

        Assert.Equal(["Change 5", "Change 4"], first.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("message").GetString()));
        Assert.Equal(["Change 3", "Change 2"], second.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("message").GetString()));
        Assert.Equal(5, all.GetProperty("items").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, all.GetProperty("nextCursor").ValueKind);
        Assert.Equal("Outside Author", all.GetProperty("items")[0].GetProperty("authorName").GetString());
    }

    [Fact]
    public async Task Limit_is_capped_at_200()
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync("/api/spaces/wiki/history/page.md?limit=1000", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task History_follows_renames()
    {
        _remote.Commit(new Dictionary<string, string?> { ["page.md"] = null, ["renamed.md"] = "# Version 5\n" }, "Rename page");
        await _factory.SyncAsync();
        var client = await _factory.SignInAsync();

        var history = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/history/renamed.md", Ct);

        var messages = history.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("message").GetString()).ToList();
        Assert.Equal("Rename page", messages[0]);
        Assert.Contains("Change 1", messages);
    }

    [Fact]
    public async Task Old_version_and_diff_are_available()
    {
        var client = await _factory.SignInAsync();

        var old = await client.GetFromJsonAsync<JsonElement>($"/api/spaces/wiki/pages/page.md?version={_commits[1]}", Ct);
        var diff = await client.GetFromJsonAsync<JsonElement>($"/api/spaces/wiki/diff/page.md?from={_commits[0]}&to={_commits[4]}", Ct);

        Assert.Equal("Version 2", old.GetProperty("title").GetString());
        Assert.False(old.GetProperty("isCurrent").GetBoolean());
        Assert.Equal("# Version 1\n", diff.GetProperty("fromSource").GetString());
        Assert.Equal("# Version 5\n", diff.GetProperty("toSource").GetString());
    }

    [Fact]
    public async Task Diff_requires_full_commit_ids()
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync("/api/spaces/wiki/diff/page.md?from=HEAD~1&to=HEAD", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
