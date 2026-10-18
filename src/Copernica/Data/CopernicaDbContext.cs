using Copernica.Attachments;
using Copernica.Discussions;
using Microsoft.EntityFrameworkCore;

namespace Copernica.Data;

/// <summary>Application database: everything that is not page content (Constitution V).</summary>
public sealed class CopernicaDbContext(DbContextOptions<CopernicaDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<SpaceStatus> SpaceStatuses => Set<SpaceStatus>();

    public DbSet<Discussion> Discussions => Set<Discussion>();

    public DbSet<Comment> Comments => Set<Comment>();

    public DbSet<DelegatedToken> DelegatedTokens => Set<DelegatedToken>();

    public DbSet<PendingImage> PendingImages => Set<PendingImage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(u => u.Id);
            e.Property(u => u.Id).HasMaxLength(256);
            e.Property(u => u.DisplayName).HasMaxLength(256).IsRequired();
            e.Property(u => u.Email).HasMaxLength(320);
        });

        modelBuilder.Entity<SpaceStatus>(e =>
        {
            e.ToTable("space_status");
            e.HasKey(s => s.SpaceId);
            e.Property(s => s.SpaceId).HasMaxLength(63);
            e.Property(s => s.State).HasConversion<string>().HasMaxLength(20);
            e.Property(s => s.HeadCommit).HasMaxLength(64);
        });

        modelBuilder.Entity<Discussion>(e =>
        {
            e.ToTable("discussions");
            e.HasKey(d => d.Id);
            e.Property(d => d.SpaceId).HasMaxLength(63).IsRequired();
            e.Property(d => d.PagePath).HasMaxLength(1024).IsRequired();
            e.Property(d => d.State).HasConversion<string>().HasMaxLength(20);
            e.Property(d => d.AnchorStatus).HasConversion<string>().HasMaxLength(20);
            e.Property(d => d.CreatedBy).HasMaxLength(256).IsRequired();
            e.Property(d => d.ResolvedBy).HasMaxLength(256);
            e.HasIndex(d => new { d.SpaceId, d.PagePath });
            e.OwnsOne(d => d.Anchor, a =>
            {
                a.Property(x => x.Exact).HasColumnName("anchor_exact").HasMaxLength(TextAnchor.MaxExactLength).IsRequired();
                a.Property(x => x.Prefix).HasColumnName("anchor_prefix").HasMaxLength(TextAnchor.ContextLength);
                a.Property(x => x.Suffix).HasColumnName("anchor_suffix").HasMaxLength(TextAnchor.ContextLength);
                a.Property(x => x.Start).HasColumnName("anchor_start");
                a.Property(x => x.End).HasColumnName("anchor_end");
                a.Property(x => x.CommitId).HasColumnName("anchor_commit").HasMaxLength(64).IsRequired();
                a.Property(x => x.OriginalExact).HasColumnName("anchor_original_exact").HasMaxLength(TextAnchor.MaxExactLength).IsRequired();
            });
            e.Navigation(d => d.Anchor).IsRequired();
            e.HasMany(d => d.Comments).WithOne().HasForeignKey(c => c.DiscussionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DelegatedToken>(e =>
        {
            e.ToTable("user_tokens");
            e.HasKey(t => t.CacheKey);
            e.Property(t => t.CacheKey).HasMaxLength(512);
        });

        modelBuilder.Entity<PendingImage>(e =>
        {
            e.ToTable("pending_images");
            e.HasKey(p => p.Id);
            e.Property(p => p.Id).HasMaxLength(32);
            e.Property(p => p.UserId).HasMaxLength(256).IsRequired();
            e.Property(p => p.SpaceId).HasMaxLength(63).IsRequired();
            e.Property(p => p.PagePath).HasMaxLength(1024).IsRequired();
            e.Property(p => p.RepositoryPath).HasMaxLength(1024).IsRequired();
            e.Property(p => p.OriginalName).HasMaxLength(PendingImage.MaxOriginalNameLength).IsRequired();
            e.Property(p => p.ContentType).HasMaxLength(32).IsRequired();
            e.HasOne<User>().WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(p => new { p.UserId, p.SpaceId, p.PagePath });
            e.HasIndex(p => p.LastUsedAt);
            e.HasIndex(p => new { p.SpaceId, p.RepositoryPath }).IsUnique();
        });

        modelBuilder.Entity<Comment>(e =>
        {
            e.ToTable("comments");
            e.HasKey(c => c.Id);
            e.Property(c => c.Body).HasMaxLength(Comment.MaxBodyLength).IsRequired();
            e.Property(c => c.AuthorId).HasMaxLength(256).IsRequired();
            e.HasOne<User>().WithMany().HasForeignKey(c => c.AuthorId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(c => new { c.DiscussionId, c.CreatedAt });
        });
    }
}
