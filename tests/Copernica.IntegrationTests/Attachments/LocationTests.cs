using System.Net;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Attachments;

/// <summary>003 US3: the storage location is configurable per space; links stay relative.</summary>
public sealed class LocationTests : IAsyncLifetime
{
    private readonly TestRemote _docs = new();
    private readonly TestRemote _perPage = new();
    private readonly TestRemote _nextTo = new();
    private readonly TestRemote _inherits = new();
    private CopernicaFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _docs.Commit("docs/guides/setup.md", "# Setup\n");
        _perPage.Commit("guides/setup.md", "# Setup\n");
        _nextTo.Commit("guides/setup.md", "# Setup\n");
        _inherits.Commit("guides/setup.md", "# Setup\n");
        _factory = new CopernicaFactory()
            .Set("Copernica:Attachments:Path", "img")
            .AddSpace("docs", _docs, folder: "docs")
            .Set("Copernica:Spaces:0:Attachments:Path", "images")
            .AddSpace("perpage", _perPage)
            .Set("Copernica:Spaces:1:Attachments:Path", "{page}.assets")
            .AddSpace("nextto", _nextTo)
            .Set("Copernica:Spaces:2:Attachments:Path", "{dir}")
            .AddSpace("inherits", _inherits);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Theory]
    [InlineData("docs", "images/", "../images/", "docs/images/")]
    [InlineData("perpage", "guides/setup.assets/", "setup.assets/", "guides/setup.assets/")]
    [InlineData("nextto", "guides/", "", "guides/")]
    [InlineData("inherits", "img/", "../img/", "img/")]
    public async Task Images_go_to_the_configured_folder(string space, string folder, string linkPrefix, string repositoryFolder)
    {
        var alice = await _factory.SignInAsync();
        var remote = space switch { "docs" => _docs, "perpage" => _perPage, "nextto" => _nextTo, _ => _inherits };
        var page = await alice.GetPageAsync(space, "guides/setup.md");

        var image = await alice.UploadOkAsync(space, "guides/setup.md", fileName: "shot.png");
        var path = image.GetProperty("repositoryPath").GetString()!;
        var link = image.GetProperty("link").GetString()!;
        var response = await alice.SaveWithAsync(space, "guides/setup.md", WikiApi.BaseOf(page), $"# Setup\n\n![Shot]({link})\n", "Add", image.GetProperty("id").GetString()!);

        Assert.StartsWith(folder, path);
        Assert.Equal(linkPrefix + path[folder.Length..], link);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(remote.ReadBytes(repositoryFolder + path[folder.Length..]));
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _docs.Dispose();
        _perPage.Dispose();
        _nextTo.Dispose();
        _inherits.Dispose();
        return ValueTask.CompletedTask;
    }
}
