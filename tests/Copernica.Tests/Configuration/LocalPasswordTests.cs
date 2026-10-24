using Copernica.Auth.Local;
using Copernica.Configuration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Copernica.Tests.Configuration;

public sealed class LocalPasswordTests
{
    [Fact]
    public void A_plain_password_can_be_used_to_sign_in()
    {
        var options = Build(new() { ["Copernica:Auth:Local:Users:0:Name"] = "admin", ["Copernica:Auth:Local:Users:0:Password"] = "correct horse" });

        Assert.NotNull(LocalAuthentication.Verify(options.Auth.Local.Users, "admin", "correct horse"));
        Assert.Null(LocalAuthentication.Verify(options.Auth.Local.Users, "admin", "wrong"));
    }

    [Fact]
    public void A_plain_password_is_replaced_by_its_hash()
    {
        var options = Build(new() { ["Copernica:Auth:Local:Users:0:Name"] = "admin", ["Copernica:Auth:Local:Users:0:Password"] = "correct horse" });

        var user = Assert.Single(options.Auth.Local.Users);
        Assert.Null(user.Password);
        Assert.False(string.IsNullOrEmpty(user.PasswordHash));
    }

    [Fact]
    public void Password_and_hash_together_are_rejected()
    {
        var error = Assert.Throws<OptionsValidationException>(() => Build(new()
        {
            ["Copernica:Auth:Local:Users:0:Name"] = "admin",
            ["Copernica:Auth:Local:Users:0:Password"] = "x",
            ["Copernica:Auth:Local:Users:0:PasswordHash"] = LocalAuthentication.HashPassword("x"),
        }));

        Assert.Contains("Copernica:Auth:Local:Users:0 (admin)", error.Message);
    }

    [Fact]
    public void A_user_without_password_or_hash_is_rejected()
    {
        var error = Assert.Throws<OptionsValidationException>(() => Build(new() { ["Copernica:Auth:Local:Users:0:Name"] = "admin" }));

        Assert.Contains("Copernica:Auth:Local:Users:0 (admin)", error.Message);
    }

    [Fact]
    public void Password_can_come_from_a_file()
    {
        var file = Path.GetTempFileName();
        File.WriteAllText(file, "from-file\n");
        try
        {
            var options = Build(new() { ["Copernica:Auth:Local:Users:0:Name"] = "admin", ["Copernica:Auth:Local:Users:0:Password_FILE"] = file });

            Assert.NotNull(LocalAuthentication.Verify(options.Auth.Local.Users, "admin", "from-file"));
        }
        finally
        {
            File.Delete(file);
        }
    }

    private static CopernicaOptions Build(Dictionary<string, string?> settings)
    {
        settings["Copernica:Auth:Mode"] = "Local";
        settings["Copernica:DataDirectory"] = "data";
        var configuration = new ConfigurationManager();
        configuration.AddInMemoryCollection(settings);
        configuration.AddFileSecrets();

        var services = new ServiceCollection();
        services.AddOptions<CopernicaOptions>().Bind(configuration.GetSection(CopernicaOptions.Section));
        services.AddSingleton<IValidateOptions<CopernicaOptions>, CopernicaOptionsValidator>();
        LocalAuthentication.Register(services);

        return services.BuildServiceProvider().GetRequiredService<IOptions<CopernicaOptions>>().Value;
    }
}
