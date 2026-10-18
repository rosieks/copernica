using System.Net;
using System.Text;
using Copernica.Hosting;
using Copernica.IntegrationTests.Infrastructure;

namespace Copernica.IntegrationTests.Attachments;

/// <summary>003: uploading pending images (contracts/api.md §1–2, FR-003, FR-010, FR-011, FR-014).</summary>
public sealed class UploadTests : IAsyncLifetime
{
    private readonly TestRemote _remote = new();
    private CopernicaFactory _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _remote.Commit("guides/a.md", "# A\n");
        _factory = new CopernicaFactory()
            .AddSpace("wiki", _remote)
            .AddSpace("broken", null)
            .Set("Copernica:Spaces:1:Attachments:Path", "../outside")
            .Set("Copernica:Attachments:MaxBytes", "1048576")
            .Set("Copernica:Attachments:MaxPendingBytesPerUser", "2097152");
        _ = _factory.Server;
        await _factory.SyncAsync();
    }

    [Fact]
    public async Task Upload_returns_the_future_path_and_a_relative_link()
    {
        var alice = await _factory.SignInAsync();

        var upload = await alice.UploadOkAsync("wiki", "guides/a.md", fileName: "image.png");

        Assert.Matches("^\\.attachments/image-[a-z2-7]{8}\\.png$", upload.GetProperty("repositoryPath").GetString());
        Assert.StartsWith("../.attachments/image-", upload.GetProperty("link").GetString());
        Assert.Equal("image/png", upload.GetProperty("contentType").GetString());
    }

    [Fact]
    public async Task Only_the_owner_can_read_a_pending_image()
    {
        var alice = await _factory.SignInAsync();
        var bob = await _factory.SignInAsync("bob");
        var preview = (await alice.UploadOkAsync("wiki", "guides/a.md")).GetProperty("previewUrl").GetString()!;

        var mine = await alice.GetAsync(preview, Ct);
        var theirs = await bob.GetAsync(preview, Ct);

        Assert.Equal(HttpStatusCode.OK, mine.StatusCode);
        Assert.Equal(AttachmentsApi.Png, await mine.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal("nosniff", mine.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Contains("no-store", mine.Headers.CacheControl!.ToString());
        Assert.Equal(HttpStatusCode.NotFound, theirs.StatusCode);
    }

    [Fact]
    public async Task Svg_preview_is_sandboxed()
    {
        var alice = await _factory.SignInAsync();
        var svg = Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
        var preview = (await alice.UploadOkAsync("wiki", "guides/a.md", svg, "d.svg")).GetProperty("previewUrl").GetString()!;

        var response = await alice.GetAsync(preview, Ct);

        Assert.Equal("image/svg+xml", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("sandbox", response.Headers.GetValues("Content-Security-Policy").Single());
    }

    [Fact]
    public async Task Read_only_users_cannot_upload()
    {
        _factory.Hosting.Set("bob", "wiki", new RepositoryPermission(CanRead: true, CanWrite: false));
        var bob = await _factory.SignInAsync("bob");

        var response = await bob.UploadAsync("wiki", "guides/a.md", AttachmentsApi.Png);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("fake.png", "4D5A900003000000")]
    [InlineData("notes.txt", "4E6F7420616E20696D616765")]
    public async Task Files_that_are_not_images_are_rejected(string name, string hex)
    {
        var alice = await _factory.SignInAsync();

        var response = await alice.UploadAsync("wiki", "guides/a.md", Convert.FromHexString(hex), name);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Equal("unsupported-image", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task Images_over_the_limit_are_rejected()
    {
        var alice = await _factory.SignInAsync();
        var big = new byte[1048576 + 10];
        AttachmentsApi.Png.CopyTo(big, 0);

        var response = await alice.UploadAsync("wiki", "guides/a.md", big);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal("attachment-too-large", await response.ProblemTypeAsync());
    }

    [Fact]
    public async Task The_pending_quota_per_user_is_enforced()
    {
        var alice = await _factory.SignInAsync();
        var almostOneMb = new byte[1000000];
        AttachmentsApi.Png.CopyTo(almostOneMb, 0);

        await alice.UploadOkAsync("wiki", "guides/a.md", almostOneMb);
        await alice.UploadOkAsync("wiki", "guides/a.md", almostOneMb);
        var third = await alice.UploadAsync("wiki", "guides/a.md", almostOneMb);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, third.StatusCode);
    }

    [Fact]
    public async Task Upload_without_the_antiforgery_header_is_rejected()
    {
        await _factory.SignInAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/spaces/wiki/uploads?page=guides/a.md")
        {
            Content = new MultipartFormDataContent { { new ByteArrayContent(AttachmentsApi.Png), "file", "a.png" } },
        };
        request.Headers.Add("X-Skip-Antiforgery", "1");

        var response = await (await _factory.SignInAsync()).SendAsync(request, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_space_with_an_invalid_location_is_unavailable_and_others_work()
    {
        var alice = await _factory.SignInAsync();

        var spaces = await (await alice.GetAsync("/api/spaces", Ct)).JsonAsync();
        var broken = spaces.EnumerateArray().Single(s => s.GetProperty("id").GetString() == "broken");
        var upload = await alice.UploadAsync("wiki", "guides/a.md", AttachmentsApi.Png);

        Assert.Equal("unavailable", broken.GetProperty("state").GetString());
        Assert.Contains("Attachments:Path", broken.GetProperty("message").GetString());
        Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
    }

    [Fact]
    public async Task Me_reports_the_upload_limits()
    {
        var alice = await _factory.SignInAsync();

        var me = await (await alice.GetAsync("/api/me", Ct)).JsonAsync();

        Assert.Equal(1048576, me.GetProperty("uploads").GetProperty("maxBytes").GetInt64());
        Assert.Contains("image/webp", me.GetProperty("uploads").GetProperty("formats").EnumerateArray().Select(f => f.GetString()));
    }

    public ValueTask DisposeAsync()
    {
        _factory.Dispose();
        _remote.Dispose();
        return ValueTask.CompletedTask;
    }
}
