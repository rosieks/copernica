using System.Collections.Concurrent;
using Copernica.Auth;
using Copernica.Hosting;
using Copernica.Spaces;

namespace Copernica.IntegrationTests.Infrastructure;

/// <summary>Stands in for a hosting platform: per-user, per-space permissions and failure injection.</summary>
public sealed class FakeHostingProvider : IHostingProvider
{
    private readonly ConcurrentDictionary<(string User, string Space), RepositoryPermission> _permissions = new();

    public SpaceProvider Provider => SpaceProvider.Git;

    public bool FailPermissionChecks { get; set; }

    public bool FailCredentials { get; set; }

    public int PermissionChecks;

    public void Set(string userId, string spaceId, RepositoryPermission permission) => _permissions[(userId, spaceId)] = permission;

    public Task<RepositoryPermission> GetPermissionsAsync(CurrentUser user, Space space, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref PermissionChecks);
        if (FailPermissionChecks)
        {
            throw new HttpRequestException("Hosting platform unavailable.");
        }

        return Task.FromResult(_permissions.GetValueOrDefault((user.Id, space.Id), RepositoryPermission.Full));
    }

    public Task<GitCredentials> GetUserGitCredentialsAsync(CurrentUser user, Space space, CancellationToken cancellationToken) =>
        FailCredentials
            ? throw new HttpRequestException("Token service unavailable.")
            : Task.FromResult(GitCredentials.None);

    public Task<GitCredentials> GetSyncGitCredentialsAsync(Space space, CancellationToken cancellationToken) =>
        Task.FromResult(GitCredentials.None);
}
