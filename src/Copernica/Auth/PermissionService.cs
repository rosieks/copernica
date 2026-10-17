using Copernica.Configuration;
using Copernica.Hosting;
using Copernica.Spaces;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Copernica.Auth;

/// <summary>
/// Cached view of the user's repository permissions (data-model.md "RepositoryPermission").
/// Errors deny access and are not cached, so the platform is asked again next time.
/// </summary>
public sealed class PermissionService(
    SpaceRegistry spaces,
    HostingProviders providers,
    IMemoryCache cache,
    IOptions<CopernicaOptions> options,
    ILogger<PermissionService> logger)
{
    public async Task<RepositoryPermission> GetAsync(CurrentUser user, Space space, CancellationToken cancellationToken)
    {
        var key = (nameof(PermissionService), user.Id, space.Id);
        if (cache.TryGetValue(key, out RepositoryPermission? cached) && cached is not null)
        {
            return cached;
        }

        try
        {
            var permission = await providers.For(space).GetPermissionsAsync(user, space, cancellationToken);
            cache.Set(key, permission, options.Value.PermissionCacheTtl);
            return permission;
        }
        catch (Exception ex) when (ex is not OperationCanceledException and not ReauthenticationRequiredException)
        {
            logger.LogWarning(ex, "Permission check failed for user {UserId} on space {SpaceId}; denying access.", user.Id, space.Id);
            return RepositoryPermission.None;
        }
    }

    public void Invalidate(CurrentUser user, Space space) => cache.Remove((nameof(PermissionService), user.Id, space.Id));

    public void InvalidateAll(CurrentUser user)
    {
        foreach (var space in spaces.Valid)
        {
            Invalidate(user, space);
        }
    }

    /// <summary>Resolves a readable space or a 404 problem (existence of unreadable spaces is not disclosed).</summary>
    public async Task<SpaceAccess> RequireReadAsync(HttpContext context, string spaceId)
    {
        var space = spaces.Find(spaceId);
        if (space is null)
        {
            return SpaceAccess.Denied(ProblemTypes.NotFound());
        }

        var user = context.GetCurrentUser();
        var permission = space.IsValid ? await GetAsync(user, space, context.RequestAborted) : RepositoryPermission.None;
        return permission.CanRead
            ? SpaceAccess.Granted(space, user, permission)
            : SpaceAccess.Denied(ProblemTypes.NotFound());
    }

    /// <summary>Resolves a writable space; 404 when unreadable, 403 <c>no-write-permission</c> when read-only.</summary>
    public async Task<SpaceAccess> RequireWriteAsync(HttpContext context, string spaceId)
    {
        var access = await RequireReadAsync(context, spaceId);
        if (access.Problem is not null || access.Permission!.CanWrite)
        {
            return access;
        }

        return SpaceAccess.Denied(ProblemTypes.Forbidden(
            "no-write-permission",
            "You do not have permission to change this space.",
            "Ask for contribute permission on the repository in your git hosting platform."));
    }
}

public sealed record SpaceAccess(Space? Space, CurrentUser? User, RepositoryPermission? Permission, IResult? Problem)
{
    public static SpaceAccess Granted(Space space, CurrentUser user, RepositoryPermission permission) => new(space, user, permission, null);

    public static SpaceAccess Denied(IResult problem) => new(null, null, null, problem);
}
