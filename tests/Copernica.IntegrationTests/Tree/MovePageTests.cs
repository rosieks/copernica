using System.Net;
using Copernica.Hosting;
using Copernica.IntegrationTests.Infrastructure;
using LibGit2Sharp;

namespace Copernica.IntegrationTests.Tree;

/// <summary>Renaming and moving single pages (005 US1, contracts/api.md §1).</summary>
public sealed class MovePageTests : IAsyncLifetime
{
    private const string Setup = "# Setup\n\nInstall the tools from [the API](../reference/api.md).\n\nThis paragraph makes the page long enough for rename detection.\n";

    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit(new Dictionary<string, string?>
        {
            ["src/app.cs"] = "code",
            ["docs/index.md"] = "# Home\n\nSee [Setup](guides/setup.md), [API](/reference/api.md) and [FAQ](wiki:docs/guides/faq.md).\n",
            ["docs/guides/setup.md"] = Setup,
            ["docs/guides/faq.md"] = "# FAQ\n\nRead [install steps](setup.md#install). Inline `setup.md` stays.\n",
            ["docs/reference/api.md"] = "# API\n",
        });
        _factory = new CopernicaFactory().AddSpace("docs", _remote, folder: "docs");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    private string TipMessage()
    {
        using var repo = new Repository(_remote.Path);
        return repo.Branches[_remote.Branch].Tip.Message;
    }

    [Fact]
    public async Task Rename_is_one_commit_with_a_trailer_updated_links_and_a_new_title()
    {
        var client = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var response = await client.MoveAsync("docs", "guides/setup.md", "guides/Installing.md", message: "Rename setup", retitle: "Installing");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.JsonAsync();
        Assert.Equal("guides/Installing.md", result.GetProperty("path").GetString());
        Assert.Equal(["guides/faq.md", "index.md"], result.GetProperty("updatedPages").EnumerateArray().Select(e => e.GetString()));
        var log = _remote.Log();
        Assert.Equal(before + 1, log.Count);
        Assert.Equal(("Alice Example", "Rename setup"), (log[0].AuthorName, log[0].Message));
        Assert.Equal(log[0].Sha, result.GetProperty("commitId").GetString());
        Assert.Equal("Rename setup\n\nCopernica-Moved: guides/setup.md -> guides/Installing.md\n", TipMessage());
        // git itself sees the rename (reported under the new path).
        Assert.Equal(["docs/guides/Installing.md", "docs/guides/faq.md", "docs/index.md"], _remote.TipChanges());
        Assert.Null(_remote.ReadFile("docs/guides/setup.md"));
        Assert.Equal(Setup.Replace("# Setup", "# Installing"), _remote.ReadFile("docs/guides/Installing.md"));
        Assert.Equal("# FAQ\n\nRead [install steps](Installing.md#install). Inline `setup.md` stays.\n", _remote.ReadFile("docs/guides/faq.md"));
        Assert.Equal("# Home\n\nSee [Setup](guides/Installing.md), [API](/reference/api.md) and [FAQ](wiki:docs/guides/faq.md).\n", _remote.ReadFile("docs/index.md"));
        Assert.Contains("guides/Installing.md", await client.GetStringAsync("/api/spaces/docs/tree", Ct));
    }

    [Fact]
    public async Task Move_to_another_folder_rewrites_the_moved_pages_own_links()
    {
        var client = await _factory.SignInAsync();

        var response = await client.MoveAsync("docs", "guides/setup.md", "reference/deep/setup.md");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("[the API](../api.md)", _remote.ReadFile("docs/reference/deep/setup.md"));
        Assert.Contains("[install steps](../reference/deep/setup.md#install)", _remote.ReadFile("docs/guides/faq.md"));
    }

    [Fact]
    public async Task Dry_run_reports_the_effects_and_commits_nothing()
    {
        var client = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var response = await client.MoveAsync("docs", "guides/setup.md", "guides/install.md", message: null, dryRun: true);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var preview = await response.JsonAsync();
        Assert.Equal(1, preview.GetProperty("pageCount").GetInt32());
        Assert.Equal(1, preview.GetProperty("fileCount").GetInt32());
        Assert.Equal(["guides/faq.md", "index.md"], preview.GetProperty("linkingPages").EnumerateArray().Select(e => e.GetString()));
        var move = Assert.Single(preview.GetProperty("moves").EnumerateArray());
        Assert.Equal(("guides/setup.md", "guides/install.md"), (move.GetProperty("from").GetString(), move.GetProperty("to").GetString()));
        Assert.Equal(before, _remote.Log().Count);
    }

    [Theory]
    [InlineData("guides/faq.md", HttpStatusCode.Conflict, "target-exists")]
    [InlineData("guides/FAQ.md", HttpStatusCode.Conflict, "target-exists")]
    [InlineData("guides/setup.md", HttpStatusCode.BadRequest, "invalid-move")]
    [InlineData("guides/a:b.md", HttpStatusCode.BadRequest, "validation")]
    [InlineData("guides/.order", HttpStatusCode.BadRequest, "validation")]
    [InlineData("guides/setup.txt", HttpStatusCode.BadRequest, "validation")]
    [InlineData("../outside.md", HttpStatusCode.BadRequest, "validation")]
    public async Task Invalid_targets_change_nothing(string to, HttpStatusCode status, string type)
    {
        var client = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var response = await client.MoveAsync("docs", "guides/setup.md", to);

        Assert.Equal(status, response.StatusCode);
        Assert.Equal(type, await response.ProblemTypeAsync());
        Assert.Equal(before, _remote.Log().Count);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public async Task Change_description_is_required(string? message)
    {
        var client = await _factory.SignInAsync();

        var response = await client.MoveAsync("docs", "guides/setup.md", "guides/x.md", message: message);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Case_only_rename_works()
    {
        var client = await _factory.SignInAsync();

        var response = await client.MoveAsync("docs", "guides/setup.md", "guides/Setup.md");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(_remote.ReadFile("docs/guides/setup.md"));
        Assert.Equal(Setup, _remote.ReadFile("docs/guides/Setup.md"));
    }

    [Fact]
    public async Task Concurrent_edits_of_the_moved_and_linking_pages_are_kept()
    {
        var client = await _factory.SignInAsync();
        var @base = await client.TreeCommitAsync("docs");
        _remote.Commit(new Dictionary<string, string?>
        {
            ["docs/guides/setup.md"] = Setup + "\nAdded by bob.\n",
            ["docs/guides/faq.md"] = "# FAQ\n\nRead [install steps](setup.md#install). Inline `setup.md` stays.\n\nBob's note.\n",
        });

        var response = await client.MoveAsync("docs", "guides/setup.md", "guides/install.md", @base: @base);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.EndsWith("Added by bob.\n", _remote.ReadFile("docs/guides/install.md"));
        var faq = _remote.ReadFile("docs/guides/faq.md")!;
        Assert.Contains("Bob's note.", faq);
        Assert.Contains("(install.md#install)", faq);
    }

    [Fact]
    public async Task Source_deleted_meanwhile_is_a_tree_conflict()
    {
        var client = await _factory.SignInAsync();
        var @base = await client.TreeCommitAsync("docs");
        _remote.Commit(new Dictionary<string, string?> { ["docs/guides/setup.md"] = null });
        var before = _remote.Log().Count;

        var response = await client.MoveAsync("docs", "guides/setup.md", "guides/install.md", @base: @base);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("tree-changed", await response.ProblemTypeAsync());
        Assert.Equal(before, _remote.Log().Count);
    }

    [Fact]
    public async Task Read_only_users_anonymous_users_and_hosting_failures_are_refused()
    {
        _factory.Hosting.Set("bob", "docs", new RepositoryPermission(CanRead: true, CanWrite: false));
        var bob = await _factory.SignInAsync("bob");
        var forbidden = await bob.MoveAsync("docs", "guides/setup.md", "guides/x.md");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal("no-write-permission", await forbidden.ProblemTypeAsync());
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.MoveAsync("docs", "guides/setup.md", "guides/x.md", dryRun: true, @base: new string('a', 40))).StatusCode);

        var anonymous = _factory.CreateAnonymousClient();
        var unauthorized = await anonymous.PostAsJsonAsync("/api/spaces/docs/tree/move", new { @base = new string('a', 40), kind = "page", from = "guides/setup.md", to = "x.md", message = "m" }, Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        var alice = await _factory.SignInAsync();
        _factory.Hosting.FailCredentials = true;
        var unavailable = await alice.MoveAsync("docs", "guides/setup.md", "guides/x.md");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, unavailable.StatusCode);
        Assert.Equal("hosting-unavailable", await unavailable.ProblemTypeAsync());
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
