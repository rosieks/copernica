using System.Net;
using Copernica.IntegrationTests.Infrastructure;
using LibGit2Sharp;

namespace Copernica.IntegrationTests.Editing;

/// <summary>002 FR-007: a merged save names the authors of the changes it was merged with.</summary>
public sealed class MergedAuthorsTests : IAsyncLifetime
{
    private const string Original = "# Shared\n\nSection one.\n\nSection two.\n\nSection three.\n";

    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit("shared.md", Original);
        _remote.Commit("other.md", "# Other\n");
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Merged_save_lists_the_other_authors_oldest_first()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var @base = WikiApi.BaseOf(await bob.GetPageAsync("wiki", "shared.md"));

        await alice.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section one.", "Section ONE."), "Alice edit");
        _remote.Commit(
            new Dictionary<string, string?> { ["shared.md"] = Original.Replace("Section one.", "Section ONE.").Replace("Section two.", "Section TWO.") },
            "Outside edit",
            new Signature("Carol Outside", "carol@example.test", DateTimeOffset.UtcNow));
        await _factory.SyncAsync();

        var response = await bob.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section three.", "Section THREE."), "Bob edit");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.JsonAsync();
        Assert.True(result.GetProperty("merged").GetBoolean());
        Assert.Equal(["Alice Example", "Carol Outside"], result.GetProperty("mergedAuthors").EnumerateArray().Select(a => a.GetString()));
    }

    [Fact]
    public async Task Repeated_author_is_listed_once()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var @base = WikiApi.BaseOf(await bob.GetPageAsync("wiki", "shared.md"));

        await alice.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section one.", "One."), "Alice 1");
        var second = WikiApi.BaseOf(await alice.GetPageAsync("wiki", "shared.md"));
        await alice.SaveAsync("wiki", "shared.md", second, Original.Replace("Section one.", "One!"), "Alice 2");

        var response = await bob.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section three.", "Three."), "Bob edit");

        var result = await response.JsonAsync();
        Assert.Equal(["Alice Example"], result.GetProperty("mergedAuthors").EnumerateArray().Select(a => a.GetString()));
    }

    [Fact]
    public async Task Save_without_concurrent_changes_to_the_page_has_no_merged_authors()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var @base = WikiApi.BaseOf(await bob.GetPageAsync("wiki", "shared.md"));

        // A change to another page moves the branch but does not touch this page.
        var other = WikiApi.BaseOf(await alice.GetPageAsync("wiki", "other.md"));
        await alice.SaveAsync("wiki", "other.md", other, "# Other\n\nEdited.\n", "Alice edits other");

        var response = await bob.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section three.", "Three."), "Bob edit");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.JsonAsync();
        Assert.Empty(result.GetProperty("mergedAuthors").EnumerateArray());
    }

    [Fact]
    public async Task Plain_save_has_empty_merged_authors()
    {
        var alice = await _factory.SignInAsync("alice");
        var @base = WikiApi.BaseOf(await alice.GetPageAsync("wiki", "shared.md"));

        var result = await (await alice.SaveAsync("wiki", "shared.md", @base, Original + "\nMore.\n", "Alice edit")).JsonAsync();

        Assert.False(result.GetProperty("merged").GetBoolean());
        Assert.Empty(result.GetProperty("mergedAuthors").EnumerateArray());
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
