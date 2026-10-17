using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Copernica.Spaces;

namespace Copernica.Hosting.AzureDevOps;

public sealed record AzureDevOpsRepositoryIds(Guid ProjectId, Guid RepositoryId);

/// <summary>Minimal Azure DevOps REST client (api-version 7.1): repository ids, permissions, namespace check.</summary>
public sealed class AzureDevOpsClient(IHttpClientFactory httpClients, ILogger<AzureDevOpsClient> logger)
{
    public const string HttpClientName = "azure-devops";
    private const string ApiVersion = "api-version=7.1";

    private readonly ConcurrentDictionary<string, AzureDevOpsRepositoryIds> _ids = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<Uri, bool> _verifiedNamespaces = new();

    /// <summary>Project and repository ids, resolved once per space with the sync credential.</summary>
    public async Task<AzureDevOpsRepositoryIds> GetRepositoryIdsAsync(Space space, AzureDevOpsRepositoryUrl url, GitCredentials credentials, CancellationToken cancellationToken)
    {
        if (_ids.TryGetValue(space.Id, out var cached))
        {
            return cached;
        }

        var repository = await GetAsync<RepositoryResponse>(
            url.Api($"{Uri.EscapeDataString(url.Project)}/_apis/git/repositories/{Uri.EscapeDataString(url.Repository)}?{ApiVersion}"),
            credentials,
            cancellationToken);
        var ids = new AzureDevOpsRepositoryIds(repository.Project.Id, repository.Id);
        _ids[space.Id] = ids;
        return ids;
    }

    /// <summary>Evaluates one permission bit on one token for the identity behind <paramref name="credentials"/>.</summary>
    public async Task<bool> HasPermissionAsync(AzureDevOpsRepositoryUrl url, int bit, string token, GitCredentials credentials, CancellationToken cancellationToken)
    {
        var result = await GetAsync<HasPermissionsResponse>(
            url.Api($"_apis/permissions/{SecurityTokens.GitRepositoriesNamespace}/{bit}?tokens={Uri.EscapeDataString(token)}&alwaysAllowAdministrators=false&{ApiVersion}"),
            credentials,
            cancellationToken);
        return result.Value is [true, ..];
    }

    /// <summary>
    /// Confirms the "Git Repositories" bit values used here (they come from community documentation, research.md R4).
    /// </summary>
    public async Task EnsureNamespaceAsync(AzureDevOpsRepositoryUrl url, GitCredentials credentials, CancellationToken cancellationToken)
    {
        if (_verifiedNamespaces.ContainsKey(url.CollectionUrl))
        {
            return;
        }

        var response = await GetAsync<NamespacesResponse>(
            url.Api($"_apis/securitynamespaces/{SecurityTokens.GitRepositoriesNamespace}?{ApiVersion}"),
            credentials,
            cancellationToken);
        var actions = response.Value.SelectMany(n => n.Actions).ToDictionary(a => a.Name, a => a.Bit, StringComparer.Ordinal);
        if (actions.GetValueOrDefault("GenericRead") != SecurityTokens.GenericRead ||
            actions.GetValueOrDefault("GenericContribute") != SecurityTokens.GenericContribute)
        {
            throw new InvalidOperationException("The Azure DevOps 'Git Repositories' security namespace has unexpected permission bits.");
        }

        _verifiedNamespaces[url.CollectionUrl] = true;
    }

    private async Task<T> GetAsync<T>(Uri uri, GitCredentials credentials, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (credentials.BearerToken is { } bearer)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        }
        else if (credentials.Password is { } password)
        {
            var raw = System.Text.Encoding.UTF8.GetBytes($"{credentials.Username}:{password}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(raw));
        }

        using var response = await httpClients.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        if (response.StatusCode is HttpStatusCode.Unauthorized)
        {
            throw new ReauthenticationRequiredException("Azure DevOps rejected the credentials.");
        }

        // Azure DevOps answers unauthenticated calls with a sign-in page (203) instead of 401.
        if (!response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.NonAuthoritativeInformation)
        {
            logger.LogWarning("Azure DevOps request {Path} failed with {Status}.", uri.AbsolutePath, (int)response.StatusCode);
            throw new HttpRequestException($"Azure DevOps returned {(int)response.StatusCode}.", null, response.StatusCode);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, cancellationToken)
            ?? throw new HttpRequestException("Azure DevOps returned an empty response.");
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record RepositoryResponse(Guid Id, ProjectReference Project);

    private sealed record ProjectReference(Guid Id);

    private sealed record HasPermissionsResponse(bool[] Value);

    private sealed record NamespacesResponse(NamespaceDescription[] Value);

    private sealed record NamespaceDescription([property: JsonPropertyName("actions")] ActionDefinition[] Actions);

    private sealed record ActionDefinition(int Bit, string Name);
}
