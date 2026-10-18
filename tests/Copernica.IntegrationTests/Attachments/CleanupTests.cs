using Copernica.Attachments;
using Copernica.Data;
using Copernica.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Copernica.IntegrationTests.Attachments;

/// <summary>003 FR-008 / SC-004: images of abandoned edits are removed after 24 hours without use.</summary>
public sealed class CleanupTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private readonly ManualTimeProvider _clock = new();
    private CopernicaFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit("a.md", "# A\n");
        _factory = new CopernicaFactory().AddSpace("wiki", _remote).ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_clock);
        });
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Pending_images_unused_for_24_hours_are_removed_with_their_files()
    {
        var alice = await _factory.SignInAsync();
        var old = (await alice.UploadOkAsync("wiki", "a.md")).GetProperty("id").GetString()!;
        _clock.Advance(TimeSpan.FromHours(2));
        var recent = (await alice.UploadOkAsync("wiki", "a.md")).GetProperty("id").GetString()!;

        _clock.Advance(TimeSpan.FromHours(23));
        await RunCleanupAsync();

        var ids = await PendingIdsAsync();
        Assert.DoesNotContain(old, ids);
        Assert.Contains(recent, ids);
        Assert.False(File.Exists(PendingFile(old)));
        Assert.True(File.Exists(PendingFile(recent)));
    }

    [Fact]
    public async Task Using_an_image_in_the_preview_keeps_it_alive()
    {
        var alice = await _factory.SignInAsync();
        var upload = await alice.UploadOkAsync("wiki", "a.md");
        var id = upload.GetProperty("id").GetString()!;

        _clock.Advance(TimeSpan.FromHours(20));
        // The sign-in session follows the same clock; sign in again as a returning user would.
        alice = await _factory.SignInAsync();
        await alice.RenderAsync("wiki", "a.md", $"![x]({upload.GetProperty("link").GetString()})", id);
        _clock.Advance(TimeSpan.FromHours(20));
        await RunCleanupAsync();

        Assert.Contains(id, await PendingIdsAsync());
    }

    [Fact]
    public async Task Old_files_without_a_row_are_removed()
    {
        var folder = PendingImageStore.PendingFolder(_factory.DataDirectory);
        Directory.CreateDirectory(folder);
        var orphan = Path.Combine(folder, new string('a', 32));
        await File.WriteAllBytesAsync(orphan, [1, 2, 3], TestContext.Current.CancellationToken);
        File.SetLastWriteTimeUtc(orphan, _clock.GetUtcNow().UtcDateTime.AddHours(-25));

        await RunCleanupAsync();

        Assert.False(File.Exists(orphan));
    }

    private string PendingFile(string id) => Path.Combine(PendingImageStore.PendingFolder(_factory.DataDirectory), id);

    private Task RunCleanupAsync() =>
        _factory.Services.GetServices<Microsoft.Extensions.Hosting.IHostedService>().OfType<PendingImageCleanup>().Single().RunOnceAsync(CancellationToken.None);

    private async Task<List<string>> PendingIdsAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        return await db.PendingImages.Select(p => p.Id).ToListAsync();
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
