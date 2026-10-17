using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Copernica.Data.Migrations
{
    /// <inheritdoc />
    public partial class Discussions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "discussions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SpaceId = table.Column<string>(type: "TEXT", maxLength: 63, nullable: false),
                    PagePath = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    State = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    AnchorStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    anchor_exact = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    anchor_prefix = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    anchor_suffix = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    anchor_start = table.Column<int>(type: "INTEGER", nullable: false),
                    anchor_end = table.Column<int>(type: "INTEGER", nullable: false),
                    anchor_commit = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    anchor_original_exact = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ResolvedBy = table.Column<string>(type: "TEXT", maxLength: 256, nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_discussions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "comments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    DiscussionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AuthorId = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    Body = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EditedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_comments_discussions_DiscussionId",
                        column: x => x.DiscussionId,
                        principalTable: "discussions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_comments_users_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_comments_AuthorId",
                table: "comments",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_comments_DiscussionId_CreatedAt",
                table: "comments",
                columns: new[] { "DiscussionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_discussions_SpaceId_PagePath",
                table: "discussions",
                columns: new[] { "SpaceId", "PagePath" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "comments");

            migrationBuilder.DropTable(
                name: "discussions");
        }
    }
}
