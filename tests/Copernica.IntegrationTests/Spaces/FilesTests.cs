using System.Net;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Spaces;

public sealed class FilesTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit(new Dictionary<string, string?>
        {
            ["secret.txt"] = "outside the space",
            ["docs/index.md"] = "# Docs",
            ["docs/img/a.png"] = "PNG",
            ["docs/img/b.svg"] = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>",
            ["docs/files/run.html"] = "<script>alert(1)</script>",
        });
        _factory = new CopernicaFactory().AddSpace("docs", _remote, folder: "docs");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Images_are_served_inline()
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync("/api/spaces/docs/files/img/a.png", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        Assert.Null(response.Content.Headers.ContentDisposition);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact]
    public async Task Svg_is_sandboxed()
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync("/api/spaces/docs/files/img/b.svg", Ct);

        Assert.Equal("image/svg+xml", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("sandbox", response.Headers.GetValues("Content-Security-Policy").Single());
    }

    [Fact]
    public async Task Other_files_are_downloaded_as_attachments()
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync("/api/spaces/docs/files/files/run.html", Ct);

        Assert.Equal("application/octet-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
    }

    [Theory]
    [InlineData("/api/spaces/docs/files/../secret.txt")]
    [InlineData("/api/spaces/docs/files/%2E%2E/secret.txt")]
    [InlineData("/api/spaces/docs/files/img/missing.png")]
    [InlineData("/api/spaces/docs/files/img")]
    public async Task Paths_outside_the_space_or_missing_return_404(string url)
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync(url, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
