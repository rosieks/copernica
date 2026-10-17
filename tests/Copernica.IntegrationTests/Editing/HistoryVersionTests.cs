using System.Net;
using Copernica.Hosting;
using Copernica.IntegrationTests.Infrastructure;
using LibGit2Sharp;

namespace Copernica.IntegrationTests.Editing;

/// <summary>002 api-changes.md §1: history can start at a given commit (page information for older versions).</summary>
public sealed class HistoryVersionTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;
    private readonly List<string> _commits = [];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        for (var i = 1; i <= 4; i++)
        {
            _commits.Add(_remote.Commit("page.md", $"# Version {i}\n", $"Change {i}"));
            _commits.Add(_remote.Commit("other.md", $"# Other {i}\n", $"Unrelated {i}"));
        }

        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    private string PageCommit(int version) => _commits[(version - 1) * 2];

    [Fact]
    public async Task Version_returns_the_change_that_produced_that_state_of_the_page()
    {
        var client = await _factory.SignInAsync();

        // The commit after "Change 2" only touched other.md; the page state there comes from "Change 2".
        var response = await client.GetAsync($"/api/spaces/wiki/history/page.md?version={_commits[3]}&limit=1", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var item = Assert.Single((await response.JsonAsync()).GetProperty("items").EnumerateArray());
        Assert.Equal(PageCommit(2), item.GetProperty("commitId").GetString());
        Assert.Equal("Change 2", item.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Paging_is_relative_to_the_start_commit()
    {
        var client = await _factory.SignInAsync();

        var first = await (await client.GetAsync($"/api/spaces/wiki/history/page.md?version={PageCommit(3)}&limit=2", Ct)).JsonAsync();
        var cursor = first.GetProperty("nextCursor").GetString();
        var second = await (await client.GetAsync($"/api/spaces/wiki/history/page.md?version={PageCommit(3)}&limit=2&cursor={cursor}", Ct)).JsonAsync();

        Assert.Equal(["Change 3", "Change 2"], first.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("message").GetString()));
        Assert.Equal(["Change 1"], second.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("message").GetString()));
    }

    [Theory]
    [InlineData("HEAD")]
    [InlineData("main~1")]
    [InlineData("abc")]
    public async Task Malformed_version_is_a_bad_request(string version)
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync($"/api/spaces/wiki/history/page.md?version={Uri.EscapeDataString(version)}", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_commit_is_not_found()
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync($"/api/spaces/wiki/history/page.md?version={new string('a', 40)}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Commit_not_reachable_from_the_branch_is_not_found()
    {
        var client = await _factory.SignInAsync();
        var dropped = _remote.Commit("page.md", "# Dropped\n", "Will be dropped");
        await _factory.SyncAsync();
        using (var repo = new Repository(_remote.Path))
        {
            // History rewritten outside the wiki: the branch no longer contains the commit.
            repo.Refs.UpdateTarget(repo.Refs["refs/heads/main"], _commits[^1]);
        }

        await _factory.SyncAsync();

        var response = await client.GetAsync($"/api/spaces/wiki/history/page.md?version={dropped}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Without_read_access_the_answer_is_the_same_not_found()
    {
        _factory.Hosting.Set("bob", "wiki", RepositoryPermission.None);
        var bob = await _factory.SignInAsync("bob");

        var response = await bob.GetAsync($"/api/spaces/wiki/history/page.md?version={PageCommit(2)}&limit=1", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
