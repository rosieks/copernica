using System.Net;
using System.Text;
using System.Text.Json;
using Copernica.Data;
using Copernica.Hosting.AzureDevOps;
using Copernica.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Copernica.IntegrationTests.Auth;

/// <summary>Personal access tokens for Azure DevOps Server (task T100).</summary>
public sealed class UserPatTests : IDisposable
{
    private const string Pat = "abcdefghijklmnopqrstuvwxyz0123456789-secret";

    private readonly RecordingHandler _azureDevOps = new();
    private readonly CopernicaFactory _factory;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public UserPatTests()
    {
        _factory = new CopernicaFactory()
            .Set("Copernica:AzureDevOps:Server:UserPat", "true")
            .Set("Copernica:AzureDevOps:SyncCredential:Type", "Pat")
            .Set("Copernica:AzureDevOps:SyncCredential:Pat", "sync-pat")
            .Set("Copernica:Spaces:0:Id", "onprem")
            .Set("Copernica:Spaces:0:Provider", "AzureDevOps")
            .Set("Copernica:Spaces:0:RemoteUrl", "https://ado.example.test/DefaultCollection/Platform/_git/handbook")
            .ConfigureServices(services =>
                services.AddHttpClient(AzureDevOpsClient.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => _azureDevOps));
    }

    [Fact]
    public async Task Me_reports_that_a_token_is_required_until_one_is_registered()
    {
        var client = await _factory.SignInAsync();

        var before = await client.GetFromJsonAsync<JsonElement>("/api/me", Ct);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync("/api/me/tokens/azure-devops", new { token = Pat }, Ct)).StatusCode);
        var after = await client.GetFromJsonAsync<JsonElement>("/api/me", Ct);

        Assert.True(before.GetProperty("azureDevOpsPat").GetProperty("required").GetBoolean());
        Assert.False(before.GetProperty("azureDevOpsPat").GetProperty("registered").GetBoolean());
        Assert.True(after.GetProperty("azureDevOpsPat").GetProperty("registered").GetBoolean());
    }

    [Fact]
    public async Task Token_is_stored_encrypted_and_never_returned()
    {
        var client = await _factory.SignInAsync("alice");
        await client.PutAsJsonAsync("/api/me/tokens/azure-devops", new { token = Pat }, Ct);

        var state = await client.GetStringAsync("/api/me/tokens/azure-devops", Ct);
        var me = await client.GetStringAsync("/api/me", Ct);
        await using var scope = _factory.Services.CreateAsyncScope();
        var stored = await scope.ServiceProvider.GetRequiredService<CopernicaDbContext>().DelegatedTokens.SingleAsync(t => t.CacheKey == "pat:alice", Ct);

        Assert.DoesNotContain(Pat, state);
        Assert.DoesNotContain(Pat, me);
        Assert.DoesNotContain("secret", Encoding.UTF8.GetString(stored.Value));
    }

    [Fact]
    public async Task Permission_checks_use_the_users_own_token()
    {
        var client = await _factory.SignInAsync("alice");
        await client.PutAsJsonAsync("/api/me/tokens/azure-devops", new { token = Pat }, Ct);

        await client.GetAsync("/api/spaces", Ct);

        var expected = "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes($"alice:{Pat}"));
        Assert.Contains(_azureDevOps.Requests, r => r.Url.Contains("/_apis/permissions/") && r.Authorization == expected);
        Assert.DoesNotContain(_azureDevOps.Requests, r => r.Url.Contains("/_apis/permissions/") && r.Authorization != expected);
    }

    [Fact]
    public async Task Without_a_token_spaces_are_hidden_and_azure_devops_is_not_asked()
    {
        var client = await _factory.SignInAsync("bob");

        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.Empty(spaces.EnumerateArray());
        Assert.DoesNotContain(_azureDevOps.Requests, r => r.Url.Contains("/_apis/permissions/"));
    }

    [Fact]
    public async Task Removing_the_token_deletes_it()
    {
        var client = await _factory.SignInAsync();
        await client.PutAsJsonAsync("/api/me/tokens/azure-devops", new { token = Pat }, Ct);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/me/tokens/azure-devops", Ct)).StatusCode);
        var state = await client.GetFromJsonAsync<JsonElement>("/api/me/tokens/azure-devops", Ct);

        Assert.False(state.GetProperty("registered").GetBoolean());
    }

    [Theory]
    [InlineData("")]
    [InlineData("has spaces inside")]
    public async Task Invalid_tokens_are_rejected(string token)
    {
        var client = await _factory.SignInAsync();

        var response = await client.PutAsJsonAsync("/api/me/tokens/azure-devops", new { token }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    public void Dispose() => _factory.Dispose();

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public List<(string Url, string? Authorization)> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!.ToString();
            lock (Requests)
            {
                Requests.Add((url, request.Headers.Authorization?.ToString()));
            }

            string body = url switch
            {
                _ when url.Contains("/_apis/securitynamespaces/") =>
                    """{"value":[{"actions":[{"bit":2,"name":"GenericRead"},{"bit":4,"name":"GenericContribute"}]}]}""",
                _ when url.Contains("/_apis/git/repositories/") =>
                    """{"id":"22222222-2222-2222-2222-222222222222","project":{"id":"11111111-1111-1111-1111-111111111111"}}""",
                _ => """{"count":1,"value":[true]}""",
            };

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
}
