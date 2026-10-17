using Copernica.Configuration;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;

namespace Copernica.Auth;

public static class AuthenticationSetup
{
    public const string AntiforgeryHeader = "X-XSRF-TOKEN";
    public const string AntiforgeryCookie = "XSRF-TOKEN";

    public static IServiceCollection AddCopernicaAuthentication(this IServiceCollection services, CopernicaOptions options)
    {
        var authentication = services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, cookie =>
            {
                cookie.Cookie.Name = "copernica.session";
                cookie.Cookie.HttpOnly = true;
                cookie.Cookie.SameSite = SameSiteMode.Lax;
                cookie.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                cookie.SlidingExpiration = true;
                cookie.ExpireTimeSpan = TimeSpan.FromHours(8);
                cookie.LoginPath = "/signin";
                cookie.Events.OnRedirectToLogin = context => Reject(context, StatusCodes.Status401Unauthorized);
                cookie.Events.OnRedirectToAccessDenied = context => Reject(context, StatusCodes.Status403Forbidden);
            });

        switch (options.Auth.Mode)
        {
            case AuthMode.Local:
                Local.LocalAuthentication.Register(services);
                break;
            case AuthMode.EntraId:
                EntraId.EntraIdAuthentication.Register(services, authentication, options);
                break;
            case AuthMode.Oidc:
                Oidc.OidcAuthentication.Register(services, authentication, options);
                break;
        }

        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        services.AddAntiforgery(antiforgery =>
        {
            antiforgery.HeaderName = AntiforgeryHeader;
            antiforgery.Cookie.Name = "copernica.antiforgery";
            antiforgery.Cookie.SameSite = SameSiteMode.Strict;
            antiforgery.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        });

        services.AddScoped<UserService>();
        return services;
    }

    /// <summary>
    /// Issues the readable <c>XSRF-TOKEN</c> cookie on safe requests and validates the
    /// <c>X-XSRF-TOKEN</c> header on every state-changing <c>/api</c> and <c>/auth</c> request.
    /// </summary>
    public static IApplicationBuilder UseCopernicaAntiforgery(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
            var path = context.Request.Path;
            var guarded = path.StartsWithSegments("/api") || path.StartsWithSegments("/auth");

            if (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method))
            {
                IssueToken(context, antiforgery);
            }
            else if (guarded && !await antiforgery.IsRequestValidAsync(context))
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await Results.Problem(
                    title: "Missing or invalid antiforgery token.",
                    statusCode: StatusCodes.Status400BadRequest,
                    type: ProblemTypes.For("antiforgery")).ExecuteAsync(context);
                return;
            }

            await next(context);
        });

    /// <summary>Re-issues the token after the identity changed (sign-in / sign-out).</summary>
    public static void IssueToken(HttpContext context, IAntiforgery antiforgery)
    {
        var tokens = antiforgery.GetAndStoreTokens(context);
        context.Response.Cookies.Append(AntiforgeryCookie, tokens.RequestToken!, new CookieOptions
        {
            HttpOnly = false,
            SameSite = SameSiteMode.Strict,
            Secure = context.Request.IsHttps,
            Path = "/",
        });
    }

    private static Task Reject(RedirectContext<CookieAuthenticationOptions> context, int status)
    {
        context.Response.StatusCode = status;
        return Task.CompletedTask;
    }
}
