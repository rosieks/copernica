using System.Text;
using Copernica.Auth;
using Copernica.Data;
using Copernica.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;

namespace Copernica.IntegrationTests.Auth;

/// <summary>Delegated tokens are stored only encrypted (task T053, Constitution III).</summary>
public sealed class EncryptedTokenCacheTests : IDisposable
{
    private readonly CopernicaFactory _factory = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private EncryptedTokenCache CreateCache() => new(
        _factory.Services.GetRequiredService<IServiceScopeFactory>(),
        _factory.Services.GetRequiredService<IDataProtectionProvider>(),
        TimeProvider.System);

    private async Task<byte[]> RawAsync(string key)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        return (await db.DelegatedTokens.SingleAsync(t => t.CacheKey == key, Ct)).Value;
    }

    [Fact]
    public async Task Tokens_round_trip_but_are_never_stored_in_plain_text()
    {
        var cache = CreateCache();
        var secret = Encoding.UTF8.GetBytes("eyJ0eXAiOiJKV1QiLCJhbGciOi.secret-access-token");

        await cache.SetAsync("account-1", secret, new DistributedCacheEntryOptions(), Ct);
        var stored = await RawAsync("account-1");

        Assert.Equal(secret, await cache.GetAsync("account-1", Ct));
        Assert.DoesNotContain("secret-access-token", Encoding.UTF8.GetString(stored));
        Assert.NotEqual(secret, stored);
    }

    [Fact]
    public async Task Removed_and_expired_entries_are_gone()
    {
        var cache = CreateCache();
        await cache.SetAsync("a", [1, 2, 3], new DistributedCacheEntryOptions(), Ct);
        await cache.SetAsync("b", [4, 5, 6], new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMilliseconds(1) }, Ct);
        await Task.Delay(50, Ct);

        await cache.RemoveAsync("a", Ct);

        Assert.Null(await cache.GetAsync("a", Ct));
        Assert.Null(await cache.GetAsync("b", Ct));
    }

    [Fact]
    public async Task Overwriting_an_entry_keeps_one_row()
    {
        var cache = CreateCache();

        await cache.SetAsync("account", [1], new DistributedCacheEntryOptions(), Ct);
        await cache.SetAsync("account", [2], new DistributedCacheEntryOptions(), Ct);

        Assert.Equal([2], await cache.GetAsync("account", Ct));
    }

    public void Dispose() => _factory.Dispose();
}
