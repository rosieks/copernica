# Implementation Plan: Managing the Page Tree

**Branch**: `005-page-tree-management` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-page-tree-management/spec.md`

## Summary

People with write access organize a space from the tree on the left. They can:
- rename and move pages and folders;
- create pages and folders in place;
- delete folders;
- reorder items;

through an actions menu (mouse, keyboard, screen reader) and native drag and drop.

1. **Server: tree operations.** Each operation becomes exactly one attributed commit. The
   existing write loop (lock, fetch, commit, push, retry), extracted into a shared
   `RepositoryWriter`, recomputes the operation on the fetched tip. Concurrent edits are
   therefore combined, and only real conflicts are reported (`tree-changed`,
   `target-exists`).
2. **Server: link rewriting.** Links to moved pages in the same space, and relative links
   inside the moved pages, are rewritten in the same commit. Exact Markdig source spans
   are used, so only the URL text changes.
3. **Server: move tracking.** Moves stay plain git renames, plus a `Copernica-Moved:`
   commit trailer. A move resolver derived from history:
   - redirects old addresses (`page-moved`);
   - stitches history;
   - keeps discussions attached;
   - lets an edit made in parallel save at the new location.
4. **Server: ordering.** Order comes from Azure DevOps Wiki-compatible `.order` files. They
   are read into the tree and kept consistent by every operation, in the same commit.
5. **SPA.**
   - **Tree**: an item menu (also opened by Shift+F10, F2 and Delete) and drag and drop.
   - **Dialogs**: Rename, Move, New folder, Delete folder. They use dry runs to show their
     effects before confirming.
   - **Moved pages**: notices and draft re-keying.

There are no new dependencies, no schema migration, and no new egress.

## Technical Context

**Language/Version**: C# 14 / .NET 10; TypeScript 5.9 (strict), React 19

**Primary Dependencies**: none new.
- LibGit2Sharp (existing): `TreeDefinition`, rename detection, `MergeCommits`.
- Markdig (existing): `UsePreciseSourceLocation` for URL spans.
- Radix via `src/web/src/ui` (existing): `Menu`, `Dialog`, `AlertDialog`.
- Native HTML5 drag and drop.

**Storage**:
- no SQLite schema change (`Discussion.PagePath` is updated by moves);
- the content repositories gain `.order` files (only when someone reorders) and
  `Copernica-Moved:` trailers in wiki move commits;
- derived move lookups are cached in `IMemoryCache`.

**Testing**:
- xUnit unit tests: `FolderOrder`, `LinkRewriter`, `MoveResolver`, name validation;
- xUnit integration tests: tree endpoints against temp bare remotes, covering one commit,
  conflicts, concurrent pushes, discussions, history and redirects;
- Vitest: tree keyboard and menu, drop-zone geometry, dialogs, drafts;
- Playwright: quickstart T1–T31, plus the 002 WCAG scan;
- perf script for SC-006.

**Target Platform**: unchanged (self-contained binary; chiseled container; browsers per the
constitution)

**Project Type**: web application (ASP.NET Core server + embedded React SPA), one artifact

**Performance Goals**:
- moving or deleting a folder of 500 pages in a 5 000-page space takes under 10 s
  (SC-006);
- a single-page rename's dry run takes under 1 s;
- tree loads are unchanged, with `.order` parsed per cached tree.

**Constraints**:
- one commit per operation; never force-push;
- no working tree (bare mirror), so case-only renames work on any OS;
- strict CSP unchanged;
- WCAG 2.1 AA;
- no DnD on coarse pointers.

**Scale/Scope**:
- 5 user stories, 23 FRs;
- 3 new endpoints, 4 extended endpoints;
- 4 new server components and 4 dialogs, plus the tree menu and DnD.

No open unknowns. Decisions are in [research.md](research.md) R1–R15.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / rule | Status | Evidence |
|---|------------------|--------|----------|
| I | English artifacts | ✅ | Spec, plan, contracts, UI strings and trailers in English |
| II | No new egress; bundled assets; single command | ✅ | Operations push only to the space's configured remote, with the user's credentials, as saves do. No new service or asset |
| III | Auth on write paths; least privilege; safe content; transparency | ✅ | New endpoints use `RequireWriteAsync` + antiforgery. Read-only users see no actions. Server-side name validation (R15) keeps paths inside the space. Link rewriting edits URL text only; rendering and sanitization are unchanged. No new privilege, port or file outside the data volume |
| III | Forbidden: user code execution, server-side URL fetching | ✅ | Neither. Link rewriting is pure text over repository content |
| IV | Dependencies | ✅ | None added (shipped or test). DnD is native; there is no DnD library |
| V | Git is the source of truth; attributed commits; conflicts surfaced; non-content data separate; derived data rebuildable; YAGNI | ✅ | Every operation is one commit by the user. Order lives in the repository (`.order`) and moves in commit trailers. The move resolver is derived from history and cached, with no redirect table. Concurrent changes are combined or rejected, never overwritten (R1, R2, R6) |
| Sec | Config via env/file; safest defaults; CSP; server-side rendering | ✅ | No new settings. CSP unchanged. Rendering stays server-side |
| QG | Tests: rendering/sanitization, auth on write paths, conflicts, storage | ✅ | Integration tests for write guards on all 3 endpoints, the conflict matrix (R2, R6), one-commit storage, `.order` round-trip, and rendering of rewritten links |
| QG | Storage-format change must be called out | ⚠️ call out | Repositories may gain `.order` files and `Copernica-Moved:` trailers. PR description and README/`SECURITY.md` ("files written to repositories") must say so |

**Post-design re-check (after Phase 1)**: ✅ No violations.
- **Dry runs**: they never commit and need write access (they reveal no more than reading
  does).
- **Folder delete**: requires `expectedPageCount` to match, so it cannot remove more than
  the user confirmed.
- **Move commits**: the commit message trailer is generated by the server and cannot be set
  by the client.
- **Links between spaces**: never rewritten; old addresses redirect instead.

## Project Structure

### Documentation (this feature)

```text
specs/005-page-tree-management/
├── plan.md              # This file
├── research.md          # R1–R15
├── data-model.md        # FolderOrder, tree operations, move map, LinkRewrite, MoveResolver, SaveResult.path
├── quickstart.md        # T1–T31
├── contracts/
│   ├── api.md           # tree/move, tree/delete, tree/reorder; page-moved; SaveResult.path; X-Copernica-Commit
│   ├── order-file.md    # .order read/write rules (Azure DevOps Wiki compatible)
│   └── ui.md            # item menu, dialogs, DnD, feedback and focus, moved-page notices
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/Copernica/
├── Git/
│   ├── RepositoryWriter.cs          # new: lock/fetch/plan/commit/push/retry loop extracted from PageWriter
│   ├── PageWriter.cs                # page saves as a RepositoryWriter plan; moved-page save (R6); .order on create/delete
│   ├── MoveResolver.cs              # new: trailers + rename detection; CurrentPath / PreviousPath / MovedBetween
│   ├── MoveTrailers.cs              # new: format/parse "Copernica-Moved: a -> b"
│   └── HistoryService.cs            # stitch history across trailer moves (R5)
├── Spaces/
│   ├── FolderOrder.cs               # new: parse, sort, minimal edits of .order
│   ├── PageTree.cs                  # apply FolderOrder when building children
│   ├── TreeOperations.cs            # new: Move / DeleteFolder / Reorder plans + validation + dry run
│   └── SpacePaths.cs                # single-segment name validation (R15)
├── Rendering/
│   ├── LinkRewriter.cs              # new: span-exact URL rewriting for a move map
│   └── MarkdownRenderer.cs          # expose a parse pipeline with precise source locations
├── Discussions/DiscussionService.cs # ApplyMovesAsync(map); FollowRenamesAsync via MoveResolver
└── Api/
    ├── TreeEndpoints.cs             # new: POST tree/move, tree/delete, tree/reorder
    ├── SpacesEndpoints.cs           # X-Copernica-Commit header; page-moved / deletedIn on 404
    └── PageWriteEndpoints.cs        # SaveResult.path; page-deleted
src/web/src/
├── components/
│   ├── PageTree.tsx                 # item menu, Shift+F10/F2/Delete, DnD, focus after operations
│   ├── PageTree.css                 # row actions button, drop indicators
│   ├── TreeItemMenu.tsx             # new: actions menu (tree + root)
│   ├── treeDnd.ts                   # new: drop-zone geometry, validity, auto-expand/scroll
│   ├── TreeDialogs.tsx              # new: Rename, Move (folder picker), New folder, Delete folder
│   └── PageDialogs.tsx              # NewPageDialog reused with folder
├── pages/
│   ├── SpaceLayout.tsx              # root menu; tree refetch on focus / 60 s; base commit from header
│   ├── PageView.tsx                 # page-moved redirect + notice; deleted → history link
│   ├── PageEdit.tsx                 # SaveResult.path → replace route, re-key draft; page-deleted callout
│   └── PageActions.tsx              # Rename… / Move… entries
├── api/treeApi.ts                   # new: typed calls incl. dry runs
├── drafts.ts                        # moveDraft()
├── shortcuts/index.ts               # F2, Delete in "Page tree" group
└── api/schema.d.ts                  # regenerated
tests/
├── Copernica.Tests/Spaces/          # FolderOrderTests, NameValidationTests
├── Copernica.Tests/Rendering/       # LinkRewriterTests
├── Copernica.Tests/Git/             # MoveTrailersTests, MoveResolverTests
├── Copernica.IntegrationTests/Spaces/TreeOperationsTests.cs  # endpoints, conflicts, one commit, discussions, history, redirects
├── e2e/us8-tree.spec.ts             # T1–T31 automated parts
└── perf/tree-move.mjs               # SC-006
```

**Structure Decision**: the existing feature folders are extended (`Git/`, `Spaces/`,
`Rendering/`, `Api/`). The write loop is extracted into `RepositoryWriter`, so page saves
and tree operations share one locking/pushing path. In the SPA, the menu, DnD logic and
dialogs live in their own files next to `PageTree.tsx`. No new projects.

## Delivery increments

1. **Foundation**:
   - `RepositoryWriter` extraction, with existing tests green;
   - name validation;
   - `MoveTrailers` and `MoveResolver`;
   - `X-Copernica-Commit`.
2. **US1 (P1)**, rename and move a page:
   - `LinkRewriter`;
   - the `tree/move` page path with dry run, `retitle`, and discussion update;
   - `page-moved` redirect;
   - history stitching;
   - moved-page save (R6);
   - Rename and Move dialogs, the tree menu, and page-action entries;
   - e2e T1–T11.
3. **US2 (P1)**, create from the tree: the menu entries, New folder dialog, and `.order`
   append on create; e2e T12–T15.
4. **US3 (P2)**, folders: folder moves through `tree/move` (prefix moves, files),
   `tree/delete` with count check; e2e T16–T20.
5. **US5 (P3)**, order:
   - `FolderOrder` read path in `PageTreeBuilder`;
   - `tree/reorder`;
   - `.order` maintenance in all operations;
   - Move up/down;
   - e2e T22, T24–T28.
6. **US4 (P3)**, drag and drop: `treeDnd.ts` with move and reorder drops; e2e T21, T23,
   T29.
7. **Polish**:
   - WCAG scan (T31);
   - perf script (SC-006);
   - README "Organizing pages" section, and the `.order`/trailer note in `SECURITY.md`;
   - OpenAPI update;
   - push-rejected path (T30).

US5 comes before US4 so that drag and drop can ship move and reorder drops together.

## Complexity Tracking

| Added complexity | Why needed | Simpler alternative rejected because |
|------------------|------------|--------------------------------------|
| `Copernica-Moved:` commit trailers + `MoveResolver` | Old addresses, history and discussions must follow moves even when a moved page's content changed too much for git's rename detection (R3) | Rename detection alone fails for small pages. A SQLite redirect table is a parallel record, misses pushes from elsewhere, and is not rebuildable (Principle V) |
| Extracting `RepositoryWriter` from `PageWriter` | Tree operations must share the same lock/fetch/push/retry semantics as saves, but compute their tree differently (on the tip, R1) | Duplicating the loop risks diverging push, retry and credential behaviour. Forcing operations through the page 3-way merge gives false conflicts in `.order` files and linking pages |
