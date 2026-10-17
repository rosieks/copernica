using Copernica.Auth;
using Copernica.Data;
using Copernica.Hosting;
using Copernica.Hosting.AzureDevOps;
using Microsoft.Extensions.Options;
using Copernica.Spaces;

namespace Copernica.Api;

public sealed record SpaceDto(string Id, string DisplayName, string State, DateTime? LastSyncAt, string? Message, bool CanWrite);

public static class SpacesEndpoints
{
    public static RouteGroupBuilder MapSpacesEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/me", async (HttpContext context, IOptions<AzureDevOpsOptions> azureDevOps, UserPatStore pats) =>
        {
            var user = context.GetCurrentUser();
            var patRequired = azureDevOps.Value.Server.UserPat;
            var patRegistered = patRequired && await pats.RegisteredAtAsync(user.Id, context.RequestAborted) is not null;
            return Results.Ok(new
            {
                id = user.Id,
                displayName = user.DisplayName,
                email = user.Email,
                azureDevOpsPat = new { required = patRequired, registered = patRegistered },
            });
        });

        api.MapGet("/spaces", ListSpacesAsync);
        api.MapGet("/spaces/{spaceId}/tree", GetTreeAsync);
        api.MapGet("/spaces/{spaceId}/pages/{**path}", GetPageAsync);
        return api;
    }

    private static async Task<IResult> ListSpacesAsync(HttpContext context, SpaceRegistry registry, PermissionService permissions)
    {
        var user = context.GetCurrentUser();
        var result = new List<SpaceDto>();
        foreach (var space in registry.All)
        {
            if (!space.IsValid)
            {
                // Misconfigured plain git spaces are shown so their users see why (FR-026);
                // platform-backed ones are hidden because access cannot be checked.
                if (space.Provider == SpaceProvider.Git && registry.Find(space.Id) is null && result.All(r => r.Id != space.Id))
                {
                    result.Add(ToDto(space, registry.GetStatus(space), RepositoryPermission.None));
                }

                continue;
            }

            var permission = await permissions.GetAsync(user, space, context.RequestAborted);
            if (permission.CanRead)
            {
                result.Add(ToDto(space, registry.GetStatus(space), permission));
            }
        }

        return Results.Ok(result);
    }

    private static async Task<IResult> GetTreeAsync(string spaceId, HttpContext context, PermissionService permissions, PageService pages, PageTreeService trees)
    {
        var access = await permissions.RequireReadAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        var head = pages.GetHead(access.Space!);
        if (head is null)
        {
            return SpaceUnavailable(access.Space!);
        }

        return Results.Ok(trees.GetTree(access.Space!, head));
    }

    private static async Task<IResult> GetPageAsync(
        string spaceId,
        string path,
        string? version,
        bool? source,
        HttpContext context,
        PermissionService permissions,
        PageService pages)
    {
        var access = await permissions.RequireReadAsync(context, spaceId);
        if (access.Problem is not null)
        {
            return access.Problem;
        }

        if (!SpacePaths.TryNormalizePage(path, out var normalized))
        {
            return ProblemTypes.NotFound();
        }

        var lookup = pages.GetPage(access.Space!, normalized, version, source ?? false);
        return lookup.Status switch
        {
            PageLookupStatus.Found => Results.Ok(lookup.Page),
            PageLookupStatus.SpaceUnavailable => SpaceUnavailable(access.Space!),
            _ => ProblemTypes.NotFound(),
        };
    }

    internal static IResult SpaceUnavailable(Space space) =>
        ProblemTypes.Unavailable("space-unavailable", "This space is not available right now.", $"Space '{space.DisplayName}' has not been synchronized yet or its repository cannot be reached.");

    private static SpaceDto ToDto(Space space, SpaceStatus status, RepositoryPermission permission) => new(
        space.Id,
        space.DisplayName,
        status.State switch
        {
            SpaceState.Initializing => "initializing",
            SpaceState.Ready => "ready",
            SpaceState.OutOfSync => "outOfSync",
            _ => "unavailable",
        },
        status.LastSyncAt,
        status.State == SpaceState.Ready ? null : status.LastError,
        permission.CanWrite && status.State != SpaceState.Unavailable);
}
