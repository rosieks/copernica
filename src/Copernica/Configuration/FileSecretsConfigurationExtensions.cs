namespace Copernica.Configuration;

/// <summary>
/// Resolves <c>*_FILE</c> keys: a key such as <c>Copernica:Auth:EntraId:ClientSecret_FILE</c>
/// loads the trimmed content of the referenced file into <c>Copernica:Auth:EntraId:ClientSecret</c>.
/// Used with Kubernetes Secrets mounted as files.
/// </summary>
public static class FileSecretsConfigurationExtensions
{
    private const string Suffix = "_FILE";

    public static ConfigurationManager AddFileSecrets(this ConfigurationManager configuration)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

        foreach (var (key, path) in configuration.AsEnumerable())
        {
            if (key.EndsWith(Suffix, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(path))
            {
                values[key[..^Suffix.Length]] = File.ReadAllText(path).Trim();
            }
        }

        if (values.Count > 0)
        {
            configuration.AddInMemoryCollection(values);
        }

        return configuration;
    }
}
