namespace Copernica.Spaces;

public enum SpaceProvider
{
    Git,
    AzureDevOps,
}

/// <summary>A space as written in configuration (data-model.md "Space").</summary>
public sealed class SpaceOptions
{
    public string Id { get; set; } = "";

    public string? DisplayName { get; set; }

    public SpaceProvider Provider { get; set; } = SpaceProvider.Git;

    public string? RemoteUrl { get; set; }

    public string Branch { get; set; } = "main";

    public string? Folder { get; set; }

    public SpaceCredentialOptions Credential { get; set; } = new();
}

public sealed class SpaceCredentialOptions
{
    /// <summary>Read/write token for <see cref="SpaceProvider.Git"/> spaces with an HTTPS remote.</summary>
    public string? Token { get; set; }

    public string Username { get; set; } = "copernica";
}
