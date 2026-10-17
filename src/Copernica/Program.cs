using System.Net;
using Copernica;
using Copernica.Api;
using Copernica.Auth;
using Copernica.Auth.Local;
using Copernica.Configuration;
using Copernica.Data;
using Copernica.Discussions;
using Copernica.Git;
using Copernica.Hosting;
using Copernica.Auth.EntraId;
using Copernica.Auth.Oidc;
using Copernica.Hosting.AzureDevOps;
using Copernica.Hosting.Git;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Copernica.Rendering;
using Copernica.Spaces;
using Copernica.Web;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

if (args is ["hash-password", ..])
{
    // Prints a hash for Copernica:Auth:Local:Users:N:PasswordHash; the password is read from stdin.
    var password = Console.In.ReadLine() ?? "";
    Console.WriteLine(LocalAuthentication.HashPassword(password));
    return 0;
}

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddFileSecrets();

var copernica = builder.Configuration.GetSection(CopernicaOptions.Section).Get<CopernicaOptions>() ?? new CopernicaOptions();
var urls = copernica.Urls ?? CopernicaOptions.DefaultUrls();
if (!IsLoopbackOnly(urls) && copernica.Auth.Mode is null)
{
    Console.Error.WriteLine($"Refusing to start: Copernica:Auth:Mode must be set when listening on {urls}.");
    return 1;
}

builder.WebHost.UseUrls(urls);
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();

builder.Services.AddOptions<CopernicaOptions>().Bind(builder.Configuration.GetSection(CopernicaOptions.Section)).ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<CopernicaOptions>, CopernicaOptionsValidator>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.TryAddSingleton(_ => new SpaAssets(SpaHosting.CreateFileProvider()));
builder.Services.AddMemoryCache();
builder.Services.AddProblemDetails();
builder.Services.AddCopernicaDatabase();
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(Path.GetFullPath(copernica.DataDirectory), "keys")))
    .SetApplicationName("Copernica");
builder.Services.AddCopernicaAuthentication(copernica);

builder.Services.Configure<ForwardedHeadersOptions>(forwarded =>
{
    forwarded.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
    foreach (var proxy in copernica.ForwardedHeaders.KnownProxies)
    {
        forwarded.KnownProxies.Add(IPAddress.Parse(proxy));
    }
});

builder.Services.AddSingleton<SpaceRegistry>();
builder.Services.AddSingleton<MirrorRepository>();
builder.Services.AddSingleton<SpaceSynchronizer>();
builder.Services.AddHostedService<SpaceSyncService>();
builder.Services.AddSingleton<IHostingProvider, GitHostingProvider>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient(AzureDevOpsClient.HttpClientName, http => http.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddOptions<AzureDevOpsOptions>().Bind(builder.Configuration.GetSection(AzureDevOpsOptions.Section));
builder.Services.AddSingleton<AzureDevOpsClient>();
builder.Services.AddSingleton<SyncCredentialProvider>();
builder.Services.AddSingleton<UserPatStore>();
var azureDevOps = builder.Configuration.GetSection(AzureDevOpsOptions.Section).Get<AzureDevOpsOptions>() ?? new AzureDevOpsOptions();
if (azureDevOps.Server.UserPat)
{
    builder.Services.Replace(ServiceDescriptor.Scoped<IAzureDevOpsUserCredentials, PatUserCredentials>());
}

builder.Services.TryAddScoped<IAzureDevOpsUserCredentials, UnavailableUserCredentials>();
builder.Services.AddScoped<IHostingProvider, AzureDevOpsHostingProvider>();
builder.Services.AddScoped<HostingProviders>();
builder.Services.AddScoped<PermissionService>();
builder.Services.AddSingleton<MarkdownRenderer>();
builder.Services.AddSingleton<PageTreeService>();
builder.Services.AddSingleton<PageService>();
builder.Services.AddSingleton<PageWriter>();
builder.Services.AddSingleton<HistoryService>();
builder.Services.AddScoped<PageWriteService>();
builder.Services.AddScoped<DiscussionService>();

builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);

var app = builder.Build();

await app.Services.MigrateDatabaseAsync();

app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (ReauthenticationRequiredException ex) when (!context.Response.HasStarted)
    {
        context.Response.Clear();
        await Results.Problem(
            title: "Please sign in again.",
            detail: ex.Message,
            statusCode: StatusCodes.Status401Unauthorized,
            type: ProblemTypes.For("reauthentication-required")).ExecuteAsync(context);
    }
});
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseSpa(app.Services.GetRequiredService<SpaAssets>().Files);
app.UseAuthentication();
app.UseAuthorization();
app.UseCopernicaAntiforgery();

app.MapHealthChecks("/health/live", new() { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new() { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();
app.MapAuthEndpoints();
if (copernica.Auth.Mode == AuthMode.Local)
{
    app.MapLocalAuthentication();
}
else if (copernica.Auth.Mode == AuthMode.EntraId)
{
    app.MapEntraIdAuthentication();
}
else if (copernica.Auth.Mode == AuthMode.Oidc)
{
    app.MapOidcChallenge();
}

app.MapCopernicaApi();

await app.RunAsync();
return 0;

static bool IsLoopbackOnly(string urls) =>
    urls.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).All(url =>
    {
        var host = url.Split("://", 2).ElementAtOrDefault(1)?.Split(':', '/')[0] ?? "";
        return host is "localhost" || (IPAddress.TryParse(host.Trim('[', ']'), out var ip) && IPAddress.IsLoopback(ip));
    });

public partial class Program;

internal sealed class DatabaseHealthCheck(IServiceScopeFactory scopes) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        return await db.Database.CanConnectAsync(cancellationToken)
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("Database is not reachable.");
    }
}
