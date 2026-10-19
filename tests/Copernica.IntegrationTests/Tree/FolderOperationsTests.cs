using System.Net;
using System.Text.Json;
using Copernica.Hosting;
using Copernica.IntegrationTests.Infrastructure;
using LibGit2Sharp;

namespace Copernica.IntegrationTests.Tree;

/// <summary>Renaming, moving and deleting folders (005 US3, contracts/api.md §1–2).</summary>
public sealed class FolderOperationsTests : IAsyncLifetime
{
    private const string Setup = "# Setup\n\nSee [FAQ](faq.md), [API](../reference/api.md) and ![](img/shot.png).\n\nLong enough paragraph for the rename detection of git.\n";
    private const string Plain = "This page is long enough that git recognises it after a move without any change.\n";

    private readonly TestRemote _remote = new();
    private readonly TestRemote _other = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit(new Dictionary<string, string?>
        {
            ["index.md"] = "# Home\n\nSee [Setup](guides/setup.md) and ![shot](guides/img/shot.png).\n",
            ["guides/setup.md"] = Setup,
            ["guides/faq.md"] = "# FAQ\n\n" + Plain,
            ["guides/img/shot.png"] = "png",
            ["guides/deep/more.md"] = "# More\n\n[up](../setup.md)\n",
            ["reference/api.md"] = "# API\n",
            ["archive/2019/a.md"] = "# A\n",
            ["archive/2019/b.md"] = "# B\n",
            ["archive/2019/img.png"] = "png",
        });
        _other.Commit("index.md", "# Other\n\n[Setup](wiki:wiki/guides/setup.md)\n");
        _factory = new CopernicaFactory().AddSpace("wiki", _remote).AddSpace("other", _other);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    private string TipMessage()
    {
        using var repo = new Repository(_remote.Path);
        return repo.Branches[_remote.Branch].Tip.Message;
    }

    [Fact]
    public async Task Folder_rename_moves_everything_in_one_commit_and_keeps_links_working()
    {
        var client = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var response = await client.MoveAsync("wiki", "guides", "docs/guides", kind: "folder", message: "Reorganize");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(before + 1, _remote.Log().Count);
        Assert.Equal("Reorganize\n\nCopernica-Moved: guides/ -> docs/guides/\n", TipMessage());
        Assert.Null(_remote.ReadFile("guides/setup.md"));
        Assert.Equal("png", _remote.ReadFile("docs/guides/img/shot.png"));
        Assert.Equal("# FAQ\n\n" + Plain, _remote.ReadFile("docs/guides/faq.md"));
        // Links between moved pages are unchanged; links leaving the folder follow the new depth.
        Assert.Equal(Setup.Replace("../reference/api.md", "../../reference/api.md"), _remote.ReadFile("docs/guides/setup.md"));
        Assert.Equal("# More\n\n[up](../setup.md)\n", _remote.ReadFile("docs/guides/deep/more.md"));
        Assert.Equal("# Home\n\nSee [Setup](docs/guides/setup.md) and ![shot](docs/guides/img/shot.png).\n", _remote.ReadFile("index.md"));
        Assert.Equal(["index.md"], (await response.JsonAsync()).GetProperty("updatedPages").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task Links_from_other_spaces_are_left_alone_and_the_old_address_redirects()
    {
        var client = await _factory.SignInAsync();

        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "guides", "docs", kind: "folder")).StatusCode);

        Assert.Equal("# Other\n\n[Setup](wiki:wiki/guides/setup.md)\n", _other.ReadFile("index.md"));
        var problem = await (await client.GetAsync("/api/spaces/wiki/pages/guides/faq.md", Ct)).JsonAsync();
        Assert.Equal("urn:copernica:problem:page-moved", problem.GetProperty("type").GetString());
        Assert.Equal("docs/faq.md", problem.GetProperty("currentPath").GetString());
    }

    [Fact]
    public async Task Discussions_of_all_moved_pages_follow()
    {
        var client = await _factory.SignInAsync();
        var plain = "FAQ\n" + Plain;
        var start = plain.IndexOf("long enough", StringComparison.Ordinal);
        var anchor = new { exact = "long enough", prefix = plain[..start], suffix = " that git", start, end = start + 11, commitId = _remote.Tip().Sha };
        var created = await client.PostAsJsonAsync("/api/spaces/wiki/discussions", new { path = "guides/faq.md", anchor, body = "Hm" }, Ct);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "guides", "docs", kind: "folder")).StatusCode);

        var list = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/discussions?path=docs/faq.md&state=open", Ct);
        Assert.Single(list.EnumerateArray());
    }

    [Theory]
    [InlineData("guides/deep")]
    [InlineData("guides/new/inner")]
    public async Task A_folder_cannot_move_into_itself(string to)
    {
        var client = await _factory.SignInAsync();

        var response = await client.MoveAsync("wiki", "guides", to, kind: "folder");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid-move", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Moving_onto_an_existing_folder_is_refused()
    {
        var client = await _factory.SignInAsync();

        var response = await client.MoveAsync("wiki", "guides", "Reference", kind: "folder");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("target-exists", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Delete_dry_run_counts_and_delete_is_one_commit_kept_in_history()
    {
        var client = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var preview = await (await client.DeleteFolderAsync("wiki", "archive/2019", null, message: null, dryRun: true)).JsonAsync();
        Assert.Equal((2, 3), (preview.GetProperty("pageCount").GetInt32(), preview.GetProperty("fileCount").GetInt32()));
        Assert.Equal(before, _remote.Log().Count);

        var response = await client.DeleteFolderAsync("wiki", "archive/2019", expectedPageCount: 2, message: "Drop 2019");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, (await response.JsonAsync()).GetProperty("pageCount").GetInt32());
        Assert.Equal(before + 1, _remote.Log().Count);
        Assert.Equal("Drop 2019", _remote.Log()[0].Message);
        Assert.Null(_remote.ReadFile("archive/2019/a.md"));
        Assert.Null(_remote.ReadFile("archive/2019/img.png"));
        var deleted = await (await client.GetAsync("/api/spaces/wiki/pages/archive/2019/a.md", Ct)).JsonAsync();
        var lastVersion = deleted.GetProperty("lastVersion").GetString();
        var history = await client.GetAsync($"/api/spaces/wiki/history/archive/2019/a.md?version={lastVersion}", Ct);
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
    }

    [Fact]
    public async Task Delete_with_a_stale_count_reports_the_new_count_and_deletes_nothing()
    {
        var client = await _factory.SignInAsync();
        _remote.Commit("archive/2019/c.md", "# C\n");
        var before = _remote.Log().Count;

        var response = await client.DeleteFolderAsync("wiki", "archive/2019", expectedPageCount: 2);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("urn:copernica:problem:tree-changed", problem.GetProperty("type").GetString());
        Assert.Equal(3, problem.GetProperty("pageCount").GetInt32());
        Assert.Equal(before, _remote.Log().Count);
    }

    [Fact]
    public async Task Deleting_a_missing_folder_is_a_tree_conflict()
    {
        var client = await _factory.SignInAsync();

        var response = await client.DeleteFolderAsync("wiki", "nope", expectedPageCount: 0);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("tree-changed", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Read_only_users_cannot_move_or_delete_folders()
    {
        _factory.Hosting.Set("bob", "wiki", new RepositoryPermission(CanRead: true, CanWrite: false));
        var bob = await _factory.SignInAsync("bob");

        Assert.Equal(HttpStatusCode.Forbidden, (await bob.MoveAsync("wiki", "guides", "docs", kind: "folder")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.DeleteFolderAsync("wiki", "archive", expectedPageCount: 2)).StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        _other.Dispose();
        return ValueTask.CompletedTask;
    }
}
