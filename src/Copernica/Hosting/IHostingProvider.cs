using Copernica.Auth;
using Copernica.Spaces;

namespace Copernica.Hosting;

/// <summary>The user's rights on a space's repository, as reported by the hosting platform.</summary>
public sealed record RepositoryPermission(bool CanRead, bool CanWrite)
{
    public static readonly RepositoryPermission None = new(false, false);
    public static readonly RepositoryPermission Full = new(true, true);
}

/// <summary>Credentials for a single git fetch/push.</summary>
public sealed record GitCredentials(string? BearerToken = null, string? Username = null, string? Password = null)
{
    public static readonly GitCredentials None = new();

    public static GitCredentials Bearer(string token) => new(BearerToken: token);

    public static GitCredentials Basic(string username, string password) => new(Username: username, Password: password);
}

/// <summary>Integration with a git hosting platform (research.md R3, R4).</summary>
public interface IHostingProvider
{
    SpaceProvider Provider { get; }

    /// <summary>Asks the platform what the user may do; must throw rather than guess on failure.</summary>
    Task<RepositoryPermission> GetPermissionsAsync(CurrentUser user, Space space, CancellationToken cancellationToken);

    /// <summary>Credentials to fetch and push on the user's behalf.</summary>
    Task<GitCredentials> GetUserGitCredentialsAsync(CurrentUser user, Space space, CancellationToken cancellationToken);

    /// <summary>Deployment-level, read-only credentials for background synchronization.</summary>
    Task<GitCredentials> GetSyncGitCredentialsAsync(Space space, CancellationToken cancellationToken);
}

public sealed class HostingProviders(IEnumerable<IHostingProvider> providers)
{
    private readonly Dictionary<SpaceProvider, IHostingProvider> _byType = providers.ToDictionary(p => p.Provider);

    public IHostingProvider For(Space space) =>
        _byType.TryGetValue(space.Provider, out var provider)
            ? provider
            : throw new InvalidOperationException($"No hosting provider registered for '{space.Provider}'.");
}
