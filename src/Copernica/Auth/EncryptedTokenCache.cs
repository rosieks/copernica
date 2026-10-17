using Copernica.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace Copernica.Auth;

/// <summary>
/// <see cref="IDistributedCache"/> over the <c>user_tokens</c> table, used by Microsoft.Identity.Web
/// as its token cache. Values are encrypted with Data Protection before they reach the database.
/// </summary>
public sealed class EncryptedTokenCache(IServiceScopeFactory scopes, IDataProtectionProvider protection, TimeProvider time) : IDistributedCache
{
    public const string Purpose = "Copernica.UserTokens";

    private readonly IDataProtector _protector = protection.CreateProtector(Purpose);

    public byte[]? Get(string key) => GetAsync(key).GetAwaiter().GetResult();

    public async Task<byte[]?> GetAsync(string key, CancellationToken token = default)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        var row = await db.DelegatedTokens.AsNoTracking().FirstOrDefaultAsync(t => t.CacheKey == key, token);
        if (row is null)
        {
            return null;
        }

        if (row.ExpiresAt is { } expires && expires <= time.GetUtcNow().UtcDateTime)
        {
            await RemoveAsync(key, token);
            return null;
        }

        try
        {
            return _protector.Unprotect(row.Value);
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            // Keys rotated or lost: treat as a cache miss; the user signs in again.
            return null;
        }
    }

    public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => SetAsync(key, value, options).GetAwaiter().GetResult();

    public async Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default)
    {
        var now = time.GetUtcNow();
        DateTime? expires = options.AbsoluteExpiration?.UtcDateTime
            ?? (options.AbsoluteExpirationRelativeToNow is { } relative ? (now + relative).UtcDateTime : (DateTime?)null)
            ?? (options.SlidingExpiration is { } sliding ? (now + sliding).UtcDateTime : (DateTime?)null);
        var encrypted = _protector.Protect(value);

        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        var nowUtc = now.UtcDateTime;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO user_tokens ("CacheKey", "Value", "ExpiresAt", "UpdatedAt")
            VALUES ({key}, {encrypted}, {expires}, {nowUtc})
            ON CONFLICT ("CacheKey") DO UPDATE SET
                "Value" = excluded."Value",
                "ExpiresAt" = excluded."ExpiresAt",
                "UpdatedAt" = excluded."UpdatedAt"
            """,
            token);
    }

    public void Refresh(string key)
    {
    }

    public Task RefreshAsync(string key, CancellationToken token = default) => Task.CompletedTask;

    public void Remove(string key) => RemoveAsync(key).GetAwaiter().GetResult();

    public async Task RemoveAsync(string key, CancellationToken token = default)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        await db.DelegatedTokens.Where(t => t.CacheKey == key).ExecuteDeleteAsync(token);
    }
}
