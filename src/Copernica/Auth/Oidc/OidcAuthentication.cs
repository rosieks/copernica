using System.Security.Claims;
using Copernica.Configuration;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace Copernica.Auth.Oidc;

/// <summary>
/// Generic OpenID Connect sign-in against the organization's identity provider (e.g. AD FS,
/// Keycloak), used with Azure DevOps Server and per-user personal access tokens (task T096).
/// </summary>
public static class OidcAuthentication
{
    public static void Register(IServiceCollection services, AuthenticationBuilder authentication, CopernicaOptions options)
    {
        var oidc = options.Auth.Oidc;
        authentication.AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, o =>
        {
            o.Authority = oidc.Authority;
            o.ClientId = oidc.ClientId;
            o.ClientSecret = oidc.ClientSecret;
            o.ResponseType = OpenIdConnectResponseType.Code;
            o.UsePkce = true;
            o.SaveTokens = false;
            o.GetClaimsFromUserInfoEndpoint = true;
            o.MapInboundClaims = false;
            o.CallbackPath = "/signin-oidc";
            o.SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            o.Scope.Clear();
            o.Scope.Add("openid");
            o.Scope.Add("profile");
            o.Scope.Add("email");
            o.Events.OnTokenValidated = context => AddCopernicaClaimsAsync(context.Principal!, context.HttpContext);
        });
    }

    public static IEndpointRouteBuilder MapOidcChallenge(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/auth/challenge", (string? returnUrl) =>
            Results.Challenge(
                new AuthenticationProperties { RedirectUri = EntraId.EntraIdAuthentication.LocalUrl(returnUrl) },
                [OpenIdConnectDefaults.AuthenticationScheme])).AllowAnonymous();
        return endpoints;
    }

    private static async Task AddCopernicaClaimsAsync(ClaimsPrincipal principal, HttpContext context)
    {
        var id = principal.FindFirstValue("sub") ?? throw new InvalidOperationException("The identity provider returned no subject.");
        var name = principal.FindFirstValue("name") ?? principal.FindFirstValue("preferred_username") ?? id;
        var email = principal.FindFirstValue("email") ?? principal.FindFirstValue("upn");

        if (principal.Identity is ClaimsIdentity identity)
        {
            identity.AddClaims(CurrentUser.ToClaims(id, name, email));
        }

        await context.RequestServices.GetRequiredService<UserService>().UpsertAsync(id, name, email, context.RequestAborted);
    }
}
