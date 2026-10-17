using System.Net;
using System.Text.Json;
using Copernica.Hosting;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Discussions;

public sealed class DiscussionTests : IAsyncLifetime
{
    private const string Page = "# Handbook\n\nThe onboarding checklist covers laptops and accounts.\n\nThe release process starts on Monday.\n";
    private const string PlainText = "Handbook\nThe onboarding checklist covers laptops and accounts.\nThe release process starts on Monday.\n";

    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;
    private string _commit = "";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _commit = _remote.Commit("index.md", Page);
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    private object AnchorFor(string exact, string? commit = null)
    {
        var start = PlainText.IndexOf(exact, StringComparison.Ordinal);
        return new
        {
            exact,
            prefix = PlainText[Math.Max(0, start - 32)..start],
            suffix = PlainText[(start + exact.Length)..Math.Min(PlainText.Length, start + exact.Length + 32)],
            start,
            end = start + exact.Length,
            commitId = commit ?? _commit,
        };
    }

    private static async Task<JsonElement> StartAsync(HttpClient client, object anchor, string body = "Is this still accurate?")
    {
        var response = await client.PostAsJsonAsync("/api/spaces/wiki/discussions", new { path = "index.md", anchor, body }, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.JsonAsync();
    }

    private static async Task<List<JsonElement>> ListAsync(HttpClient client, string state = "open") =>
        (await client.GetFromJsonAsync<JsonElement>($"/api/spaces/wiki/discussions?path=index.md&state={state}", Ct)).EnumerateArray().ToList();

    [Fact]
    public async Task Discussion_is_created_on_a_fragment_and_listed()
    {
        var alice = await _factory.SignInAsync("alice");

        var created = await StartAsync(alice, AnchorFor("release process"));
        var list = await ListAsync(alice);

        var discussion = Assert.Single(list);
        Assert.Equal(created.GetProperty("id").GetString(), discussion.GetProperty("id").GetString());
        Assert.Equal("release process", discussion.GetProperty("anchor").GetProperty("exact").GetString());
        Assert.Equal("anchored", discussion.GetProperty("anchorStatus").GetString());
        var comment = Assert.Single(discussion.GetProperty("comments").EnumerateArray());
        Assert.Equal("Alice Example", comment.GetProperty("author").GetProperty("displayName").GetString());
        Assert.Contains("Is this still accurate?", comment.GetProperty("html").GetString());
    }

    [Fact]
    public async Task Anchor_that_does_not_match_the_page_is_rejected()
    {
        var alice = await _factory.SignInAsync();
        var bad = new { exact = "not on the page", prefix = "", suffix = "", start = 0, end = 15, commitId = _commit };

        var response = await alice.PostAsJsonAsync("/api/spaces/wiki/discussions", new { path = "index.md", anchor = bad, body = "x" }, Ct);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("anchor-not-found", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Replies_are_ordered_and_only_authors_can_edit()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var discussion = await StartAsync(alice, AnchorFor("onboarding checklist"));
        var id = discussion.GetProperty("id").GetString();

        await bob.PostAsJsonAsync($"/api/discussions/{id}/comments", new { body = "Yes, updated last week." }, Ct);
        await alice.PostAsJsonAsync($"/api/discussions/{id}/comments", new { body = "Thanks!" }, Ct);
        var comments = (await ListAsync(alice))[0].GetProperty("comments").EnumerateArray().ToList();
        var bobComment = comments[1].GetProperty("id").GetString();

        var forbidden = await alice.PatchAsJsonAsync($"/api/discussions/{id}/comments/{bobComment}", new { body = "hijack" }, Ct);
        var edited = await bob.PatchAsJsonAsync($"/api/discussions/{id}/comments/{bobComment}", new { body = "Yes, updated yesterday." }, Ct);

        Assert.Equal(["Alice Example", "Bob Example", "Alice Example"], comments.Select(c => c.GetProperty("author").GetProperty("displayName").GetString()));
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal("not-comment-author", await forbidden.ProblemTypeAsync());
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.NotEqual(JsonValueKind.Null, (await edited.JsonAsync()).GetProperty("editedAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, comments[1].GetProperty("body").ValueKind);
        Assert.Equal("Is this still accurate?", comments[0].GetProperty("body").GetString());
    }

    [Fact]
    public async Task Deleting_comments_follows_the_soft_delete_rules()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var discussion = await StartAsync(alice, AnchorFor("onboarding checklist"));
        var id = discussion.GetProperty("id").GetString();
        var first = discussion.GetProperty("comments")[0].GetProperty("id").GetString();
        var reply = await (await bob.PostAsJsonAsync($"/api/discussions/{id}/comments", new { body = "Reply" }, Ct)).JsonAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await bob.DeleteAsync($"/api/discussions/{id}/comments/{first}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync($"/api/discussions/{id}/comments/{first}", Ct)).StatusCode);
        var afterFirst = (await ListAsync(alice))[0].GetProperty("comments").EnumerateArray().ToList();
        Assert.True(afterFirst[0].GetProperty("deleted").GetBoolean());
        Assert.Equal(JsonValueKind.Null, afterFirst[0].GetProperty("html").ValueKind);

        await bob.DeleteAsync($"/api/discussions/{id}/comments/{reply.GetProperty("id").GetString()}", Ct);

        Assert.Empty(await ListAsync(alice, "all"));
    }

    [Fact]
    public async Task Resolve_and_reopen()
    {
        var alice = await _factory.SignInAsync("alice");
        var bob = await _factory.SignInAsync("bob");
        var id = (await StartAsync(alice, AnchorFor("release process"))).GetProperty("id").GetString();

        var resolved = await (await bob.PutAsJsonAsync($"/api/discussions/{id}/state", new { state = "resolved" }, Ct)).JsonAsync();

        Assert.Equal("resolved", resolved.GetProperty("state").GetString());
        Assert.Equal("Bob Example", resolved.GetProperty("resolvedBy").GetProperty("displayName").GetString());
        Assert.Empty(await ListAsync(alice));
        Assert.Single(await ListAsync(alice, "resolved"));

        var reopened = await (await alice.PutAsJsonAsync($"/api/discussions/{id}/state", new { state = "open" }, Ct)).JsonAsync();

        Assert.Equal(JsonValueKind.Null, reopened.GetProperty("resolvedBy").ValueKind);
        Assert.Single(await ListAsync(alice));
    }

    [Fact]
    public async Task Discussion_follows_its_fragment_and_becomes_outdated_when_it_is_deleted()
    {
        var alice = await _factory.SignInAsync();
        await StartAsync(alice, AnchorFor("release process"));

        _remote.Commit("index.md", "# Handbook\n\nA new first paragraph.\n\n" + Page["# Handbook\n\n".Length..]);
        await _factory.SyncAsync();
        var moved = (await ListAsync(alice))[0];
        var page = await alice.GetPageAsync("wiki", "index.md");

        Assert.Equal("anchored", moved.GetProperty("anchorStatus").GetString());
        var start = moved.GetProperty("anchor").GetProperty("start").GetInt32();
        Assert.Equal(page.GetProperty("version").GetProperty("commitId").GetString(), moved.GetProperty("anchor").GetProperty("commitId").GetString());
        Assert.True(start > PlainText.IndexOf("release process", StringComparison.Ordinal));

        _remote.Commit("index.md", "# Handbook\n\nOnly onboarding is left.\n");
        await _factory.SyncAsync();
        var outdated = (await ListAsync(alice))[0];

        Assert.Equal("outdated", outdated.GetProperty("anchorStatus").GetString());
        Assert.Equal("release process", outdated.GetProperty("anchor").GetProperty("originalExact").GetString());
    }

    [Fact]
    public async Task Discussion_follows_a_page_renamed_outside_the_wiki()
    {
        var alice = await _factory.SignInAsync();
        await StartAsync(alice, AnchorFor("release process"));

        _remote.Commit(new Dictionary<string, string?> { ["index.md"] = null, ["handbook.md"] = Page }, "Rename");
        await _factory.SyncAsync();
        var renamed = await alice.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/discussions?path=handbook.md", Ct);

        var discussion = Assert.Single(renamed.EnumerateArray());
        Assert.Equal("handbook.md", discussion.GetProperty("path").GetString());
        Assert.Equal("anchored", discussion.GetProperty("anchorStatus").GetString());
    }

    [Fact]
    public async Task Discussions_are_hidden_from_users_who_cannot_read_the_space()
    {
        var alice = await _factory.SignInAsync("alice");
        var id = (await StartAsync(alice, AnchorFor("release process"))).GetProperty("id").GetString();
        _factory.Hosting.Set("bob", "wiki", RepositoryPermission.None);
        var bob = await _factory.SignInAsync("bob");

        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync("/api/spaces/wiki/discussions?path=index.md", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PostAsJsonAsync($"/api/discussions/{id}/comments", new { body = "x" }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/api/discussions/{id}/state", new { state = "resolved" }, Ct)).StatusCode);
    }

    [Fact]
    public async Task Discussions_never_touch_the_repository()
    {
        var alice = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var id = (await StartAsync(alice, AnchorFor("release process"), "Secret discussion text 4711")).GetProperty("id").GetString();
        await alice.PostAsJsonAsync($"/api/discussions/{id}/comments", new { body = "Another reply 4711" }, Ct);
        await alice.PutAsJsonAsync($"/api/discussions/{id}/state", new { state = "resolved" }, Ct);

        Assert.Equal(before, _remote.Log().Count);
        Assert.DoesNotContain("4711", _remote.ReadFile("index.md"));
    }

    [Fact]
    public async Task Comment_markdown_is_sanitized()
    {
        var alice = await _factory.SignInAsync();

        var discussion = await StartAsync(alice, AnchorFor("release process"), "<script>alert(1)</script>\n\n**bold**");

        var html = discussion.GetProperty("comments")[0].GetProperty("html").GetString();
        Assert.DoesNotContain("<script", html);
        Assert.Contains("<strong>bold</strong>", html);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Empty_comments_are_rejected(string body)
    {
        var alice = await _factory.SignInAsync();

        var response = await alice.PostAsJsonAsync("/api/spaces/wiki/discussions", new { path = "index.md", anchor = AnchorFor("release process"), body }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
