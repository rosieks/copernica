using Microsoft.Extensions.Configuration.EnvironmentVariables;
using Microsoft.Extensions.Configuration.Json;

namespace Copernica.Configuration;

/// <summary>
/// Loads the JSON file named by <c>COPERNICA_CONFIG_FILE</c> (used by the Helm chart). It is
/// inserted before the environment variables, so they still override it, as for
/// <c>appsettings.json</c>.
/// </summary>
public static class ConfigFileConfigurationExtensions
{
    public const string Variable = "COPERNICA_CONFIG_FILE";

    public static ConfigurationManager AddCopernicaConfigFile(this ConfigurationManager configuration) =>
        configuration.AddCopernicaConfigFile(Environment.GetEnvironmentVariable(Variable));

    public static ConfigurationManager AddCopernicaConfigFile(this ConfigurationManager configuration, string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return configuration;
        }

        var fullPath = Path.GetFullPath(path);
        if (!File.Exists(fullPath))
        {
            throw new InvalidOperationException($"Configuration file {path} ({Variable}) does not exist.");
        }

        var source = new JsonConfigurationSource { Optional = false, ReloadOnChange = false };
        source.FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(Path.GetDirectoryName(fullPath)!);
        source.Path = Path.GetFileName(fullPath);

        var environment = configuration.Sources
            .Select((s, i) => (Source: s, Index: i))
            .FirstOrDefault(s => s.Source is EnvironmentVariablesConfigurationSource);

        try
        {
            if (environment.Source is null)
            {
                configuration.Sources.Add(source);
            }
            else
            {
                configuration.Sources.Insert(environment.Index, source);
            }
        }
        catch (Exception ex) when (ex is FormatException or InvalidDataException or System.Text.Json.JsonException)
        {
            throw new InvalidOperationException($"Configuration file {path} ({Variable}) is not valid JSON: {ex.Message}", ex);
        }

        return configuration;
    }
}
