using System.Text.RegularExpressions;

namespace Copernica.Spaces;

/// <summary>Validated runtime view of a configured space.</summary>
public sealed partial class Space
{
    private Space(SpaceOptions options, string mirrorPath, IReadOnlyList<string> errors)
    {
        Id = options.Id;
        DisplayName = string.IsNullOrWhiteSpace(options.DisplayName) ? options.Id : options.DisplayName.Trim();
        Provider = options.Provider;
        RemoteUrl = string.IsNullOrWhiteSpace(options.RemoteUrl) ? null : options.RemoteUrl.Trim();
        Branch = string.IsNullOrWhiteSpace(options.Branch) ? "main" : options.Branch.Trim();
        Folder = NormalizeFolder(options.Folder);
        Credential = options.Credential;
        MirrorPath = mirrorPath;
        ConfigurationErrors = errors;
    }

    public string Id { get; }

    public string DisplayName { get; }

    public SpaceProvider Provider { get; }

    /// <summary>HTTPS URL or filesystem path; null for a repository kept only on the data volume.</summary>
    public string? RemoteUrl { get; }

    public string Branch { get; }

    /// <summary>Space root inside the repository, without leading/trailing slashes; empty for the repository root.</summary>
    public string Folder { get; }

    public SpaceCredentialOptions Credential { get; }

    public string MirrorPath { get; }

    public IReadOnlyList<string> ConfigurationErrors { get; }

    public bool IsValid => ConfigurationErrors.Count == 0;

    public bool HasRemote => RemoteUrl is not null;

    /// <summary>The ref that holds the branch tip in the local mirror.</summary>
    public string TrackingRef => HasRemote ? $"refs/remotes/origin/{Branch}" : $"refs/heads/{Branch}";

    /// <summary>Converts a space-relative page path to a repository path.</summary>
    public string ToRepositoryPath(string spacePath) => Folder.Length == 0 ? spacePath : $"{Folder}/{spacePath}";

    /// <summary>Converts a repository path to a space-relative path, or null when it is outside the space.</summary>
    public string? ToSpacePath(string repositoryPath)
    {
        if (Folder.Length == 0)
        {
            return repositoryPath;
        }

        var prefix = Folder + "/";
        return repositoryPath.StartsWith(prefix, StringComparison.Ordinal) ? repositoryPath[prefix.Length..] : null;
    }

    public static IReadOnlyList<Space> CreateAll(IEnumerable<SpaceOptions> options, string dataDirectory)
    {
        var list = options.ToList();
        var duplicates = list
            .GroupBy(o => o.Id, StringComparer.Ordinal)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToHashSet(StringComparer.Ordinal);

        var mirrors = Path.Combine(Path.GetFullPath(dataDirectory), "mirrors");
        var result = new List<Space>(list.Count);
        for (var i = 0; i < list.Count; i++)
        {
            var o = list[i];
            var errors = Validate(o);
            if (duplicates.Contains(o.Id))
            {
                errors.Add($"Space id '{o.Id}' is used by more than one space.");
            }

            var directory = IdPattern().IsMatch(o.Id) ? o.Id : $"invalid-{i}";
            result.Add(new Space(o, Path.Combine(mirrors, directory + ".git"), errors));
        }

        return result;
    }

    internal static List<string> Validate(SpaceOptions o)
    {
        var errors = new List<string>();
        if (!IdPattern().IsMatch(o.Id ?? ""))
        {
            errors.Add($"Space id '{o.Id}' must match ^[a-z0-9][a-z0-9-]{{1,62}}$.");
        }

        if (o.DisplayName is { } name && name.Trim().Length > 100)
        {
            errors.Add("Space display name must be at most 100 characters.");
        }

        if (o.Provider == SpaceProvider.AzureDevOps && string.IsNullOrWhiteSpace(o.RemoteUrl))
        {
            errors.Add("RemoteUrl is required for AzureDevOps spaces.");
        }
        else if (o.Provider == SpaceProvider.AzureDevOps && !Hosting.AzureDevOps.AzureDevOpsRepositoryUrl.TryParse(o.RemoteUrl, out _))
        {
            errors.Add("RemoteUrl must be an HTTPS Azure DevOps git URL (…/{project}/_git/{repository}).");
        }

        if (o.Folder is { } folder && folder.Split('/', '\\').Any(s => s is ".." or "."))
        {
            errors.Add("Folder must not contain '.' or '..' segments.");
        }

        return errors;
    }

    private static string NormalizeFolder(string? folder) =>
        string.IsNullOrWhiteSpace(folder) ? "" : folder.Replace('\\', '/').Trim('/');

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{1,62}$")]
    private static partial Regex IdPattern();
}
