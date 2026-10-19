using System.Net;
using System.Text.Json;

namespace Copernica.IntegrationTests.Infrastructure;

/// <summary>Small typed helpers over the HTTP API used by the editing tests.</summary>
public static class WikiApi
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public static async Task<JsonElement> GetPageAsync(this HttpClient client, string space, string path)
    {
        var response = await client.GetAsync($"/api/spaces/{space}/pages/{path}?source=true", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }

    public static object BaseOf(JsonElement page) => new
    {
        commitId = page.GetProperty("version").GetProperty("commitId").GetString(),
        blobId = page.GetProperty("version").GetProperty("blobId").GetString(),
    };

    public static Task<HttpResponseMessage> SaveAsync(this HttpClient client, string space, string path, object? @base, string markdown, string message = "Edit page") =>
        client.PutAsJsonAsync($"/api/spaces/{space}/pages/{path}", new { @base, markdown, message }, Ct);

    public static Task<HttpResponseMessage> DeleteAsync(this HttpClient client, string space, string path, object? @base, string message = "Delete page") =>
        client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, $"/api/spaces/{space}/pages/{path}")
        {
            Content = JsonContent.Create(new { @base, message }),
        }, Ct);

    /// <summary>The commit the tree is built from (<c>X-Copernica-Commit</c>): the base of tree operations.</summary>
    public static async Task<string> TreeCommitAsync(this HttpClient client, string space)
    {
        var response = await client.GetAsync($"/api/spaces/{space}/tree", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return response.Headers.GetValues("X-Copernica-Commit").Single();
    }

    public static async Task<HttpResponseMessage> MoveAsync(
        this HttpClient client, string space, string from, string to, string kind = "page", string? message = "Move", string? retitle = null, bool dryRun = false, string? @base = null) =>
        await client.PostAsJsonAsync($"/api/spaces/{space}/tree/move", new
        {
            @base = @base ?? await client.TreeCommitAsync(space),
            kind,
            from,
            to,
            retitle,
            message,
            dryRun,
        }, Ct);

    public static async Task<HttpResponseMessage> DeleteFolderAsync(
        this HttpClient client, string space, string folder, int? expectedPageCount, string? message = "Delete folder", bool dryRun = false, string? @base = null) =>
        await client.PostAsJsonAsync($"/api/spaces/{space}/tree/delete", new
        {
            @base = @base ?? await client.TreeCommitAsync(space),
            folder,
            expectedPageCount,
            message,
            dryRun,
        }, Ct);

    public static async Task<HttpResponseMessage> ReorderAsync(
        this HttpClient client, string space, string folder, string item, string? before, string? message = null, string? @base = null) =>
        await client.PostAsJsonAsync($"/api/spaces/{space}/tree/reorder", new
        {
            @base = @base ?? await client.TreeCommitAsync(space),
            folder,
            item,
            before,
            message,
        }, Ct);

    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    public static async Task<string> ProblemTypeAsync(this HttpResponseMessage response) =>
        (await response.JsonAsync()).GetProperty("type").GetString()!.Split(':')[^1];
}
