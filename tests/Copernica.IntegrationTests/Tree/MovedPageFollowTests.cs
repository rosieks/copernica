using System.Net;
using System.Text.Json;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Tree;

/// <summary>Old addresses, discussions, history and edits follow wiki moves (005 FR-006, FR-010, research R4–R6).</summary>
public sealed class MovedPageFollowTests : IAsyncLifetime
{
    private const string Setup = "# Setup\n\nThe onboarding checklist covers laptops and accounts.\n\nThe release process starts on Monday.\n";
    private const string PlainText = "Setup\nThe onboarding checklist covers laptops and accounts.\nThe release process starts on Monday.\n";

    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;
    private string _seed = "";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _seed = _remote.Commit(new Dictionary<string, string?>
        {
            ["index.md"] = "# Home\n",
            ["guides/setup.md"] = Setup,
            ["guides/tiny.md"] = "[s](setup.md)\n",
        });
        _remote.Commit("guides/tiny.md", "[s](setup.md)\n\nSecond version.\n", "Edit tiny");
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Old_address_reports_the_current_path_after_several_moves()
    {
        var client = await _factory.SignInAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "guides/setup.md", "guides/install.md")).StatusCode);
        var second = await client.MoveAsync("wiki", "guides/install.md", "howto/install.md");
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        var response = await client.GetAsync("/api/spaces/wiki/pages/guides/setup.md", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("urn:copernica:problem:page-moved", problem.GetProperty("type").GetString());
        Assert.Equal("howto/install.md", problem.GetProperty("currentPath").GetString());
        Assert.Equal((await second.JsonAsync()).GetProperty("commitId").GetString(), problem.GetProperty("movedIn").GetString());
    }

    [Fact]
    public async Task Deleted_page_reports_the_deleting_commit_and_unknown_pages_stay_plain()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("wiki", "guides/setup.md");
        var deleted = await client.DeleteAsync("wiki", "guides/setup.md", WikiApi.BaseOf(page));
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var gone = await (await client.GetAsync("/api/spaces/wiki/pages/guides/setup.md", Ct)).JsonAsync();
        var unknown = await (await client.GetAsync("/api/spaces/wiki/pages/never.md", Ct)).JsonAsync();

        Assert.Equal("urn:copernica:problem:not-found", gone.GetProperty("type").GetString());
        Assert.Equal(_remote.Tip().Sha, gone.GetProperty("deletedIn").GetString());
        Assert.False(unknown.TryGetProperty("deletedIn", out _));
    }

    [Fact]
    public async Task Discussions_follow_the_moved_page()
    {
        var client = await _factory.SignInAsync();
        var start = PlainText.IndexOf("release process", StringComparison.Ordinal);
        var anchor = new { exact = "release process", prefix = PlainText[(start - 20)..start], suffix = " starts", start, end = start + 15, commitId = _remote.Tip().Sha };
        var created = await client.PostAsJsonAsync("/api/spaces/wiki/discussions", new { path = "guides/setup.md", anchor, body = "Still Monday?" }, Ct);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "guides/setup.md", "howto/install.md")).StatusCode);

        var moved = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/discussions?path=howto/install.md&state=open", Ct);
        var old = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/discussions?path=guides/setup.md&state=open", Ct);
        var discussion = Assert.Single(moved.EnumerateArray());
        Assert.Equal("anchored", discussion.GetProperty("anchorStatus").GetString());
        Assert.Empty(old.EnumerateArray());
    }

    [Fact]
    public async Task History_continues_across_a_move_that_rename_detection_misses()
    {
        var client = await _factory.SignInAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "guides/tiny.md", "archive/deep/tiny.md")).StatusCode);
        Assert.Equal("[s](../../guides/setup.md)\n\nSecond version.\n", _remote.ReadFile("archive/deep/tiny.md"));

        var history = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/history/archive/deep/tiny.md", Ct);

        var items = history.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(3, items.Count);
        Assert.Equal(["archive/deep/tiny.md", "guides/tiny.md", "guides/tiny.md"], items.Select(i => i.GetProperty("path").GetString()));
        Assert.Equal(_seed, items[^1].GetProperty("commitId").GetString());
    }

    [Fact]
    public async Task Edit_started_before_a_move_is_saved_at_the_new_location()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("wiki", "guides/setup.md");
        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "guides/setup.md", "howto/install.md")).StatusCode);

        var response = await client.SaveAsync("wiki", "guides/setup.md", WikiApi.BaseOf(page), Setup + "\nEdited in the other tab.\n");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("howto/install.md", (await response.JsonAsync()).GetProperty("path").GetString());
        Assert.Null(_remote.ReadFile("guides/setup.md"));
        Assert.EndsWith("Edited in the other tab.\n", _remote.ReadFile("howto/install.md"));
    }

    [Fact]
    public async Task Edit_of_a_page_deleted_meanwhile_hands_the_text_back()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("wiki", "guides/setup.md");
        _remote.Commit(new Dictionary<string, string?> { ["guides/setup.md"] = null }, "Delete outside");

        var response = await client.SaveAsync("wiki", "guides/setup.md", WikiApi.BaseOf(page), "# My text\n");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("urn:copernica:problem:page-deleted", problem.GetProperty("type").GetString());
        Assert.Equal("# My text\n", problem.GetProperty("mineSource").GetString());
        Assert.Null(_remote.ReadFile("guides/setup.md"));
    }

    [Fact]
    public async Task Saved_path_is_the_requested_one_when_nothing_moved()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("wiki", "index.md");

        var response = await client.SaveAsync("wiki", "index.md", WikiApi.BaseOf(page), "# Home\n\nMore.\n");

        Assert.Equal("index.md", (await response.JsonAsync()).GetProperty("path").GetString());
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
