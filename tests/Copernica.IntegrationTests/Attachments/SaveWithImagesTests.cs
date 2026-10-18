using System.Net;
using Copernica.Data;
using Copernica.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Copernica.IntegrationTests.Attachments;

/// <summary>003 FR-006/FR-007/FR-009: images reach git only with the page, in the same single commit.</summary>
public sealed class SaveWithImagesTests : IAsyncLifetime
{
    private const string Original = "# Shared\n\nSection one.\n\nSection two.\n\nSection three.\n";

    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit("guides/shared.md", Original);
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Save_commits_the_page_and_only_the_referenced_images_in_one_commit()
    {
        var alice = await _factory.SignInAsync();
        var page = await alice.GetPageAsync("wiki", "guides/shared.md");
        var used = await alice.UploadOkAsync("wiki", "guides/shared.md", fileName: "used.png");
        var unused = await alice.UploadOkAsync("wiki", "guides/shared.md", fileName: "unused.png");
        var before = _remote.Log().Count;

        var markdown = Original + $"\n![Used]({used.GetProperty("link").GetString()})\n";
        var response = await alice.SaveWithAsync("wiki", "guides/shared.md", WikiApi.BaseOf(page), markdown, "Add screenshot",
            used.GetProperty("id").GetString()!, unused.GetProperty("id").GetString()!);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var log = _remote.Log();
        Assert.Equal(before + 1, log.Count);
        Assert.Equal(("Add screenshot", "Alice Example"), (log[0].Message, log[0].AuthorName));
        var usedPath = used.GetProperty("repositoryPath").GetString()!;
        Assert.Equal(new[] { "guides/shared.md", usedPath }.Order(StringComparer.Ordinal), _remote.TipChanges());
        Assert.Equal(AttachmentsApi.Png, _remote.ReadBytes(usedPath));
        Assert.Null(_remote.ReadBytes(unused.GetProperty("repositoryPath").GetString()!));
        Assert.Empty(await PendingIdsAsync());
    }

    [Fact]
    public async Task Images_of_other_users_or_other_pages_are_ignored()
    {
        var alice = await _factory.SignInAsync();
        var bob = await _factory.SignInAsync("bob");
        _remote.Commit("other.md", "# Other\n");
        await _factory.SyncAsync();
        var page = await alice.GetPageAsync("wiki", "guides/shared.md");
        var bobs = await bob.UploadOkAsync("wiki", "guides/shared.md");
        var otherPage = await alice.UploadOkAsync("wiki", "other.md");

        var markdown = Original + $"\n![b]({bobs.GetProperty("link").GetString()})\n![o](../{otherPage.GetProperty("repositoryPath").GetString()})\n";
        var response = await alice.SaveWithAsync("wiki", "guides/shared.md", WikiApi.BaseOf(page), markdown, "Try others",
            bobs.GetProperty("id").GetString()!, otherPage.GetProperty("id").GetString()!);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(["guides/shared.md"], _remote.TipChanges());
        Assert.Equal(2, (await PendingIdsAsync()).Count);
    }

    [Fact]
    public async Task Images_are_kept_through_a_conflict_and_saved_with_the_resolution()
    {
        var alice = await _factory.SignInAsync();
        var bob = await _factory.SignInAsync("bob");
        var page = await bob.GetPageAsync("wiki", "guides/shared.md");
        await alice.SaveAsync("wiki", "guides/shared.md", WikiApi.BaseOf(page), Original.Replace("Section two.", "Alice two."), "Alice");
        var image = await bob.UploadOkAsync("wiki", "guides/shared.md");
        var id = image.GetProperty("id").GetString()!;
        var mine = Original.Replace("Section two.", "Bob two.") + $"\n![x]({image.GetProperty("link").GetString()})\n";

        var conflict = await bob.SaveWithAsync("wiki", "guides/shared.md", WikiApi.BaseOf(page), mine, "Bob", id);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Contains(id, await PendingIdsAsync());

        var theirs = (await conflict.JsonAsync()).GetProperty("theirsVersion");
        var resolved = await bob.SaveWithAsync("wiki", "guides/shared.md", theirs, mine.Replace("Bob two.", "Alice and Bob two."), "Bob resolves", id);

        Assert.Equal(HttpStatusCode.OK, resolved.StatusCode);
        Assert.NotNull(_remote.ReadBytes(image.GetProperty("repositoryPath").GetString()!));
    }

    [Fact]
    public async Task Non_overlapping_concurrent_edit_is_merged_with_the_images()
    {
        var alice = await _factory.SignInAsync();
        var bob = await _factory.SignInAsync("bob");
        var page = await bob.GetPageAsync("wiki", "guides/shared.md");
        await alice.SaveAsync("wiki", "guides/shared.md", WikiApi.BaseOf(page), Original.Replace("Section one.", "Alice one."), "Alice");
        var image = await bob.UploadOkAsync("wiki", "guides/shared.md");

        var response = await bob.SaveWithAsync("wiki", "guides/shared.md", WikiApi.BaseOf(page),
            Original.Replace("Section three.", $"Section three.\n\n![x]({image.GetProperty("link").GetString()})"), "Bob", image.GetProperty("id").GetString()!);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("Alice one.", _remote.ReadFile("guides/shared.md"));
        Assert.NotNull(_remote.ReadBytes(image.GetProperty("repositoryPath").GetString()!));
        Assert.Equal(1, _remote.Tip().ParentCount);
    }

    [Fact]
    public async Task An_existing_file_is_never_overwritten()
    {
        var alice = await _factory.SignInAsync();
        var page = await alice.GetPageAsync("wiki", "guides/shared.md");
        var image = await alice.UploadOkAsync("wiki", "guides/shared.md");
        var path = image.GetProperty("repositoryPath").GetString()!;
        _remote.Commit(path, "already there");
        await _factory.SyncAsync();
        var before = _remote.Log().Count;

        var response = await alice.SaveWithAsync("wiki", "guides/shared.md", WikiApi.BaseOf(page),
            Original + $"\n![x]({image.GetProperty("link").GetString()})\n", "Add", image.GetProperty("id").GetString()!);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("attachment-exists", await response.ProblemTypeAsync());
        Assert.Equal(before, _remote.Log().Count);
        Assert.Equal("already there", _remote.ReadFile(path));
        Assert.Contains(image.GetProperty("id").GetString()!, await PendingIdsAsync());
    }

    [Fact]
    public async Task Preview_shows_pending_images_from_the_upload_url()
    {
        var alice = await _factory.SignInAsync();
        var image = await alice.UploadOkAsync("wiki", "guides/shared.md");
        var id = image.GetProperty("id").GetString()!;

        var html = await alice.RenderAsync("wiki", "guides/shared.md", $"![Shot]({image.GetProperty("link").GetString()})", id);
        var withoutIds = await alice.RenderAsync("wiki", "guides/shared.md", $"![Shot]({image.GetProperty("link").GetString()})");

        Assert.Contains($"src=\"/api/uploads/{id}\"", html);
        Assert.DoesNotContain("/api/uploads/", withoutIds);
    }

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
