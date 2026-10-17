using Copernica.Configuration;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Copernica.Data;

public static class DatabaseSetup
{
    public static IServiceCollection AddCopernicaDatabase(this IServiceCollection services)
    {
        services.AddDbContext<CopernicaDbContext>((sp, options) =>
        {
            var copernica = sp.GetRequiredService<IOptions<CopernicaOptions>>().Value;
            var path = Path.Combine(Path.GetFullPath(copernica.DataDirectory), "copernica.db");
            var connection = new SqliteConnectionStringBuilder { DataSource = path, Cache = SqliteCacheMode.Shared, Pooling = true };
            options.UseSqlite(connection.ToString());
        });

        return services;
    }

    /// <summary>Creates the data directory, applies migrations and enables WAL mode.</summary>
    public static async Task MigrateDatabaseAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        var options = services.GetRequiredService<IOptions<CopernicaOptions>>().Value;
        Directory.CreateDirectory(Path.GetFullPath(options.DataDirectory));

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CopernicaDbContext>();
        await db.Database.MigrateAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", cancellationToken);
    }
}
