using System.Security.Claims;
using Copernica.Configuration;
using Copernica.Hosting.AzureDevOps;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Identity.Web;
using Microsoft.Identity.Web.TokenCacheProviders;
using Microsoft.Identity.Web.TokenCacheProviders.Distributed;

namespace Copernica.Auth.EntraId;

/// <summary>
/// Microsoft Entra ID sign-in (OIDC authorization code + PKCE, confidential client) with
/// delegated Azure DevOps access (research.md R3, tasks T055–T056).
/// </summary>
public static class EntraIdAuthentication
{
    public static void Register(IServiceCollection services, AuthenticationBuilder authentication, CopernicaOptions options)
    {
        var entra = options.Auth.EntraId;
        authentication
            .AddMicrosoftIdentityWebApp(
                identity =>
                {
                    identity.Instance = entra.Instance;
                    identity.TenantId = entra.TenantId;
                    identity.ClientId = entra.ClientId;
                    identity.ClientSecret = entra.ClientSecret;
                    identity.CallbackPath = "/signin-oidc";
                    identity.UsePkce = true;
                    identity.SaveTokens = false;
                    identity.SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                    identity.Events ??= new OpenIdConnectEvents();
                    var previous = identity.Events.OnTokenValidated;
                    identity.Events.OnTokenValidated = async context =>
                    {
                        if (previous is not null)
                        {
                            await previous(context);
                        }

                        await AddCopernicaClaimsAsync(context.Principal!, context.HttpContext);
                    };
                },
                cookieScheme: null,
                openIdConnectScheme: OpenIdConnectDefaults.AuthenticationScheme)
            .EnableTokenAcquisitionToCallDownstreamApi([AzureDevOpsOptions.Scope])
            .AddDistributedTokenCaches();

        services.AddSingleton<IDistributedCache, EncryptedTokenCache>();
        services.Configure<MsalDistributedTokenCacheAdapterOptions>(cache =>
        {
            // EncryptedTokenCache already encrypts with Data Protection.
            cache.Encrypt = false;
        });

        // The API answers 401 instead of redirecting; sign-in starts explicitly at /auth/challenge.
        services.Configure<AuthenticationOptions>(o =>
        {
            o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            o.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            o.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        });

        services.AddScoped<ISignOutHandler, EntraSignOutHandler>();
        services.AddScoped<IAzureDevOpsUserCredentials, EntraUserCredentials>();
    }

    public static IEndpointRouteBuilder MapEntraIdAuthentication(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/auth/challenge", (string? returnUrl) =>
            Results.Challenge(
                new AuthenticationProperties { RedirectUri = LocalUrl(returnUrl) },
                [OpenIdConnectDefaults.AuthenticationScheme])).AllowAnonymous();
        return endpoints;
    }

    internal static string LocalUrl(string? url) =>
        url is { Length: > 0 } && url.StartsWith('/') && !url.StartsWith("//", StringComparison.Ordinal) && !url.StartsWith("/\\", StringComparison.Ordinal) ? url : "/";

    private static async Task AddCopernicaClaimsAsync(ClaimsPrincipal principal, HttpContext context)
    {
        var id = principal.GetObjectId() ?? throw new InvalidOperationException("The identity provider returned no object id.");
        var name = principal.FindFirstValue("name") ?? principal.GetDisplayName() ?? id;
        var email = principal.FindFirstValue("email") ?? principal.FindFirstValue("preferred_username");

        if (principal.Identity is ClaimsIdentity identity)
        {
            identity.AddClaims(CurrentUser.ToClaims(id, name, email));
        }

        await context.RequestServices.GetRequiredService<UserService>().UpsertAsync(id, name, email, context.RequestAborted);
    }

    /// <summary>Removes the user's delegated tokens on sign-out (Constitution III).</summary>
    private sealed class EntraSignOutHandler(IMsalTokenCacheProvider tokenCache) : ISignOutHandler
    {
        public async Task OnSignOutAsync(HttpContext context)
        {
            if (context.User.GetMsalAccountId() is { } account)
            {
                await tokenCache.ClearAsync(account);
            }
        }
    }
}
