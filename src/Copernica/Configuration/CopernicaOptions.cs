using Copernica.Spaces;

namespace Copernica.Configuration;

/// <summary>Root configuration bound to the <c>Copernica</c> section (contracts/configuration.md).</summary>
public sealed class CopernicaOptions
{
    public const string Section = "Copernica";

    /// <summary>Maximum permission cache lifetime allowed by FR-009b.</summary>
    public static readonly TimeSpan MaxPermissionCacheTtl = TimeSpan.FromMinutes(5);

    public string DataDirectory { get; set; } = DefaultDataDirectory();

    public string? Urls { get; set; }

    public string? PublicBaseUrl { get; set; }

    public TimeSpan SyncInterval { get; set; } = TimeSpan.FromMinutes(1);

    public TimeSpan PermissionCacheTtl { get; set; } = TimeSpan.FromMinutes(2);

    public long MaxRenderBytes { get; set; } = 1_048_576;

    public string FallbackEmailDomain { get; set; } = "users.noreply.invalid";

    public ForwardedHeadersSettings ForwardedHeaders { get; set; } = new();

    public AuthOptions Auth { get; set; } = new();

    public List<SpaceOptions> Spaces { get; set; } = [];

    public static bool RunningInContainer =>
        string.Equals(Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase);

    public static string DefaultDataDirectory() => RunningInContainer ? "/data" : "./data";

    public static string DefaultUrls() => RunningInContainer ? "http://+:8080" : "http://127.0.0.1:8080";
}

public sealed class ForwardedHeadersSettings
{
    public List<string> KnownProxies { get; set; } = [];
}

public enum AuthMode
{
    Local,
    EntraId,
    Oidc,
}

public sealed class AuthOptions
{
    public AuthMode? Mode { get; set; }

    public LocalAuthOptions Local { get; set; } = new();

    public EntraIdOptions EntraId { get; set; } = new();

    public OidcOptions Oidc { get; set; } = new();
}

public sealed class LocalAuthOptions
{
    public List<LocalUserOptions> Users { get; set; } = [];
}

public sealed class LocalUserOptions
{
    public string Name { get; set; } = "";

    public string PasswordHash { get; set; } = "";

    public string? DisplayName { get; set; }

    public string? Email { get; set; }
}

public sealed class EntraIdOptions
{
    public string Instance { get; set; } = "https://login.microsoftonline.com/";

    public string? TenantId { get; set; }

    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }
}

public sealed class OidcOptions
{
    public string? Authority { get; set; }

    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }
}
