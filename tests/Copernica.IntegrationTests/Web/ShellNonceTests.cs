using System.Text.RegularExpressions;
using Copernica.IntegrationTests.Infrastructure;
using Copernica.Web;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;

namespace Copernica.IntegrationTests.Web;

/// <summary>The SPA shell carries a fresh style nonce per response (002 research R3, api-changes.md §3).</summary>
public sealed partial class ShellNonceTests : IDisposable
{
    private const string Shell =
        "<!doctype html><html><head><meta name=\"csp-nonce\" content=\"__CSP_NONCE__\" /></head><body></body></html>";

    private readonly string _webRoot = Path.Combine(Path.GetTempPath(), "copernica-web-" + Guid.NewGuid().ToString("N"));
    private readonly CopernicaFactory _factory;

    public ShellNonceTests()
    {
        Directory.CreateDirectory(Path.Combine(_webRoot, "assets"));
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), Shell);
        File.WriteAllText(Path.Combine(_webRoot, "assets", "app.js"), "export {};");
        _factory = new CopernicaFactory().ConfigureServices(services =>
        {
            services.RemoveAll<SpaAssets>();
            services.AddSingleton(new SpaAssets(new PhysicalFileProvider(_webRoot)));
        });
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/index.html")]
    [InlineData("/s/handbook/guides/setup.md")]
    public async Task Shell_nonce_in_header_matches_document(string path)
    {
        var (header, nonce, body) = await GetShellAsync(path);

        Assert.Equal(SecurityHeadersMiddleware.BuildPolicy(nonce), header);
        Assert.Contains("script-src 'self';", header, StringComparison.Ordinal);
        Assert.DoesNotContain(SpaHosting.NoncePlaceholder, body, StringComparison.Ordinal);
        Assert.Equal(16, Convert.FromBase64String(nonce).Length);
    }

    [Fact]
    public async Task Every_shell_response_gets_a_new_nonce()
    {
        var (_, first, _) = await GetShellAsync("/");
        var (_, second, _) = await GetShellAsync("/");

        Assert.NotEqual(first, second);
    }

    [Theory]
    [InlineData("/api/spaces")]
    [InlineData("/assets/app.js")]
    [InlineData("/health/live")]
    public async Task Other_responses_keep_the_static_policy(string path)
    {
        var client = await _factory.SignInAsync();

        var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        var header = response.Headers.GetValues("Content-Security-Policy").Single();
        Assert.Equal(SecurityHeadersMiddleware.ContentSecurityPolicy, header);
        Assert.DoesNotContain("nonce-", header, StringComparison.Ordinal);
    }

    private async Task<(string Header, string Nonce, string Body)> GetShellAsync(string path)
    {
        var response = await _factory.CreateAnonymousClient().GetAsync(path, TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var nonce = MetaNonce().Match(body).Groups[1].Value;
        Assert.NotEmpty(nonce);
        return (response.Headers.GetValues("Content-Security-Policy").Single(), nonce, body);
    }

    [GeneratedRegex("<meta name=\"csp-nonce\" content=\"([^\"]+)\"")]
    private static partial Regex MetaNonce();

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
