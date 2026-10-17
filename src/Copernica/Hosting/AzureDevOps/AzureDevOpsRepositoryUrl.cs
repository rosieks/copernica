namespace Copernica.Hosting.AzureDevOps;

/// <summary>
/// Parts of an Azure DevOps git URL. Covers Azure DevOps Services
/// (<c>https://dev.azure.com/{org}/{project}/_git/{repo}</c>,
/// <c>https://{org}.visualstudio.com[/DefaultCollection]/{project}/_git/{repo}</c>) and
/// Azure DevOps Server (<c>https://{server}[/tfs]/{collection}/{project}/_git/{repo}</c>).
/// </summary>
public sealed record AzureDevOpsRepositoryUrl(Uri CollectionUrl, string Project, string Repository)
{
    public static bool TryParse(string? url, out AzureDevOpsRepositoryUrl parsed)
    {
        parsed = null!;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        var segments = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.UnescapeDataString).ToArray();
        var git = Array.IndexOf(segments, "_git");
        if (git < 1 || git != segments.Length - 2)
        {
            return false;
        }

        var collectionPath = string.Join('/', segments[..(git - 1)].Select(Uri.EscapeDataString));
        var collection = new UriBuilder(uri.Scheme, uri.Host, uri.Port, collectionPath.Length == 0 ? "/" : "/" + collectionPath + "/").Uri;
        parsed = new AzureDevOpsRepositoryUrl(collection, segments[git - 1], segments[git + 1]);
        return true;
    }

    /// <summary>Absolute URL of a REST resource relative to the collection (organization).</summary>
    public Uri Api(string relative) => new(CollectionUrl, relative.TrimStart('/'));
}

/// <summary>Security tokens of the "Git Repositories" namespace (research.md R4).</summary>
public static class SecurityTokens
{
    public const string GitRepositoriesNamespace = "2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87";
    public const int GenericRead = 2;
    public const int GenericContribute = 4;

    public static string Repository(Guid projectId, Guid repositoryId) => $"repoV2/{projectId}/{repositoryId}";

    /// <summary>Branch token: each path segment is the hex of its UTF-16LE bytes, e.g. <c>main</c> → <c>6d00610069006e00</c>.</summary>
    public static string Branch(Guid projectId, Guid repositoryId, string branch) =>
        $"{Repository(projectId, repositoryId)}/refs/heads/{string.Join('/', branch.Split('/').Select(Encode))}";

    private static string Encode(string segment) =>
        Convert.ToHexStringLower(System.Text.Encoding.Unicode.GetBytes(segment));
}
