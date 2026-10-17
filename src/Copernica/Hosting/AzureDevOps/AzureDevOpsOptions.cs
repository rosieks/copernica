namespace Copernica.Hosting.AzureDevOps;

/// <summary>Bound to <c>Copernica:AzureDevOps</c> (contracts/configuration.md).</summary>
public sealed class AzureDevOpsOptions
{
    public const string Section = "Copernica:AzureDevOps";

    /// <summary>Azure DevOps resource (application) id for Microsoft Entra ID tokens.</summary>
    public const string ResourceId = "499b84ac-1321-427f-aa17-267ca6975798";

    public const string Scope = ResourceId + "/.default";

    public SyncCredentialOptions SyncCredential { get; set; } = new();

    public ServerOptions Server { get; set; } = new();
}

public enum SyncCredentialType
{
    None,
    ServicePrincipal,
    ManagedIdentity,
    Pat,
}

/// <summary>Deployment-level identity used only for fetching (must be read-only, Code: Read).</summary>
public sealed class SyncCredentialOptions
{
    public SyncCredentialType Type { get; set; } = SyncCredentialType.None;

    public string? TenantId { get; set; }

    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }

    /// <summary>Client id of a user-assigned managed identity; empty for system-assigned.</summary>
    public string? ManagedIdentityClientId { get; set; }

    public string? Pat { get; set; }
}

public sealed class ServerOptions
{
    /// <summary>Azure DevOps Server: users register their own personal access token (research.md R3).</summary>
    public bool UserPat { get; set; }
}
