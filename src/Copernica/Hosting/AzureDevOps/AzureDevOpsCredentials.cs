using Copernica.Auth;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Client;
using Microsoft.Identity.Client.AppConfig;
using Microsoft.Identity.Web;

namespace Copernica.Hosting.AzureDevOps;

/// <summary>Credentials that act on behalf of the signed-in user against Azure DevOps.</summary>
public interface IAzureDevOpsUserCredentials
{
    Task<GitCredentials> GetAsync(CurrentUser user, CancellationToken cancellationToken);
}

/// <summary>
/// Microsoft Entra ID delegated token for Azure DevOps Services, acquired from the server-side
/// token cache (never parsed, lifetime never assumed — research.md R3).
/// </summary>
public sealed class EntraUserCredentials(ITokenAcquisition tokens, IHttpContextAccessor http) : IAzureDevOpsUserCredentials
{
    public async Task<GitCredentials> GetAsync(CurrentUser user, CancellationToken cancellationToken)
    {
        var principal = http.HttpContext?.User ?? throw new InvalidOperationException("No HTTP context.");
        try
        {
            var token = await tokens.GetAccessTokenForUserAsync([AzureDevOpsOptions.Scope], user: principal);
            return GitCredentials.Bearer(token);
        }
        catch (Exception ex) when (ex is MicrosoftIdentityWebChallengeUserException or MsalUiRequiredException)
        {
            throw new ReauthenticationRequiredException("Sign in again to continue working with Azure DevOps.", ex);
        }
    }
}

/// <summary>Used when no delegated identity is configured: Azure DevOps spaces stay inaccessible.</summary>
public sealed class UnavailableUserCredentials : IAzureDevOpsUserCredentials
{
    public Task<GitCredentials> GetAsync(CurrentUser user, CancellationToken cancellationToken) =>
        throw new InvalidOperationException(
            "Azure DevOps spaces require Copernica:Auth:Mode=EntraId (Azure DevOps Services) or Copernica:AzureDevOps:Server:UserPat=true (Azure DevOps Server).");
}

/// <summary>Deployment-level read-only identity for background fetches (research.md R3).</summary>
public sealed class SyncCredentialProvider(IOptions<AzureDevOpsOptions> options)
{
    private readonly Lazy<IConfidentialClientApplication?> _confidential = new(() => CreateConfidential(options.Value.SyncCredential));
    private readonly Lazy<IManagedIdentityApplication?> _managed = new(() => CreateManaged(options.Value.SyncCredential));

    public async Task<GitCredentials> GetAsync(CancellationToken cancellationToken)
    {
        var settings = options.Value.SyncCredential;
        switch (settings.Type)
        {
            case SyncCredentialType.Pat when !string.IsNullOrEmpty(settings.Pat):
                return GitCredentials.Basic("copernica", settings.Pat);
            case SyncCredentialType.ServicePrincipal:
                var app = _confidential.Value ?? throw new InvalidOperationException("Sync service principal needs TenantId, ClientId and ClientSecret.");
                var result = await app.AcquireTokenForClient([AzureDevOpsOptions.Scope]).ExecuteAsync(cancellationToken);
                return GitCredentials.Bearer(result.AccessToken);
            case SyncCredentialType.ManagedIdentity:
                var managed = await _managed.Value!.AcquireTokenForManagedIdentity(AzureDevOpsOptions.ResourceId).ExecuteAsync(cancellationToken);
                return GitCredentials.Bearer(managed.AccessToken);
            default:
                throw new InvalidOperationException("Configure Copernica:AzureDevOps:SyncCredential to synchronize Azure DevOps spaces.");
        }
    }

    private static IConfidentialClientApplication? CreateConfidential(SyncCredentialOptions o) =>
        o.Type != SyncCredentialType.ServicePrincipal || string.IsNullOrEmpty(o.TenantId) || string.IsNullOrEmpty(o.ClientId) || string.IsNullOrEmpty(o.ClientSecret)
            ? null
            : ConfidentialClientApplicationBuilder.Create(o.ClientId)
                .WithTenantId(o.TenantId)
                .WithClientSecret(o.ClientSecret)
                .Build();

    private static IManagedIdentityApplication? CreateManaged(SyncCredentialOptions o) =>
        o.Type != SyncCredentialType.ManagedIdentity
            ? null
            : ManagedIdentityApplicationBuilder.Create(
                    string.IsNullOrEmpty(o.ManagedIdentityClientId)
                        ? ManagedIdentityId.SystemAssigned
                        : ManagedIdentityId.WithUserAssignedClientId(o.ManagedIdentityClientId))
                .Build();
}
