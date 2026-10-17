using Copernica.Auth;
using Copernica.Spaces;

namespace Copernica.Hosting.Git;

/// <summary>
/// Plain git remote (or a repository kept only on the data volume) without platform integration:
/// every signed-in user can read and edit (FR-009c). HTTPS remotes use the space's token.
/// </summary>
public sealed class GitHostingProvider : IHostingProvider
{
    public SpaceProvider Provider => SpaceProvider.Git;

    public Task<RepositoryPermission> GetPermissionsAsync(CurrentUser user, Space space, CancellationToken cancellationToken) =>
        Task.FromResult(RepositoryPermission.Full);

    public Task<GitCredentials> GetUserGitCredentialsAsync(CurrentUser user, Space space, CancellationToken cancellationToken) =>
        Task.FromResult(SpaceCredentials(space));

    public Task<GitCredentials> GetSyncGitCredentialsAsync(Space space, CancellationToken cancellationToken) =>
        Task.FromResult(SpaceCredentials(space));

    private static GitCredentials SpaceCredentials(Space space) =>
        string.IsNullOrEmpty(space.Credential.Token)
            ? GitCredentials.None
            : GitCredentials.Basic(space.Credential.Username, space.Credential.Token);
}
