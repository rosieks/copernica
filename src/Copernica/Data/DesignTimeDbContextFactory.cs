using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Copernica.Data;

/// <summary>Used only by <c>dotnet ef</c> to create migrations without starting the host.</summary>
internal sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<CopernicaDbContext>
{
    public CopernicaDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<CopernicaDbContext>().UseSqlite("Data Source=design.db").Options);
}
