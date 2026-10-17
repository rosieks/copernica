using System.Net;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Editing;

/// <summary>US3: concurrent edits never overwrite each other (FR-015..FR-017, SC-004).</summary>
public sealed class ConcurrencyTests : IAsyncLifetime
{
    private const string Original = "# Shared\n\nSection one.\n\nSection two.\n\nSection three.\n";

    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit("shared.md", Original);
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Non_overlapping_edits_are_merged()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var page = await alice.GetPageAsync("wiki", "shared.md");
        var @base = WikiApi.BaseOf(page);

        var first = await alice.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section one.", "Section ONE by Alice."), "Alice edit");
        var second = await bob.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section three.", "Section THREE by Bob."), "Bob edit");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.True((await second.JsonAsync()).GetProperty("merged").GetBoolean());
        var content = _remote.ReadFile("shared.md")!;
        Assert.Contains("Section ONE by Alice.", content);
        Assert.Contains("Section THREE by Bob.", content);

        var log = _remote.Log();
        Assert.Equal(("Bob edit", "Bob Example"), (log[0].Message, log[0].AuthorName));
        Assert.Equal("Alice edit", log[1].Message);
        Assert.Equal(1, _remote.Tip().ParentCount);
    }

    [Fact]
    public async Task Overlapping_edits_return_a_conflict_and_push_nothing()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var page = await alice.GetPageAsync("wiki", "shared.md");
        var @base = WikiApi.BaseOf(page);

        await alice.SaveAsync("wiki", "shared.md", @base, Original.Replace("Section two.", "Alice's section two."), "Alice edit");
        var tipAfterAlice = _remote.Tip().Sha;
        var mine = Original.Replace("Section two.", "Bob's section two.");
        var response = await bob.SaveAsync("wiki", "shared.md", @base, mine, "Bob edit");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.EndsWith("edit-conflict", problem.GetProperty("type").GetString());
        Assert.Equal(Original, problem.GetProperty("baseSource").GetString());
        Assert.Contains("Alice's section two.", problem.GetProperty("theirsSource").GetString());
        Assert.Equal(mine, problem.GetProperty("mineSource").GetString());
        Assert.Equal(tipAfterAlice, problem.GetProperty("theirsVersion").GetProperty("commitId").GetString());
        Assert.Equal(["Alice Example"], problem.GetProperty("theirsAuthors").EnumerateArray().Select(a => a.GetString()));
        Assert.Equal(tipAfterAlice, _remote.Tip().Sha);
    }

    [Fact]
    public async Task Resolving_a_conflict_saves_against_the_new_version()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var page = await alice.GetPageAsync("wiki", "shared.md");
        await alice.SaveAsync("wiki", "shared.md", WikiApi.BaseOf(page), Original.Replace("Section two.", "A."), "Alice edit");
        var conflict = await (await bob.SaveAsync("wiki", "shared.md", WikiApi.BaseOf(page), Original.Replace("Section two.", "B."), "Bob edit")).JsonAsync();

        var resolved = Original.Replace("Section two.", "A and B.");
        var response = await bob.SaveAsync("wiki", "shared.md", conflict.GetProperty("theirsVersion"), resolved, "Bob resolves");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(resolved, _remote.ReadFile("shared.md"));
    }

    [Fact]
    public async Task Commit_pushed_outside_the_wiki_is_detected()
    {
        var alice = await _factory.SignInAsync("alice");
        var page = await alice.GetPageAsync("wiki", "shared.md");
        _remote.Commit("shared.md", Original.Replace("Section two.", "Changed outside."), "Outside edit");

        var response = await alice.SaveAsync("wiki", "shared.md", WikiApi.BaseOf(page), Original.Replace("Section two.", "Changed in wiki."));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(["Outside Author"], (await response.JsonAsync()).GetProperty("theirsAuthors").EnumerateArray().Select(a => a.GetString()));
    }

    [Fact]
    public async Task Change_to_another_file_outside_the_wiki_merges_cleanly()
    {
        var alice = await _factory.SignInAsync("alice");
        var page = await alice.GetPageAsync("wiki", "shared.md");
        _remote.Commit("other.md", "# Other\n", "Outside edit");

        var response = await alice.SaveAsync("wiki", "shared.md", WikiApi.BaseOf(page), Original + "\nMore.\n");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True((await response.JsonAsync()).GetProperty("merged").GetBoolean());
        Assert.Equal("# Other\n", _remote.ReadFile("other.md"));
    }

    [Fact]
    public async Task Deleting_a_page_changed_since_base_is_a_conflict()
    {
        var alice = await _factory.SignInAsync("alice");
        var page = await alice.GetPageAsync("wiki", "shared.md");
        _remote.Commit("shared.md", Original + "\nNew text.\n", "Outside edit");

        var response = await alice.DeleteAsync("wiki", "shared.md", WikiApi.BaseOf(page));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.NotNull(_remote.ReadFile("shared.md"));
    }

    [Fact]
    public async Task Parallel_saves_never_lose_a_change()
    {
        var clients = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => _factory.SignInAsync(i % 2 == 0 ? "alice" : "bob")));

        // Six simultaneous saves race for the same branch; each must end up in the history.
        var responses = await Task.WhenAll(clients.Select((c, i) =>
            c.SaveAsync("wiki", $"page-{i}.md", null, $"# Page {i}\n", $"Create {i}")));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        for (var i = 0; i < clients.Length; i++)
        {
            Assert.Equal($"# Page {i}\n", _remote.ReadFile($"page-{i}.md"));
        }

        Assert.Equal(Original, _remote.ReadFile("shared.md"));
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
