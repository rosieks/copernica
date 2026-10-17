using System.Net;
using Copernica.IntegrationTests.Infrastructure;
using Copernica.Web;

namespace Copernica.IntegrationTests.Web;

public sealed class SecurityHeadersTests : IDisposable
{
    private readonly CopernicaFactory _factory = new();

    [Theory]
    [InlineData("/health/live")]
    [InlineData("/health/ready")]
    [InlineData("/api/spaces")]
    // The SPA shell carries the same policy plus a style nonce; see ShellNonceTests.
    public async Task Every_response_carries_the_strict_security_headers(string path)
    {
        var response = await _factory.CreateAnonymousClient().GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(SecurityHeadersMiddleware.ContentSecurityPolicy, response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
    }

    [Theory]
    [InlineData("/health/live")]
    [InlineData("/health/ready")]
    public async Task Health_endpoints_are_anonymous(string path)
    {
        var response = await _factory.CreateAnonymousClient().GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Api_requires_authentication()
    {
        var response = await _factory.CreateAnonymousClient().GetAsync("/api/me", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task State_changing_requests_without_antiforgery_token_are_rejected()
    {
        var client = await _factory.SignInAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/auth/logout");
        request.Headers.Add("X-Skip-Antiforgery", "1");

        var response = await _factory.Server.CreateClient().SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        _ = client;
    }

    [Fact]
    public async Task Wrong_password_is_rejected()
    {
        var response = await _factory.CreateAnonymousClient().PostAsJsonAsync(
            "/auth/login", new { username = "alice", password = "wrong" }, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    public void Dispose() => _factory.Dispose();
}
