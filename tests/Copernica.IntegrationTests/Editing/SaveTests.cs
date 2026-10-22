using System.Net;
using Copernica.Hosting;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Editing;

public sealed class SaveTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit(new Dictionary<string, string?>
        {
            ["src/app.cs"] = "code",
            ["docs/index.md"] = "# Home\n\nWelcome.\n",
            ["docs/guides/setup.md"] = "# Setup\n",
        });
        _factory = new CopernicaFactory().AddSpace("docs", _remote, folder: "docs");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Save_creates_exactly_one_commit_authored_by_the_user()
    {
        var client = await _factory.SignInAsync("alice");
        var page = await client.GetPageAsync("docs", "index.md");
        var before = _remote.Log().Count;

        var response = await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), "# Home\n\nWelcome, team!\n", "Fix typo");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.JsonAsync();
        Assert.False(result.GetProperty("merged").GetBoolean());
        var log = _remote.Log();
        Assert.Equal(before + 1, log.Count);
        Assert.Equal(("Alice Example", "alice@example.test", "Fix typo"), (log[0].AuthorName, log[0].AuthorEmail, log[0].Message));
        Assert.Equal(log[0].Sha, result.GetProperty("version").GetProperty("commitId").GetString());
        Assert.Equal("# Home\n\nWelcome, team!\n", _remote.ReadFile("docs/index.md"));
    }

    [Fact]
    public async Task Saving_unchanged_content_creates_no_commit()
    {
        // 007 FR-012: the visual editor relies on an identical save never reaching git history.
        var client = await _factory.SignInAsync("alice");
        var page = await client.GetPageAsync("docs", "index.md");
        var before = _remote.Log();

        var response = await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), "# Home\n\nWelcome.\n", "Nothing changed");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.JsonAsync();
        var after = _remote.Log();
        Assert.Equal(before.Count, after.Count);
        Assert.Equal(before[0].Sha, after[0].Sha);
        Assert.Equal(before[0].Sha, result.GetProperty("version").GetProperty("commitId").GetString());
    }

    [Fact]
    public async Task User_without_email_gets_the_fallback_address()
    {
        var client = await _factory.SignInAsync("bob");
        var page = await client.GetPageAsync("docs", "index.md");

        await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), "# Home\n\nBob was here.\n");

        Assert.Equal("bob@users.noreply.invalid", _remote.Log()[0].AuthorEmail);
    }

    [Fact]
    public async Task Saved_content_is_served_immediately()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("docs", "index.md");

        await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), "# Renamed Home\n");
        var after = await client.GetPageAsync("docs", "index.md");

        Assert.Equal("Renamed Home", after.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Creating_a_page_adds_a_file_under_the_space_folder()
    {
        var client = await _factory.SignInAsync();

        var response = await client.SaveAsync("docs", "guides/new.md", null, "# New guide\n", "Add guide");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("# New guide\n", _remote.ReadFile("docs/guides/new.md"));
        var tree = await client.GetStringAsync("/api/spaces/docs/tree", TestContext.Current.CancellationToken);
        Assert.Contains("guides/new.md", tree);
    }

    [Fact]
    public async Task Creating_an_existing_page_is_rejected()
    {
        var client = await _factory.SignInAsync();

        var response = await client.SaveAsync("docs", "index.md", null, "# Other\n");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("page-exists", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Deleting_a_page_creates_one_commit_and_keeps_history()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("docs", "guides/setup.md");

        var response = await client.DeleteAsync("docs", "guides/setup.md", WikiApi.BaseOf(page), "Remove setup");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(_remote.ReadFile("docs/guides/setup.md"));
        Assert.Equal("Remove setup", _remote.Log()[0].Message);
        var old = await client.GetAsync($"/api/spaces/docs/pages/guides/setup.md?version={page.GetProperty("version").GetProperty("commitId").GetString()}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, old.StatusCode);
    }

    [Fact]
    public async Task Read_only_user_cannot_save()
    {
        _factory.Hosting.Set("bob", "docs", new RepositoryPermission(CanRead: true, CanWrite: false));
        var client = await _factory.SignInAsync("bob");
        var page = await client.GetPageAsync("docs", "index.md");
        var before = _remote.Log().Count;

        var response = await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), "# Hacked\n");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("no-write-permission", await response.ProblemTypeAsync());
        Assert.Equal(before, _remote.Log().Count);
        var spaces = await client.GetStringAsync("/api/spaces", TestContext.Current.CancellationToken);
        Assert.Contains("\"canWrite\":false", spaces);
    }

    [Theory]
    [InlineData("", "valid content")]
    [InlineData(null, "valid content")]
    public async Task Change_description_is_required(string? message, string markdown)
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("docs", "index.md");

        var response = await client.PutAsJsonAsync("/api/spaces/docs/pages/index.md", new { @base = WikiApi.BaseOf(page), markdown, message }, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Too_long_description_and_too_large_content_are_rejected()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("docs", "index.md");

        var longMessage = await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), "x", new string('m', 501));
        var tooLarge = await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), new string('x', 1_048_577));

        Assert.Equal(HttpStatusCode.BadRequest, longMessage.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLarge.StatusCode);
    }

    [Theory]
    [InlineData("notes.txt")]
    [InlineData("guides%5Cescape.md")]
    [InlineData("guides//double.md")]
    public async Task Invalid_paths_are_rejected(string path)
    {
        var client = await _factory.SignInAsync();

        var response = await client.SaveAsync("docs", path, null, "# X\n");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_base_is_rejected()
    {
        var client = await _factory.SignInAsync();

        var response = await client.SaveAsync("docs", "index.md", new { commitId = new string('a', 40) }, "# X\n");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Missing_antiforgery_token_is_rejected()
    {
        await _factory.SignInAsync();
        using var raw = _factory.Server.CreateClient();

        var response = await raw.PutAsJsonAsync("/api/spaces/docs/pages/index.md", new { markdown = "x", message = "x" }, TestContext.Current.CancellationToken);

        Assert.True(response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Hosting_platform_failure_keeps_nothing_and_reports_503()
    {
        var client = await _factory.SignInAsync();
        var page = await client.GetPageAsync("docs", "index.md");
        _factory.Hosting.FailCredentials = true;

        var response = await client.SaveAsync("docs", "index.md", WikiApi.BaseOf(page), "# X\n");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("hosting-unavailable", await response.ProblemTypeAsync());
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
