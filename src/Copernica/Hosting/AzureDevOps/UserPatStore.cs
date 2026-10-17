using System.Text;
using Copernica.Auth;
using Copernica.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace Copernica.Hosting.AzureDevOps;

/// <summary>
/// Personal access tokens that users register for Azure DevOps Server (research.md R3).
/// Stored encrypted in <c>user_tokens</c> under <c>pat:{userId}</c>; never returned by any API.
/// </summary>
public sealed class UserPatStore(IServiceScopeFactory scopes, IDataProtectionProvider protection, TimeProvider time)
{
    private readonly EncryptedTokenCache _cache = new(scopes, protection, time);

    public static string KeyFor(string userId) => $"pat:{userId}";

    public async Task<string?> GetAsync(string userId, CancellationToken cancellationToken) =>
        await _cache.GetAsync(KeyFor(userId), cancellationToken) is { } bytes ? Encoding.UTF8.GetString(bytes) : null;

    public Task SetAsync(string userId, string token, CancellationToken cancellationToken) =>
        _cache.SetAsync(KeyFor(userId), Encoding.UTF8.GetBytes(token), new DistributedCacheEntryOptions(), cancellationToken);

    public Task RemoveAsync(string userId, CancellationToken cancellationToken) =>
        _cache.RemoveAsync(KeyFor(userId), cancellationToken);

    public async Task<DateTime?> RegisteredAtAsync(string userId, CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        var key = KeyFor(userId);
        return await db.DelegatedTokens.Where(t => t.CacheKey == key).Select(t => (DateTime?)t.UpdatedAt).FirstOrDefaultAsync(cancellationToken);
    }
}

/// <summary>The user has not registered a personal access token yet (Azure DevOps Server).</summary>
public sealed class PatRequiredException() : Exception("Register a personal access token on your profile page to work with Azure DevOps Server.");

/// <summary>Uses the user's own personal access token (Basic auth) against Azure DevOps Server.</summary>
public sealed class PatUserCredentials(UserPatStore store) : IAzureDevOpsUserCredentials
{
    public async Task<GitCredentials> GetAsync(CurrentUser user, CancellationToken cancellationToken) =>
        await store.GetAsync(user.Id, cancellationToken) is { } pat
            ? GitCredentials.Basic(user.Id, pat)
            : throw new PatRequiredException();
}

/// <summary>
/// Register or remove the caller's personal access token. Unlike Entra tokens, a PAT is a
/// user-managed secret, so it is kept across sign-outs until the user removes it.
/// </summary>
public static class UserTokenEndpoints
{
    public const int MaxTokenLength = 1024;

    public sealed record TokenRequest(string? Token);

    public static RouteGroupBuilder MapUserTokenEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/me/tokens/azure-devops", async (HttpContext context, UserPatStore store) =>
        {
            var registeredAt = await store.RegisteredAtAsync(context.GetCurrentUser().Id, context.RequestAborted);
            return Results.Ok(new { registered = registeredAt is not null, updatedAt = registeredAt });
        });

        api.MapPut("/me/tokens/azure-devops", async (TokenRequest request, HttpContext context, UserPatStore store, PermissionService permissions) =>
        {
            var token = request.Token?.Trim();
            if (string.IsNullOrEmpty(token) || token.Length > MaxTokenLength || token.Any(char.IsWhiteSpace))
            {
                return ProblemTypes.BadRequest("Enter a valid personal access token.");
            }

            await store.SetAsync(context.GetCurrentUser().Id, token, context.RequestAborted);
            permissions.InvalidateAll(context.GetCurrentUser());
            return Results.NoContent();
        });

        api.MapDelete("/me/tokens/azure-devops", async (HttpContext context, UserPatStore store, PermissionService permissions) =>
        {
            await store.RemoveAsync(context.GetCurrentUser().Id, context.RequestAborted);
            permissions.InvalidateAll(context.GetCurrentUser());
            return Results.NoContent();
        });

        return api;
    }
}
