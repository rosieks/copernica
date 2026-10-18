using Copernica.IntegrationTests.Infrastructure;
using Copernica.Web;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;

namespace Copernica.IntegrationTests.Web;

/// <summary>The isolated diagram renderer page and its assets (004 contracts/renderer.md).</summary>
public sealed class RendererPageTests : IDisposable
{
    private readonly string _webRoot = Path.Combine(Path.GetTempPath(), "copernica-web-" + Guid.NewGuid().ToString("N"));
    private readonly CopernicaFactory _factory;

    public RendererPageTests()
    {
        Directory.CreateDirectory(Path.Combine(_webRoot, "assets"));
        File.WriteAllText(Path.Combine(_webRoot, "index.html"),
            "<!doctype html><html><head><meta name=\"csp-nonce\" content=\"__CSP_NONCE__\" /></head><body></body></html>");
        File.WriteAllText(Path.Combine(_webRoot, "diagram-renderer.html"),
            "<!doctype html><html><head><script type=\"module\" src=\"/assets/renderer.js\"></script></head><body></body></html>");
        File.WriteAllText(Path.Combine(_webRoot, "assets", "renderer.js"), "export {};");
        _factory = new CopernicaFactory().ConfigureServices(services =>
        {
            services.RemoveAll<SpaAssets>();
            services.AddSingleton(new SpaAssets(new PhysicalFileProvider(_webRoot)));
        });
    }

    [Fact]
    public async Task Renderer_page_has_its_own_policy()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync(SecurityHeadersMiddleware.RendererPath, TestContext.Current.CancellationToken);

        response.EnsureSuccessStatusCode();
        Assert.Equal(SecurityHeadersMiddleware.RendererPolicy, response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("SAMEORIGIN", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
        Assert.Contains("connect-src 'none'", SecurityHeadersMiddleware.RendererPolicy, StringComparison.Ordinal);
        Assert.Contains("script-src 'self';", SecurityHeadersMiddleware.RendererPolicy, StringComparison.Ordinal);
        Assert.DoesNotContain("unsafe-eval", SecurityHeadersMiddleware.RendererPolicy, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Shell_keeps_the_spa_policy_with_a_nonce()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/", TestContext.Current.CancellationToken);

        var header = response.Headers.GetValues("Content-Security-Policy").Single();
        Assert.Contains("'nonce-", header, StringComparison.Ordinal);
        Assert.Contains("frame-ancestors 'none'", header, StringComparison.Ordinal);
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
    }

    [Fact]
    public async Task Api_responses_are_unchanged()
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync("/api/spaces", TestContext.Current.CancellationToken);

        Assert.Equal(SecurityHeadersMiddleware.ContentSecurityPolicy, response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("null")]
    public async Task Assets_can_be_loaded_by_the_opaque_renderer(string? origin)
    {
        // Same headers with and without Origin: the page and the renderer share cached chunks.
        using var request = new HttpRequestMessage(HttpMethod.Get, "/assets/renderer.js");
        if (origin is not null)
        {
            request.Headers.Add("Origin", origin);
        }

        var response = await _factory.CreateAnonymousClient().SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal("*", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task Pages_and_api_do_not_allow_other_origins()
    {
        var client = await _factory.SignInAsync();
        foreach (var path in new[] { "/", SecurityHeadersMiddleware.RendererPath, "/api/spaces" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, path);
            request.Headers.Add("Origin", "null");

            var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

            Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"), path);
        }
    }

    public void Dispose()
    {
        _factory.Dispose();
        try
        {
            Directory.Delete(_webRoot, recursive: true);
        }
        catch (IOException)
        {
        }
    }
}
