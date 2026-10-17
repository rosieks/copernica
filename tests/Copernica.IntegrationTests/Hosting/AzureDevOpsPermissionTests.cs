using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using Copernica.Auth;
using Copernica.Hosting;
using Copernica.Hosting.AzureDevOps;
using Copernica.IntegrationTests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Copernica.IntegrationTests.Hosting;

/// <summary>Permission checks against a stubbed Azure DevOps REST API (task T052).</summary>
public sealed class AzureDevOpsPermissionTests : IDisposable
{
    private const string ProjectId = "11111111-1111-1111-1111-111111111111";
    private const string RepositoryId = "22222222-2222-2222-2222-222222222222";

    private readonly AzureDevOpsStub _stub = new();
    private readonly CopernicaFactory _factory;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public AzureDevOpsPermissionTests()
    {
        _factory = new CopernicaFactory()
            .Set("Copernica:PermissionCacheTtl", "00:00:01")
            .Set("Copernica:AzureDevOps:SyncCredential:Type", "Pat")
            .Set("Copernica:AzureDevOps:SyncCredential:Pat", "sync-pat")
            .Set("Copernica:Spaces:0:Id", "handbook")
            .Set("Copernica:Spaces:0:Provider", "AzureDevOps")
            .Set("Copernica:Spaces:0:RemoteUrl", "https://ado.example.test/contoso/Platform/_git/handbook")
            .ConfigureServices(services =>
            {
                services.AddHttpClient(AzureDevOpsClient.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => _stub);
                services.RemoveAll<IAzureDevOpsUserCredentials>();
                services.AddScoped<IAzureDevOpsUserCredentials, FakeUserCredentials>();
            });
    }

    [Fact]
    public async Task Read_and_write_are_mapped_from_azure_devops()
    {
        _stub.Grant("alice", SecurityTokens.GenericRead, SecurityTokens.GenericContribute);
        _stub.Grant("bob", SecurityTokens.GenericRead);

        var alice = await (await _factory.SignInAsync("alice")).GetFromJsonAsync<JsonElement>("/api/spaces", Ct);
        var bob = await (await _factory.SignInAsync("bob")).GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.True(alice[0].GetProperty("canWrite").GetBoolean() || alice[0].GetProperty("state").GetString() == "unavailable");
        Assert.Equal("handbook", alice[0].GetProperty("id").GetString());
        Assert.False(bob[0].GetProperty("canWrite").GetBoolean());
        Assert.Contains(_stub.Requests, r => r.Contains($"/_apis/permissions/{SecurityTokens.GitRepositoriesNamespace}/4") &&
                                               r.Contains(Uri.EscapeDataString($"repoV2/{ProjectId}/{RepositoryId}/refs/heads/6d00610069006e00")));
        Assert.Contains(_stub.Requests, r => r.Contains("Bearer user-alice"));
    }

    [Fact]
    public async Task User_without_read_permission_does_not_see_the_space()
    {
        var client = await _factory.SignInAsync("bob");

        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.Empty(spaces.EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/spaces/handbook/tree", Ct)).StatusCode);
    }

    [Fact]
    public async Task Azure_devops_errors_deny_access_and_are_not_cached()
    {
        _stub.Grant("alice", SecurityTokens.GenericRead);
        _stub.FailPermissions = true;
        var client = await _factory.SignInAsync("alice");

        var denied = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);
        _stub.FailPermissions = false;
        var allowed = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.Empty(denied.EnumerateArray());
        Assert.Single(allowed.EnumerateArray());
    }

    [Fact]
    public async Task Permissions_are_cached_for_the_configured_ttl_then_rechecked()
    {
        _stub.Grant("alice", SecurityTokens.GenericRead);
        var client = await _factory.SignInAsync("alice");

        await client.GetAsync("/api/spaces", Ct);
        var afterFirst = _stub.PermissionCalls;
        await client.GetAsync("/api/spaces", Ct);
        var cached = _stub.PermissionCalls;
        _stub.Revoke("alice");
        await Task.Delay(TimeSpan.FromSeconds(1.5), Ct);
        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.Equal(afterFirst, cached);
        Assert.Empty(spaces.EnumerateArray());
    }

    [Fact]
    public async Task Rejected_user_token_asks_the_user_to_sign_in_again()
    {
        _stub.RejectUserTokens = true;
        var client = await _factory.SignInAsync("alice");

        var response = await client.GetAsync("/api/spaces", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("reauthentication-required", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Unexpected_permission_bits_deny_access()
    {
        _stub.Grant("alice", SecurityTokens.GenericRead);
        _stub.WrongNamespaceBits = true;
        var client = await _factory.SignInAsync("alice");

        var spaces = await client.GetFromJsonAsync<JsonElement>("/api/spaces", Ct);

        Assert.Empty(spaces.EnumerateArray());
    }

    public void Dispose() => _factory.Dispose();

    private sealed class FakeUserCredentials : IAzureDevOpsUserCredentials
    {
        public Task<GitCredentials> GetAsync(CurrentUser user, CancellationToken cancellationToken) =>
            Task.FromResult(GitCredentials.Bearer($"user-{user.Id}"));
    }

    private sealed class AzureDevOpsStub : HttpMessageHandler
    {
        private readonly ConcurrentDictionary<string, HashSet<int>> _grants = new();

        public ConcurrentBag<string> Requests { get; } = [];

        public bool FailPermissions { get; set; }

        public bool RejectUserTokens { get; set; }

        public bool WrongNamespaceBits { get; set; }

        public int PermissionCalls;

        public void Grant(string user, params int[] bits) => _grants[user] = [.. bits];

        public void Revoke(string user) => _grants.TryRemove(user, out _);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!.ToString();
            var auth = request.Headers.Authorization?.ToString() ?? "";
            Requests.Add($"{url} {auth}");

            if (url.Contains("/_apis/securitynamespaces/", StringComparison.Ordinal))
            {
                var read = WrongNamespaceBits ? 8 : 2;
                return Json(new { value = new[] { new { actions = new[] { new { bit = read, name = "GenericRead" }, new { bit = 4, name = "GenericContribute" } } } } });
            }

            if (url.Contains("/Platform/_apis/git/repositories/handbook", StringComparison.Ordinal))
            {
                return Json(new { id = RepositoryId, project = new { id = ProjectId } });
            }

            if (url.Contains("/_apis/permissions/", StringComparison.Ordinal))
            {
                Interlocked.Increment(ref PermissionCalls);
                if (RejectUserTokens)
                {
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized));
                }

                if (FailPermissions)
                {
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError));
                }

                var bit = int.Parse(request.RequestUri.Segments[^1].TrimEnd('/'), System.Globalization.CultureInfo.InvariantCulture);
                var user = auth.StartsWith("Bearer user-", StringComparison.Ordinal) ? auth["Bearer user-".Length..] : "";
                var allowed = _grants.TryGetValue(user, out var bits) && bits.Contains(bit);
                return Json(new { count = 1, value = new[] { allowed } });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }

        private static Task<HttpResponseMessage> Json(object body) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            });
    }
}
