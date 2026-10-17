using System.Net;
using Copernica.Auth.Local;
using Copernica.Hosting;
using Copernica.Spaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Copernica.IntegrationTests.Infrastructure;

/// <summary>
/// Runs the real server in memory with a temporary data directory, <c>Local</c> accounts
/// <c>alice</c>/<c>bob</c> (password <c>secret</c>) and a <see cref="FakeHostingProvider"/>.
/// </summary>
public sealed class CopernicaFactory : WebApplicationFactory<Program>
{
    public const string Password = "secret";

    private static readonly string PasswordHash = LocalAuthentication.HashPassword(Password);

    private readonly List<(string Key, string? Value)> _settings = [];
    private int _spaceCount;

    public CopernicaFactory()
    {
        DataDirectory = Path.Combine(Path.GetTempPath(), "copernica-data-" + Guid.NewGuid().ToString("N"));
        Set("Copernica:DataDirectory", DataDirectory);
        Set("Copernica:Auth:Mode", "Local");
        Set("Copernica:SyncInterval", "01:00:00");
        Set("Logging:LogLevel:Default", "Error");
        Set("Logging:LogLevel:Microsoft.Hosting.Lifetime", "Error");
        AddUser(0, "alice", "Alice Example", "alice@example.test");
        AddUser(1, "bob", "Bob Example", null);
    }

    public string DataDirectory { get; }

    public FakeHostingProvider Hosting { get; } = new();

    private Action<IServiceCollection>? configureServices;

    /// <summary>Extra service overrides applied after the defaults (e.g. stub HTTP handlers).</summary>
    public CopernicaFactory ConfigureServices(Action<IServiceCollection> configure)
    {
        configureServices += configure;
        return this;
    }

    public CopernicaFactory Set(string key, string? value)
    {
        _settings.Add((key, value));
        return this;
    }

    /// <summary>Adds a <c>Git</c> space; <paramref name="remote"/> null keeps the repository only on the data volume.</summary>
    public CopernicaFactory AddSpace(string id, TestRemote? remote, string? folder = null, string? displayName = null, string? remoteUrl = null)
    {
        var i = _spaceCount++;
        Set($"Copernica:Spaces:{i}:Id", id);
        Set($"Copernica:Spaces:{i}:Provider", "Git");
        Set($"Copernica:Spaces:{i}:RemoteUrl", remoteUrl ?? remote?.Path);
        Set($"Copernica:Spaces:{i}:Branch", remote?.Branch ?? "main");
        Set($"Copernica:Spaces:{i}:Folder", folder);
        Set($"Copernica:Spaces:{i}:DisplayName", displayName);
        return this;
    }

    public T Get<T>() where T : notnull => Services.GetRequiredService<T>();

    /// <summary>Runs one synchronization of every space (instead of waiting for the timer).</summary>
    public async Task SyncAsync()
    {
        var registry = Get<SpaceRegistry>();
        var synchronizer = Get<SpaceSynchronizer>();
        foreach (var space in registry.Valid)
        {
            await synchronizer.SyncAsync(space, CancellationToken.None);
        }
    }

    /// <summary>A client with cookies and automatic antiforgery header, signed in as <paramref name="user"/>.</summary>
    public async Task<HttpClient> SignInAsync(string user = "alice")
    {
        var client = CreateAnonymousClient();
        var response = await client.PostAsJsonAsync("/auth/login", new { username = user, password = Password });
        response.EnsureSuccessStatusCode();
        return client;
    }

    public HttpClient CreateAnonymousClient()
    {
        var cookies = new CookieContainer();
        var client = CreateDefaultClient(new AntiforgeryHandler(cookies), new CookieContainerHandler(cookies));
        return client;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        foreach (var (key, value) in _settings)
        {
            builder.UseSetting(key, value);
        }

        builder.ConfigureTestServices(services =>
        {
            // Replace only the plain git provider; Azure DevOps keeps its real implementation.
            var git = services.Single(d => d.ServiceType == typeof(IHostingProvider) && d.ImplementationType == typeof(Copernica.Hosting.Git.GitHostingProvider));
            services.Remove(git);
            services.AddSingleton<IHostingProvider>(Hosting);
            configureServices?.Invoke(services);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            try
            {
                TestRemote.DeleteDirectory(DataDirectory);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }
    }

    private void AddUser(int i, string name, string displayName, string? email)
    {
        Set($"Copernica:Auth:Local:Users:{i}:Name", name);
        Set($"Copernica:Auth:Local:Users:{i}:PasswordHash", PasswordHash);
        Set($"Copernica:Auth:Local:Users:{i}:DisplayName", displayName);
        Set($"Copernica:Auth:Local:Users:{i}:Email", email);
    }

    /// <summary>Fetches the antiforgery cookie if needed and sends it back as <c>X-XSRF-TOKEN</c>.</summary>
    private sealed class AntiforgeryHandler(CookieContainer cookies) : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method != HttpMethod.Get && request.Method != HttpMethod.Head && !request.Headers.Contains("X-Skip-Antiforgery"))
            {
                var uri = new Uri(request.RequestUri!, "/");
                if (Token(uri) is null)
                {
                    using var bootstrap = new HttpRequestMessage(HttpMethod.Get, new Uri(uri, "/auth/config"));
                    (await base.SendAsync(bootstrap, cancellationToken)).Dispose();
                }

                request.Headers.Add("X-XSRF-TOKEN", Token(uri));
            }

            request.Headers.Remove("X-Skip-Antiforgery");
            return await base.SendAsync(request, cancellationToken);
        }

        private string? Token(Uri uri) => cookies.GetCookies(uri)["XSRF-TOKEN"]?.Value;
    }
}
