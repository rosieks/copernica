using Copernica.Configuration;
using Microsoft.Extensions.Configuration;

namespace Copernica.Tests.Configuration;

public sealed class ConfigFileConfigurationTests : IDisposable
{
    private readonly string directory = Directory.CreateTempSubdirectory("copernica-config-").FullName;

    public void Dispose() => Directory.Delete(directory, recursive: true);

    [Fact]
    public void Without_a_path_configuration_is_unchanged()
    {
        var configuration = new ConfigurationManager();
        configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Copernica:MaxRenderBytes"] = "10" });
        var sources = configuration.Sources.Count;

        configuration.AddCopernicaConfigFile(path: null);

        Assert.Equal(sources, configuration.Sources.Count);
        Assert.Equal("10", configuration["Copernica:MaxRenderBytes"]);
    }

    [Fact]
    public void File_settings_keep_their_hierarchy()
    {
        var configuration = new ConfigurationManager();

        configuration.AddCopernicaConfigFile(Write("""{"Copernica":{"MaxRenderBytes":2048,"Spaces":[{"Id":"a"},{"Id":"b"}]}}"""));

        var options = configuration.GetSection(CopernicaOptions.Section).Get<CopernicaOptions>()!;
        Assert.Equal(2048, options.MaxRenderBytes);
        Assert.Equal(["a", "b"], options.Spaces.Select(s => s.Id));
    }

    [Fact]
    public void Environment_variables_override_the_file()
    {
        var prefix = $"CopernicaTest{Guid.NewGuid():N}_";
        Environment.SetEnvironmentVariable(prefix + "Copernica__MaxRenderBytes", "4096");
        try
        {
            var configuration = new ConfigurationManager();
            configuration.AddEnvironmentVariables(prefix);

            configuration.AddCopernicaConfigFile(Write("""{"Copernica":{"MaxRenderBytes":2048,"SyncInterval":"00:05:00"}}"""));

            Assert.Equal("4096", configuration["Copernica:MaxRenderBytes"]);
            Assert.Equal("00:05:00", configuration["Copernica:SyncInterval"]);
        }
        finally
        {
            Environment.SetEnvironmentVariable(prefix + "Copernica__MaxRenderBytes", null);
        }
    }

    [Fact]
    public void File_keys_in_the_config_file_are_resolved()
    {
        var secret = Path.Combine(directory, "client-secret");
        File.WriteAllText(secret, "s3cret\n");
        var configuration = new ConfigurationManager();

        var json = System.Text.Json.JsonSerializer.Serialize(
            new { Copernica = new { Auth = new { EntraId = new { ClientSecret_FILE = secret } } } });

        configuration.AddCopernicaConfigFile(Write(json));
        configuration.AddFileSecrets();

        Assert.Equal("s3cret", configuration["Copernica:Auth:EntraId:ClientSecret"]);
    }

    [Fact]
    public void Missing_file_names_the_file()
    {
        var path = Path.Combine(directory, "missing.json");

        var error = Assert.Throws<InvalidOperationException>(() => new ConfigurationManager().AddCopernicaConfigFile(path));

        Assert.Contains(path, error.Message);
    }

    [Fact]
    public void Invalid_json_names_the_file()
    {
        var path = Write("{ not json");

        var error = Assert.Throws<InvalidOperationException>(() => new ConfigurationManager().AddCopernicaConfigFile(path));

        Assert.Contains(path, error.Message);
    }

    private string Write(string json)
    {
        var path = Path.Combine(directory, $"{Guid.NewGuid():N}.json");
        File.WriteAllText(path, json);
        return path;
    }
}
