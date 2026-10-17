using Copernica.Configuration;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;

namespace Copernica.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/auth/config", (IOptions<CopernicaOptions> options) =>
            Results.Ok(new { mode = options.Value.Auth.Mode?.ToString() })).AllowAnonymous();

        endpoints.MapPost("/auth/logout", async (HttpContext context, IAntiforgery antiforgery, IEnumerable<ISignOutHandler> handlers) =>
        {
            foreach (var handler in handlers)
            {
                await handler.OnSignOutAsync(context);
            }

            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            context.User = new();
            AuthenticationSetup.IssueToken(context, antiforgery);
            return Results.NoContent();
        }).AllowAnonymous();

        return endpoints;
    }
}

/// <summary>Cleans up per-user state (e.g. delegated tokens) on sign-out.</summary>
public interface ISignOutHandler
{
    Task OnSignOutAsync(HttpContext context);
}
