using System.Net;
using System.Text.Json;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Tree;

/// <summary>Azure DevOps Wiki-compatible <c>.order</c> files (005 US5, contracts/order-file.md).</summary>
public sealed class OrderTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit(new Dictionary<string, string?>
        {
            ["index.md"] = "# Home\n",
            ["guides/alpha.md"] = "# Alpha\n",
            ["guides/beta.md"] = "# Beta\n",
            ["guides/gamma.md"] = "# Gamma\n",
            ["guides/sub/x.md"] = "# X\n",
            ["reference/.order"] = "zulu\napi\n",
            ["reference/api.md"] = "# API\n",
            ["reference/zulu.md"] = "# Zulu\n",
            ["plain/one.md"] = "# One\n",
        });
        _factory = new CopernicaFactory().AddSpace("wiki", _remote);
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    private async Task<List<string>> ChildrenAsync(HttpClient client, string folder)
    {
        var root = await client.GetFromJsonAsync<JsonElement>("/api/spaces/wiki/tree", Ct);
        var node = folder.Split('/', StringSplitOptions.RemoveEmptyEntries).Aggregate(root, (n, name) => n.GetProperty("children").EnumerateArray().Single(c => c.GetProperty("name").GetString() == name));
        return node.GetProperty("children").EnumerateArray().Select(c => c.GetProperty("name").GetString()!).ToList();
    }

    [Fact]
    public async Task Existing_order_files_order_the_tree()
    {
        var client = await _factory.SignInAsync();

        Assert.Equal(["zulu.md", "api.md"], await ChildrenAsync(client, "reference"));
        Assert.Equal(["sub", "alpha.md", "beta.md", "gamma.md"], await ChildrenAsync(client, "guides"));
    }

    [Fact]
    public async Task First_reorder_creates_an_order_file_listing_every_item_in_one_commit()
    {
        var client = await _factory.SignInAsync();
        var before = _remote.Log().Count;

        var response = await client.ReorderAsync("wiki", "guides", "gamma.md", before: "sub");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(before + 1, _remote.Log().Count);
        Assert.Equal("Reorder guides: move gamma.md before sub", _remote.Log()[0].Message);
        Assert.Equal("gamma\nsub\nalpha\nbeta\n", _remote.ReadFile("guides/.order"));
        Assert.Equal(["gamma.md", "sub", "alpha.md", "beta.md"], await ChildrenAsync(client, "guides"));
    }

    [Fact]
    public async Task Moving_to_the_end_and_no_op_reorders()
    {
        var client = await _factory.SignInAsync();

        Assert.Equal(HttpStatusCode.OK, (await client.ReorderAsync("wiki", "reference", "zulu.md", before: null)).StatusCode);
        Assert.Equal("api\nzulu\n", _remote.ReadFile("reference/.order"));
        var count = _remote.Log().Count;

        var again = await client.ReorderAsync("wiki", "reference", "zulu.md", before: null);

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(count, _remote.Log().Count);
        Assert.Equal(_remote.Tip().Sha, (await again.JsonAsync()).GetProperty("commitId").GetString());
    }

    [Theory]
    [InlineData("missing.md", null)]
    [InlineData("api.md", "missing")]
    public async Task Unknown_items_are_a_tree_conflict(string item, string? before)
    {
        var client = await _factory.SignInAsync();

        var response = await client.ReorderAsync("wiki", "reference", item, before);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("tree-changed", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Pages_added_meanwhile_survive_a_reorder()
    {
        var client = await _factory.SignInAsync();
        var @base = await client.TreeCommitAsync("wiki");
        _remote.Commit(new Dictionary<string, string?> { ["reference/new.md"] = "# New\n", ["reference/.order"] = "zulu\napi\nnew\n" });

        var response = await client.ReorderAsync("wiki", "reference", "api.md", before: "zulu.md", @base: @base);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("api\nzulu\nnew\n", _remote.ReadFile("reference/.order"));
    }

    [Fact]
    public async Task Creating_pages_appends_them_and_new_folders_to_existing_order_files()
    {
        var client = await _factory.SignInAsync();

        await client.SaveAsync("wiki", "reference/beta.md", null, "# Beta\n", "Add beta");
        await client.SaveAsync("wiki", "reference/deep/er/page.md", null, "# Page\n", "Add deep page");
        await client.SaveAsync("wiki", "plain/two.md", null, "# Two\n", "Add two");

        Assert.Equal("zulu\napi\nbeta\ndeep\n", _remote.ReadFile("reference/.order"));
        Assert.Null(_remote.ReadFile("reference/deep/.order"));
        Assert.Null(_remote.ReadFile("plain/.order"));
    }

    [Fact]
    public async Task Deleting_renaming_and_moving_keep_order_files_consistent_in_the_same_commit()
    {
        var client = await _factory.SignInAsync();

        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "reference/zulu.md", "reference/yankee.md")).StatusCode);
        Assert.Equal("yankee\napi\n", _remote.ReadFile("reference/.order"));
        Assert.Contains("reference/.order", _remote.TipChanges());

        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "reference/yankee.md", "plain/yankee.md")).StatusCode);
        Assert.Equal("api\n", _remote.ReadFile("reference/.order"));
        Assert.Null(_remote.ReadFile("plain/.order"));

        await client.ReorderAsync("wiki", "plain", "yankee.md", before: "one.md");
        Assert.Equal("yankee\none\n", _remote.ReadFile("plain/.order"));
        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "guides/alpha.md", "plain/alpha.md")).StatusCode);
        Assert.Equal("yankee\none\nalpha\n", _remote.ReadFile("plain/.order"));

        var page = await client.GetPageAsync("wiki", "plain/one.md");
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("wiki", "plain/one.md", WikiApi.BaseOf(page))).StatusCode);
        Assert.Equal("yankee\nalpha\n", _remote.ReadFile("plain/.order"));
    }

    [Fact]
    public async Task Folder_moves_and_deletes_update_the_parent_order_and_carry_their_own()
    {
        var client = await _factory.SignInAsync();
        await client.ReorderAsync("wiki", "", "reference", before: "guides");
        Assert.Equal("reference\nguides\nplain\nindex\n", _remote.ReadFile(".order"));

        Assert.Equal(HttpStatusCode.OK, (await client.MoveAsync("wiki", "reference", "guides/reference", kind: "folder")).StatusCode);
        Assert.Equal("guides\nplain\nindex\n", _remote.ReadFile(".order"));
        Assert.Equal("zulu\napi\n", _remote.ReadFile("guides/reference/.order"));

        Assert.Equal(HttpStatusCode.OK, (await client.DeleteFolderAsync("wiki", "plain", expectedPageCount: 1)).StatusCode);
        Assert.Equal("guides\nindex\n", _remote.ReadFile(".order"));
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
