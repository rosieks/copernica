using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Copernica.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPendingImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "pending_images",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    UserId = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    SpaceId = table.Column<string>(type: "TEXT", maxLength: 63, nullable: false),
                    PagePath = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    RepositoryPath = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    OriginalName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Size = table.Column<long>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastUsedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pending_images", x => x.Id);
                    table.ForeignKey(
                        name: "FK_pending_images_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_pending_images_LastUsedAt",
                table: "pending_images",
                column: "LastUsedAt");

            migrationBuilder.CreateIndex(
                name: "IX_pending_images_SpaceId_RepositoryPath",
                table: "pending_images",
                columns: new[] { "SpaceId", "RepositoryPath" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_pending_images_UserId_SpaceId_PagePath",
                table: "pending_images",
                columns: new[] { "UserId", "SpaceId", "PagePath" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "pending_images");
        }
    }
}
