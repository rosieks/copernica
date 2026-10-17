using System.Text.Json;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Spaces;

/// <summary>Spaces backed by a repository on the local disk (task T109).</summary>
public sealed class LocalRepositoryTests : IDisposable
{
    private readonly TestRemote _workingCopy = new(bare: false);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Pages_are_read_from_a_non_bare_working_repository()
    {
        _workingCopy.Commit("notes/today.md", "# Today\n\nLocal notes.");
        using var factory = new CopernicaFactory().AddSpace("notes", _workingCopy);
        _ = factory.Server;
        await factory.SyncAsync();
        var client = await factory.SignInAsync();

        var page = await client.GetFromJsonAsync<JsonElement>("/api/spaces/notes/pages/notes/today.md", Ct);

        Assert.Equal("Today", page.GetProperty("title").GetString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Native_and_file_uri_paths_are_accepted(bool fileUri)
    {
        _workingCopy.Commit("index.md", "# Home");
        var url = fileUri ? new Uri(_workingCopy.Path).AbsoluteUri : _workingCopy.Path;
        using var factory = new CopernicaFactory().AddSpace("notes", null, remoteUrl: url);
        _ = factory.Server;
        await factory.SyncAsync();
        var client = await factory.SignInAsync();

        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.Equal("ready", spaces[0].GetProperty("state").GetString());
    }

    [Fact]
    public async Task Local_commits_are_picked_up_on_sync()
    {
        _workingCopy.Commit("index.md", "# Version one");
        using var factory = new CopernicaFactory().AddSpace("notes", _workingCopy);
        _ = factory.Server;
        await factory.SyncAsync();
        var client = await factory.SignInAsync();

        _workingCopy.Commit("index.md", "# Version two");
        await factory.SyncAsync();
        var page = await client.GetFromJsonAsync<JsonElement>("/api/spaces/notes/pages/index.md", Ct);

        Assert.Equal("Version two", page.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Space_without_remote_starts_empty_and_is_ready()
    {
        using var factory = new CopernicaFactory().AddSpace("sandbox", null);
        _ = factory.Server;
        await factory.SyncAsync();
        var client = await factory.SignInAsync();

        var tree = await client.GetFromJsonAsync<JsonElement>("/api/spaces/sandbox/tree", Ct);

        Assert.Empty(tree.GetProperty("children").EnumerateArray());
    }

    [Fact]
    public async Task Saving_to_the_checked_out_branch_of_a_working_repository_is_refused()
    {
        _workingCopy.Commit("index.md", "# Home");
        using var factory = new CopernicaFactory().AddSpace("notes", _workingCopy);
        _ = factory.Server;
        await factory.SyncAsync();
        var client = await factory.SignInAsync();
        var page = await client.GetPageAsync("notes", "index.md");
        var tip = _workingCopy.Tip().Sha;

        var response = await client.SaveAsync("notes", "index.md", WikiApi.BaseOf(page), "# Changed");

        Assert.Equal(System.Net.HttpStatusCode.Forbidden, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.EndsWith("push-rejected", problem.GetProperty("type").GetString());
        Assert.Contains("bare repository", problem.GetProperty("detail").GetString());
        Assert.Equal(tip, _workingCopy.Tip().Sha);
    }

    [Fact]
    public async Task Saving_to_a_bare_local_repository_works()
    {
        using var bare = new TestRemote();
        bare.Commit("index.md", "# Home");
        using var factory = new CopernicaFactory().AddSpace("notes", bare);
        _ = factory.Server;
        await factory.SyncAsync();
        var client = await factory.SignInAsync();
        var page = await client.GetPageAsync("notes", "index.md");

        var response = await client.SaveAsync("notes", "index.md", WikiApi.BaseOf(page), "# Changed");

        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("# Changed", bare.ReadFile("index.md"));
    }

    [Fact]
    public async Task Saving_in_a_space_without_remote_commits_to_the_data_volume()
    {
        using var factory = new CopernicaFactory().AddSpace("sandbox", null);
        _ = factory.Server;
        await factory.SyncAsync();
        var client = await factory.SignInAsync();

        var created = await client.SaveAsync("sandbox", "first.md", null, "# First page");
        var page = await client.GetPageAsync("sandbox", "first.md");

        Assert.Equal(System.Net.HttpStatusCode.OK, created.StatusCode);
        Assert.Equal("First page", page.GetProperty("title").GetString());
    }

    public void Dispose() => _workingCopy.Dispose();
}
