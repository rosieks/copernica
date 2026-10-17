using Copernica.Configuration;
using Copernica.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Copernica.Auth;

public sealed class UserService(CopernicaDbContext db, TimeProvider time, IOptions<CopernicaOptions> options)
{
    /// <summary>Creates or updates the user row on sign-in; atomic so simultaneous sign-ins cannot collide.</summary>
    public async Task UpsertAsync(string id, string displayName, string? email, CancellationToken cancellationToken)
    {
        var normalizedEmail = string.IsNullOrWhiteSpace(email) ? null : email;
        var now = time.GetUtcNow().UtcDateTime;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO users ("Id", "DisplayName", "Email", "LastSeenAt")
            VALUES ({id}, {displayName}, {normalizedEmail}, {now})
            ON CONFLICT ("Id") DO UPDATE SET
                "DisplayName" = excluded."DisplayName",
                "Email" = excluded."Email",
                "LastSeenAt" = excluded."LastSeenAt"
            """,
            cancellationToken);
    }

    /// <summary>Email used as commit author; falls back to an address that still identifies the user.</summary>
    public string CommitEmail(CurrentUser user) =>
        string.IsNullOrWhiteSpace(user.Email) ? $"{user.Id}@{options.Value.FallbackEmailDomain}" : user.Email;
}
