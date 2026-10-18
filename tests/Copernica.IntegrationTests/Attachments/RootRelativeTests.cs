using System.Net;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Attachments;

/// <summary>003 US4 / FR-016: links starting with '/' resolve from the space root, as in Azure DevOps Wiki.</summary>
public sealed class RootRelativeTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit(new Dictionary<string, string?>
        {
            ["docs/guides/a.md"] = "# A\n\n![x](/.attachments/x.png)\n\n![y](/../secret.png)\n",
            ["docs/.attachments/x.png"] = "png-bytes",
            ["secret.png"] = "outside the space",
        });
        _factory = new CopernicaFactory().AddSpace("docs", _remote, folder: "docs");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Root_relative_images_resolve_from_the_space_root_and_are_served()
    {
        var alice = await _factory.SignInAsync();

        var page = await alice.GetPageAsync("docs", "guides/a.md");
        var html = page.GetProperty("html").GetString()!;
        var src = System.Text.RegularExpressions.Regex.Match(html, "src=\"([^\"]*\\.attachments[^\"]*)\"").Groups[1].Value.Replace("&amp;", "&");
        var file = await alice.GetAsync(src, Ct);

        Assert.StartsWith("/api/spaces/docs/files/.attachments/x.png?version=", src);
        Assert.Equal(HttpStatusCode.OK, file.StatusCode);
        Assert.Equal("png-bytes", await file.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Root_relative_links_cannot_leave_the_space()
    {
        var alice = await _factory.SignInAsync();

        var html = (await alice.GetPageAsync("docs", "guides/a.md")).GetProperty("html").GetString()!;
        var escape = await alice.GetAsync("/api/spaces/docs/files/../secret.png", Ct);

        Assert.DoesNotContain("secret.png", html);
        Assert.NotEqual(HttpStatusCode.OK, escape.StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
