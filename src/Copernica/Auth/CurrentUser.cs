using System.Security.Claims;

namespace Copernica.Auth;

/// <summary>The signed-in user, as read from the authentication cookie.</summary>
public sealed record CurrentUser(string Id, string DisplayName, string? Email)
{
    public static CurrentUser? FromPrincipal(ClaimsPrincipal principal)
    {
        if (principal.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var id = principal.FindFirstValue(CopernicaClaims.UserId);
        if (string.IsNullOrEmpty(id))
        {
            return null;
        }

        return new CurrentUser(
            id,
            principal.FindFirstValue(CopernicaClaims.DisplayName) ?? id,
            principal.FindFirstValue(CopernicaClaims.Email));
    }

    public static IEnumerable<Claim> ToClaims(string id, string displayName, string? email)
    {
        yield return new Claim(CopernicaClaims.UserId, id);
        yield return new Claim(CopernicaClaims.DisplayName, displayName);
        if (!string.IsNullOrWhiteSpace(email))
        {
            yield return new Claim(CopernicaClaims.Email, email);
        }
    }
}

public static class CopernicaClaims
{
    public const string UserId = "copernica:uid";
    public const string DisplayName = "copernica:name";
    public const string Email = "copernica:email";
}

public static class HttpContextUserExtensions
{
    /// <summary>Returns the signed-in user; endpoints run behind the authenticated fallback policy.</summary>
    public static CurrentUser GetCurrentUser(this HttpContext context) =>
        CurrentUser.FromPrincipal(context.User) ?? throw new InvalidOperationException("No authenticated user.");
}
