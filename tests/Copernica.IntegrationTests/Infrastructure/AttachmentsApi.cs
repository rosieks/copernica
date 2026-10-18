using System.Net.Http.Headers;
using System.Text.Json;

namespace Copernica.IntegrationTests.Infrastructure;

/// <summary>Helpers for the image upload API (003 contracts/api.md).</summary>
public static class AttachmentsApi
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public static readonly byte[] Png = Convert.FromHexString(
        "89504E470D0A1A0A0000000D4948445200000001000000010806000000" +
        "1F15C4890000000D4944415478DA63F8CFC0F01F0005000201E2F2A0C70000000049454E44AE426082");

    public static Task<HttpResponseMessage> UploadAsync(this HttpClient client, string space, string page, byte[] bytes, string fileName = "image.png")
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(file, "file", fileName);
        return client.PostAsync($"/api/spaces/{space}/uploads?page={Uri.EscapeDataString(page)}", content, Ct);
    }

    public static async Task<JsonElement> UploadOkAsync(this HttpClient client, string space, string page, byte[]? bytes = null, string fileName = "image.png")
    {
        var response = await client.UploadAsync(space, page, bytes ?? Png, fileName);
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return await response.JsonAsync();
    }

    public static Task<HttpResponseMessage> SaveWithAsync(this HttpClient client, string space, string path, object? @base, string markdown, string message, params string[] attachments) =>
        client.PutAsJsonAsync($"/api/spaces/{space}/pages/{path}", new { @base, markdown, message, attachments }, Ct);

    public static async Task<string> RenderAsync(this HttpClient client, string space, string path, string markdown, params string[] attachments)
    {
        var response = await client.PostAsJsonAsync("/api/render", new { spaceId = space, path, markdown, attachments }, Ct);
        response.EnsureSuccessStatusCode();
        return (await response.JsonAsync()).GetProperty("html").GetString()!;
    }
}
