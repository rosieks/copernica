using Copernica.Auth;
using Copernica.Spaces;

namespace Copernica.Hosting.AzureDevOps;

/// <summary>
/// Azure DevOps (Services and Server): permissions are asked with the user's own credentials,
/// pushes are made with them, so the platform enforces repository rights and branch policies
/// (FR-009, FR-013, research.md R3/R4).
/// </summary>
public sealed class AzureDevOpsHostingProvider(
    AzureDevOpsClient client,
    IAzureDevOpsUserCredentials userCredentials,
    SyncCredentialProvider syncCredentials) : IHostingProvider
{
    public SpaceProvider Provider => SpaceProvider.AzureDevOps;

    public async Task<RepositoryPermission> GetPermissionsAsync(CurrentUser user, Space space, CancellationToken cancellationToken)
    {
        var url = Parse(space);
        AzureDevOpsRepositoryIds ids;
        try
        {
            var sync = await syncCredentials.GetAsync(cancellationToken);
            await client.EnsureNamespaceAsync(url, sync, cancellationToken);
            ids = await client.GetRepositoryIdsAsync(space, url, sync, cancellationToken);
        }
        catch (ReauthenticationRequiredException ex)
        {
            // A rejected deployment credential is an operator problem, not the user's.
            throw new InvalidOperationException("The Azure DevOps sync credential was rejected.", ex);
        }

        var credentials = await userCredentials.GetAsync(user, cancellationToken);
        var canRead = await client.HasPermissionAsync(url, SecurityTokens.GenericRead, SecurityTokens.Repository(ids.ProjectId, ids.RepositoryId), credentials, cancellationToken);
        if (!canRead)
        {
            return RepositoryPermission.None;
        }

        var canWrite = await client.HasPermissionAsync(url, SecurityTokens.GenericContribute, SecurityTokens.Branch(ids.ProjectId, ids.RepositoryId, space.Branch), credentials, cancellationToken);
        return new RepositoryPermission(true, canWrite);
    }

    public Task<GitCredentials> GetUserGitCredentialsAsync(CurrentUser user, Space space, CancellationToken cancellationToken) =>
        userCredentials.GetAsync(user, cancellationToken);

    public Task<GitCredentials> GetSyncGitCredentialsAsync(Space space, CancellationToken cancellationToken) =>
        syncCredentials.GetAsync(cancellationToken);

    private static AzureDevOpsRepositoryUrl Parse(Space space) =>
        AzureDevOpsRepositoryUrl.TryParse(space.RemoteUrl, out var url)
            ? url
            : throw new InvalidOperationException($"'{space.RemoteUrl}' is not an Azure DevOps git URL.");
}
