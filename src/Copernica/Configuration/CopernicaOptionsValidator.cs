using Microsoft.Extensions.Options;

namespace Copernica.Configuration;

/// <summary>
/// Validates settings that make the whole process unusable. Per-space problems are not
/// reported here: they only make that space unavailable (FR-026, see SpaceOptionsValidator).
/// </summary>
public sealed class CopernicaOptionsValidator : IValidateOptions<CopernicaOptions>
{
    public ValidateOptionsResult Validate(string? name, CopernicaOptions options)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(options.DataDirectory))
        {
            errors.Add("Copernica:DataDirectory must be set.");
        }

        if (options.SyncInterval <= TimeSpan.Zero)
        {
            errors.Add("Copernica:SyncInterval must be positive.");
        }

        if (options.PermissionCacheTtl <= TimeSpan.Zero || options.PermissionCacheTtl > CopernicaOptions.MaxPermissionCacheTtl)
        {
            errors.Add($"Copernica:PermissionCacheTtl must be greater than zero and at most {CopernicaOptions.MaxPermissionCacheTtl} (FR-009b).");
        }

        if (options.MaxRenderBytes <= 0)
        {
            errors.Add("Copernica:MaxRenderBytes must be positive.");
        }

        if (string.IsNullOrWhiteSpace(options.FallbackEmailDomain))
        {
            errors.Add("Copernica:FallbackEmailDomain must be set.");
        }

        switch (options.Auth.Mode)
        {
            case AuthMode.EntraId when string.IsNullOrWhiteSpace(options.Auth.EntraId.TenantId) || string.IsNullOrWhiteSpace(options.Auth.EntraId.ClientId):
                errors.Add("Copernica:Auth:EntraId:TenantId and ClientId are required for EntraId mode.");
                break;
            case AuthMode.Oidc when string.IsNullOrWhiteSpace(options.Auth.Oidc.Authority) || string.IsNullOrWhiteSpace(options.Auth.Oidc.ClientId):
                errors.Add("Copernica:Auth:Oidc:Authority and ClientId are required for Oidc mode.");
                break;
        }

        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
}
