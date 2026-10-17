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

    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    public static async Task<string> ProblemTypeAsync(this HttpResponseMessage response) =>
        (await response.JsonAsync()).GetProperty("type").GetString()!.Split(':')[^1];
}
