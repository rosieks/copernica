using System.Security.Claims;
using Copernica.Configuration;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace Copernica.Auth.Local;

/// <summary>Built-in accounts from configuration, for evaluation and plain <c>Git</c> spaces.</summary>
public static class LocalAuthentication
{
    private static readonly PasswordHasher<string> Hasher = new();

    public static void Register(IServiceCollection services)
    {
    }

    public static string HashPassword(string password) => Hasher.HashPassword("", password);

    public static IEndpointRouteBuilder MapLocalAuthentication(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/auth/login", LoginAsync).AllowAnonymous();
        return endpoints;
    }

    internal static LocalUserOptions? Verify(IEnumerable<LocalUserOptions> users, string name, string password)
    {
        var user = users.FirstOrDefault(u => string.Equals(u.Name, name, StringComparison.Ordinal));
        if (user is null || string.IsNullOrEmpty(user.PasswordHash))
        {
            // Spend comparable time so unknown names are not distinguishable by timing.
            Hasher.VerifyHashedPassword("", HashPassword("timing"), password);
            return null;
        }

        return Hasher.VerifyHashedPassword("", user.PasswordHash, password) == PasswordVerificationResult.Failed ? null : user;
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        HttpContext context,
        IOptions<CopernicaOptions> options,
        UserService users,
        IAntiforgery antiforgery,
        CancellationToken cancellationToken)
    {
        var account = Verify(options.Value.Auth.Local.Users, request.Username ?? "", request.Password ?? "");
        if (account is null)
        {
            return Results.Problem(
                title: "Invalid user name or password.",
                statusCode: StatusCodes.Status401Unauthorized,
                type: ProblemTypes.For("invalid-credentials"));
        }

        var displayName = string.IsNullOrWhiteSpace(account.DisplayName) ? account.Name : account.DisplayName;
        await users.UpsertAsync(account.Name, displayName, account.Email, cancellationToken);

        var identity = new ClaimsIdentity(
            CurrentUser.ToClaims(account.Name, displayName, account.Email),
            CookieAuthenticationDefaults.AuthenticationScheme,
            CopernicaClaims.DisplayName,
            ClaimTypes.Role);
        var principal = new ClaimsPrincipal(identity);
        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);

        context.User = principal;
        AuthenticationSetup.IssueToken(context, antiforgery);
        return Results.Ok(new { id = account.Name, displayName, email = account.Email });
    }

    public sealed record LoginRequest(string? Username, string? Password);
}
