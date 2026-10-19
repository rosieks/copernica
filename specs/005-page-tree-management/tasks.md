---

description: "Task list for 005 Managing the Page Tree"
---

# Tasks: Managing the Page Tree

**Input**: Design documents from `specs/005-page-tree-management/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[contracts/order-file.md](contracts/order-file.md), [contracts/ui.md](contracts/ui.md),
[quickstart.md](quickstart.md)

**Tests**: Included. The constitution's Quality Gates require tests for write paths, auth,
concurrent-edit conflicts, storage and rendering. SC-002, SC-003, SC-004, SC-006 and
SC-007 need automated checks. Scenario IDs T1–T31 refer to [quickstart.md](quickstart.md)
and are written as "scenario T1" so they are not confused with task IDs.

**Organization**: tasks are grouped by user story. Phase order follows plan.md: US1, US2,
US3, US5, then US4, because drag and drop (US4) ships both the move and the reorder drops.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to

Conventions:
- server code goes in `src/Copernica`, frontend in `src/web/src`;
- UI uses only the `src/web/src/ui` wrappers, tokens and English strings
  ([002 ui.md](../002-accessible-wiki-ui/contracts/ui.md));
- no new dependencies (NuGet or npm);
- problem types are `ProblemTypes.For("<suffix>")` (`src/Copernica/Api/ProblemTypes.cs`);
- all write endpoints call `PermissionService.RequireWriteAsync` and go through the same
  antiforgery path as `PageWriteEndpoints`;
- Python edits to source files must use `encoding='utf-8'`.

---

## Phase 1: Setup

- [X] T001 Create the git branch `005-page-tree-management` from `master` (currently on `004-diagram-fixes`) and the folder `tests/Copernica.IntegrationTests/Tree/`
- [X] T002 [P] Add the seed content from quickstart.md "Setup" as a separate `tree` space ("Tree Lab") in `tests/e2e/server.mjs`, the way the other fixtures are seeded, so moves do not disturb other specs:
  - `index.md`, `guides/setup.md` (with `# Setup`), `guides/faq.md` (with a code span `` `setup.md` ``), `guides/tiny.md`, `reference/api.md`, `reference/.order` (`api`);
  - 40 pages + 2 images under `archive/2019/`;
  - `.attachments/s.svg`.

  Expose its remote as `state().tree` in `tests/e2e/helpers.ts`. A read-only e2e user is not possible with plain git spaces (every signed-in user can write), so scenario T14 is covered by Vitest and integration tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the shared write loop, name validation, move trailers, the move resolver and
the tree's base commit. Every story depends on these.

### Tests first

- [X] T003 [P] Add `tests/Copernica.Tests/Spaces/NameValidationTests.cs` for `SpacePaths.TryNormalizeName(string? raw, out string name)` (research R15). It rejects:
  - `/`, `\` and control characters;
  - `.`, `..`, empty or whitespace-only names;
  - leading or trailing spaces;
  - any of `<>:"|?*`;
  - more than 255 UTF-8 bytes;
  - `.order` (case-insensitive).

  It accepts Unicode names (`Zażółć`), and names with inner spaces, hyphens and dots.
- [X] T004 [P] Add `tests/Copernica.Tests/Git/MoveTrailersTests.cs`:
  - format and parse `Copernica-Moved: guides/setup.md -> howto/install.md`;
  - a folder `guides/old/ -> archive/old/` (trailing `/`);
  - paths with spaces round-trip as `%20` per segment;
  - multiple trailers;
  - trailers are appended after a blank line to a user message that has its own trailing whitespace;
  - lines that are not trailers are ignored;
  - malformed trailers are ignored (no arrow, empty side).
- [X] T005 [P] Add `tests/Copernica.Tests/Git/MoveResolverTests.cs`, building temporary repositories with LibGit2Sharp:
  - `CurrentPath` follows a trailer move;
  - it follows a pure rename without a trailer (rename detection);
  - a folder trailer maps a page inside the folder;
  - chains of 3 moves are followed;
  - a cycle (a→b, b→a) stops the walk;
  - the 20-hop limit is respected;
  - a deleted path returns `Deleted(commitId)`;
  - an unknown path returns `Unknown`.

  `PreviousPath(path, addedIn)` returns the old path from the trailer. `MovedBetween(path, base, tip)` returns `Moved`, `Deleted` or `Unchanged`.

### Implementation

- [X] T006 Extract the lock/fetch/commit/push/retry loop from `src/Copernica/Git/PageWriter.cs` into `src/Copernica/Git/RepositoryWriter.cs` (research R1):
  - signature: `Task<WriteOutcome<T>> WriteAsync<T>(Space, Func<Repository, Commit tip, WritePlan<T>> plan, CommitAuthor, GitCredentials, CancellationToken)`;
  - a `WritePlan<T>` is either a new commit plus a result value, a no-op with the current tip, or a failure outcome;
  - keep, unchanged: `MaxAttempts = 3`, the `refs/copernica/push/` temp ref, `CheckedOutBranchConflict`, `IsStale`/`IsRejection`, and the tracking-ref update only after a successful push.

  Re-implement `PageWriter.Save` as a plan on top of it. Register it in DI in `src/Copernica/Program.cs`. All existing tests in `tests/Copernica.IntegrationTests/Editing/` must stay green.
- [X] T007 [P] Implement `SpacePaths.TryNormalizeName` in `src/Copernica/Spaces/SpacePaths.cs` per T003. Add `SpacePaths.IsReservedName` for `.order`. Make `PageTreeBuilder.IsPage` keep ignoring `.order`.
- [X] T008 [P] Implement `src/Copernica/Git/MoveTrailers.cs` per T004:
  - `Format(IEnumerable<(string Old, string New, bool Folder)>)`;
  - `Append(string message, …)` returns the message + `\n\n` + the trailer lines;
  - `Parse(string message)`.
- [X] T009 Implement `src/Copernica/Git/MoveResolver.cs` per T005 and data-model.md "MoveRecord / MoveResolver":
  - find the newest commit on the first-parent chain from head where the path stopped existing ("walk at most 10 000 commits");
  - map the path through that commit's trailers, else through rename detection on that commit's diff (`SimilarityOptions.Renames`);
  - "follow at most 20 hops";
  - cache results in `IMemoryCache` under `(nameof(MoveResolver), space.Id, head, path)` with a 30 min sliding expiration.

  Register it in DI. Depends on T008.
- [X] T010 [P] In `src/Copernica/Api/SpacesEndpoints.cs` `GetTreeAsync`, set the response header `X-Copernica-Commit: <head>`. In `src/web/src/pages/SpaceLayout.tsx` `useTree`, read the header and return `{ tree, commitId }`. Set `refetchOnWindowFocus: true` and `refetchInterval: 60_000` for this query only (research R14). Update the callers of `useTree`.
- [X] T011 [P] Add `src/web/src/api/treeApi.ts` with typed calls for `POST tree/move`, `tree/delete` and `tree/reorder` (contracts/api.md §1–3), each with a `dryRun` variant. It uses `api()` from `src/web/src/api/client.ts` and exposes `invalidateAfterTreeChange(queryClient, spaceId)`, which invalidates `['tree', spaceId]` and the page, history and discussion queries of the space.

**Checkpoint**: saves still work through `RepositoryWriter`. The resolver and trailers are
unit-tested, and the tree carries its commit id.

---

## Phase 3: User Story 1 - Rename and move a page (Priority: P1) 🎯 MVP

**Goal**: rename or move a single page from the tree or from the page. The change is one
attributed commit. Links in the space are updated, the old address redirects, and history
and discussions stay attached.

**Independent Test**: quickstart scenarios T1–T11.

### Tests for User Story 1

- [X] T012 [P] [US1] Add `tests/Copernica.Tests/Rendering/LinkRewriterTests.cs` (research R7). Given a move map and a page:
  - relative, `/`-rooted and `wiki:handbook/…` links to a moved page are rewritten, keeping their style;
  - `#fragment` and `?query` are kept;
  - `<…>` brackets are kept, and `%20` encoding is kept when the original used it;
  - reference definitions (`[x]: setup.md`) are rewritten;
  - image links to moved files are rewritten;
  - links in code spans, fenced code, autolinks, external URLs, raw HTML `<a href>` and `wiki:other-space/…` are untouched;
  - inside a moved page, relative links to targets that did not move are re-relativised (`../reference/api.md` → `api.md` after moving into `reference/`);
  - the output differs from the input only inside URL spans (assert by diffing).
- [X] T013 [P] [US1] Add `tests/Copernica.IntegrationTests/Tree/MovePageTests.cs` using `TestRemote`/`CopernicaFactory`/`WikiApi`. Extend `tests/Copernica.IntegrationTests/Infrastructure/WikiApi.cs` with `MoveAsync`, `DeleteFolderAsync` and `ReorderAsync`. Cases:
  - **One commit**: the rename produces exactly one commit on the remote, authored by the user, with message = description + blank line + `Copernica-Moved:` trailer, containing the rename plus the linking pages (SC-002, scenario T1).
  - **Dry run**: returns `moves`, `pageCount`, `fileCount` and `linkingPages`, and creates no commit.
  - **`retitle`** replaces only the first level-1 heading text.
  - **Validation**:
    - `target-exists` (409) when the target exists;
    - `invalid-move` (400) when `to == from`;
    - `validation` (400) for a bad name;
    - message rules: "1–500 characters".
  - **Case-only rename** `Setup.md` → `setup.md` succeeds (scenario T11).
  - **Concurrent edits**: a git push editing the moved page and a linking page between `base` and the move keeps both edits (FR-008, SC-007, scenario T8).
  - **Source deleted** by a concurrent push → `tree-changed` (409), and no commit (scenario T9).
  - **Auth**: a read-only user gets 403; anonymous gets 401; an out-of-sync or unavailable space gets 503.
- [X] T014 [P] [US1] Add `tests/Copernica.IntegrationTests/Tree/MovedPageFollowTests.cs`:
  - after a move, `GET pages/{old}` returns 404 with `type` `page-moved` and `currentPath` (also after 2 moves);
  - a deleted page returns `not-found` with `deletedIn`;
  - the discussions of the moved page are listed under the new path (SC-003);
  - history of the new path includes commits from before the move, also for `guides/tiny.md`, whose only line changed (scenario T6, research R5);
  - saving an edit with a `base` from before a concurrent move returns 200 with `path` = the new path, and nothing exists at the old path (research R6, scenario T10);
  - saving after a concurrent delete returns 409 `page-deleted` with `mineSource`.

### Implementation for User Story 1

- [X] T015 [US1] In `src/Copernica/Rendering/MarkdownRenderer.cs`, add `ParseWithSourceSpans(string markdown)`. It uses a second pipeline with the same extensions as rendering plus `UsePreciseSourceLocation()`, so link recognition matches rendering exactly.
- [X] T016 [US1] Implement `src/Copernica/Rendering/LinkRewriter.cs` per T012 and data-model.md "LinkRewrite":
  - `Rewrite(string markdown, string oldPagePath, string newPagePath, string spaceId, MoveMap map) → (string Text, bool Changed)`;
  - resolve targets with `WikiLinkRewriter.ResolvePath`;
  - splice `LinkInline.UrlSpan` and `LinkReferenceDefinition.UrlSpan` ranges from the end of the document to the start;
  - add a static `MayReference(string markdown, MoveMap map)` substring prefilter on moved file stems and folder names, raw and `%20`-encoded.

  Depends on T015.
- [X] T017 [US1] Create `src/Copernica/Spaces/TreeOperations.cs`:
  - the `MoveMap` type (data-model.md "Move map");
  - the Move plan for `kind: "page"`, run inside `RepositoryWriter` against the tip (research R1, R2). Steps:
    1. validate (the T013 rules; source must exist at tip and be a page at `base`);
    2. re-link the blob to `to` with `TreeDefinition`;
    3. apply `retitle` (replace the first-level-1 heading text, using the same detection rules as `PageTitle.FirstHeading`);
    4. batch-read the candidate linking pages via `MirrorRepository.ReadBlobs` and rewrite them with `LinkRewriter`;
    5. rewrite the moved page's own relative links;
    6. build the commit message with `MoveTrailers.Append`.
  - `DryRun` returns the same effects without committing.

  Depends on T006, T008, T016.
- [X] T018 [US1] Add `src/Copernica/Api/TreeEndpoints.cs` with `POST /spaces/{spaceId}/tree/move` (contracts/api.md §1):
  - request: `base` (full hex commit id), `kind`, `from`, `to`, `retitle?`, `message` ("1–500 characters; required unless `dryRun`"), `dryRun?`;
  - outcomes map to 200 / `validation` / `invalid-move` / `target-exists` / `tree-changed` / `push-rejected` / `hosting-unavailable` / `pat-required`, reusing the credential and outcome handling of `PageWriteService`;
  - on success, call `SpaceSynchronizer.MarkHeadAsync`.

  Map the endpoint in `src/Copernica/Api/ApiEndpoints.cs`.
- [X] T019 [US1] In `src/Copernica/Discussions/DiscussionService.cs`:
  - add `ApplyMovesAsync(Space, MoveMap, CancellationToken)`, which sets `PagePath` for every discussion whose page is in the map. Call it from the move endpoint after a successful push;
  - switch `FollowRenamesAsync` from `MirrorRepository.FindRename` to `MoveResolver.MovedBetween`.
- [X] T020 [US1] In `src/Copernica/Api/SpacesEndpoints.cs` `GetPageAsync`, when the page is missing, ask `MoveResolver.CurrentPath`:
  - **moved**: return 404 with `type` `page-moved`, `title` "This page has moved.", and extensions `currentPath` and `movedIn`;
  - **deleted**: return `not-found` with `deletedIn`;
  - **unknown**: return the plain `not-found`, as today.
- [X] T021 [US1] In `src/Copernica/Git/HistoryService.cs` `GetHistory`, stitch history across trailer moves (research R5). When the `QueryBy` sequence ends at a commit that added the path and that commit's trailers name the path as a target, continue with `MoveResolver.PreviousPath` from that commit's parent. The cursor stays an offset over the combined sequence.
- [X] T022 [US1] In `src/Copernica/Git/PageWriter.cs`, the save plan handles a page that moved or was deleted after the edit started (research R6):
  - **moved**: if the page is missing at tip and `MovedBetween` returns `Moved(newPath)`, build "mine" as base + the same rename + the user's content at `newPath`, then merge with the tip as today;
  - **deleted**: return the new `SaveOutcome.PageDeleted(mineSource)`.

  In `src/Copernica/Api/PageWriteEndpoints.cs`, add `Path` to `SaveResult`, and map `PageDeleted` to 409 `page-deleted` with `mineSource`.
- [X] T023 [P] [US1] Update `specs/001-git-backed-team-wiki/contracts/openapi.yaml`:
  - `POST /spaces/{spaceId}/tree/move` with its request and response schemas;
  - `SaveResult.path`;
  - the `page-moved` problem with `currentPath`/`movedIn`, and `deletedIn` on `not-found`;
  - the `page-deleted` problem;
  - the `X-Copernica-Commit` header on the tree.

  Regenerate `src/web/src/api/schema.d.ts` with `npm --prefix src/web run gen:api`.
- [X] T024 [P] [US1] Add `moveDraft(spaceId, oldPath, newPath)` to `src/web/src/drafts.ts`, with a unit test in `src/web/src/editor/editor.test.ts` or a new `src/web/src/drafts.test.ts`.
- [X] T025 [US1] Create `src/web/src/components/TreeItemMenu.tsx` (contracts/ui.md §1), built on `ui/Menu`:
  - **For this story**: Open, Rename…, Move…, Delete… (page). Later stories add their entries;
  - for users without write access, only Open is shown;
  - with write access in a read-only or out-of-sync space, write items are disabled with a one-line reason (FR-002).
- [X] T026 [US1] Extend `src/web/src/components/PageTree.tsx` and `PageTree.css`:
  - a row "⋯" button that appears on hover and focus (`tabIndex=-1`, label "Actions for <title>");
  - the menu also opens on right-click and on Shift+F10 / ContextMenu on the focused item;
  - the item gets `aria-haspopup="menu"`;
  - F2 → Rename and Delete → Delete for the focused item, honouring the single-key preference in `src/web/src/shortcuts/preference.ts`;
  - new props: `canWrite`, `writeDisabledReason`, `onAction(action, node)`;
  - expose `focusPath(path)` so that focus returns to the moved item after an operation (FR-022).
- [X] T027 [US1] Create `src/web/src/components/TreeDialogs.tsx` with `RenameDialog` and `MoveDialog` (contracts/ui.md §2–3):
  - **RenameDialog**: Title + derived File name when the page has a first heading (the title comes from `TreeNode.title`, which differs from the file-derived name), otherwise Name only;
  - **MoveDialog**: a filterable folder list including "Space root", with the current folder marked; optional Name;
  - **both**:
    - change description prefilled and kept in sync until edited;
    - a dry-run effects line, debounced 300 ms;
    - inline errors for `validation`/`target-exists`;
    - a callout for `tree-changed` (reload the tree), `push-rejected` and `hosting-unavailable`;
    - a busy primary button.

  The client-side name check mirrors research R15.
- [X] T028 [US1] Wire the dialogs in `src/web/src/pages/SpaceLayout.tsx`. After success:
  - call `invalidateAfterTreeChange`;
  - show the toasts from contracts/ui.md §7, including "Updated links in N pages";
  - if the moved page is open, `navigate(spaceRoute(newPath), { replace: true })` and call `moveDraft`;
  - expand the item's ancestors and focus the item.
- [X] T029 [US1] Add Rename… and Move… entries to `src/web/src/pages/PageActions.tsx`, opening the same dialogs (FR-003). Extend `src/web/src/pages/PageActions.test.tsx`.
- [X] T030 [US1] In `src/web/src/pages/PageView.tsx`:
  - **`page-moved`**: navigate with `replace` to `currentPath`, re-key the draft, and show a dismissible info Callout "This page was moved from “<old path>”." (pass the old path in navigation state);
  - **`not-found` with `deletedIn`**: show "It was deleted; you can view its history." with a link to `/-/history/<path>` at the parent version.
- [X] T031 [US1] In `src/web/src/pages/PageEdit.tsx`, handle saves on moved and deleted pages:
  - **moved** (`SaveResult.path` ≠ the edited path): replace the route, call `moveDraft`, and toast "Saved. The page had been moved to “<path>”.";
  - **deleted** (`page-deleted`): a Callout with "Save as a new page" (opens `NewPageDialog` prefilled with the old path and keeps the text) and "Copy text".
- [X] T032 [P] [US1] Add Vitest `src/web/src/components/PageTree.test.tsx`:
  - Shift+F10, ContextMenu and right-click open the menu;
  - F2 and Delete call `onAction`;
  - read-only users get no menu items beyond Open;
  - the roving tabindex is unchanged (one tab stop).
- [X] T033 [US1] Add `tests/e2e/us8-tree.spec.ts` with the automated parts of scenarios T1–T11. Scenario T11 is tagged to run on the Windows CI leg.

**Checkpoint**: US1 is shippable. Pages can be renamed and moved with links, redirects,
history and discussions intact.

---

## Phase 4: User Story 2 - Create pages and folders from the tree (Priority: P1)

**Goal**: "New page here" and "New folder" from tree and root menus. No empty folders are
left behind.

**Independent Test**: quickstart scenarios T12–T15.

- [X] T034 [P] [US2] Add Root and folder entries to `src/web/src/components/TreeItemMenu.tsx`: New page here… (page: its folder; folder: itself; root: `""`) and New folder… (folder and root). Add a root "⋯" menu next to "New page" in the `space-nav__head` of `src/web/src/pages/SpaceLayout.tsx`.
- [X] T035 [US2] Add `NewFolderDialog` to `src/web/src/components/TreeDialogs.tsx` (contracts/ui.md §5):
  - fields: Folder name, First page name (default `index`), validated per research R15;
  - Create navigates to `/s/<space>/-/new/<parent>/<folder>/<page>.md`;
  - nothing is committed until the save.

  Wire "New page here" to the existing `NewPageDialog` in `src/web/src/components/PageDialogs.tsx` with `folder` set.
- [X] T036 [US2] Extend `tests/e2e/us8-tree.spec.ts` with scenarios T12–T13: new folder + save, new folder + cancel leaves no folder, New page here. Scenarios T14 (a read-only user sees only Open) and T15 (out of sync disables actions) are covered by `src/web/src/components/PageTree.test.tsx` and the 403 integration tests, because plain git e2e spaces have no read-only users.

**Checkpoint**: US1 + US2 make up the P1 scope.

---

## Phase 5: User Story 3 - Rename, move and delete folders (Priority: P2)

**Goal**: folder rename and move (all contents, links, discussions), and folder delete with
a count check.

**Independent Test**: quickstart scenarios T16–T20.

### Tests for User Story 3

- [X] T037 [P] [US3] Add `tests/Copernica.IntegrationTests/Tree/FolderOperationsTests.cs`:
  - **Folder rename**: renaming a folder with nested pages, a subfolder and images is one commit with a `guides/ -> docs/` trailer;
  - **Links**: links from outside pages, and between pages inside the folder, all still resolve; a `service` space page linking `wiki:handbook/guides/faq.md` is unchanged, and the old address returns `page-moved`;
  - **Discussions** of all moved pages follow;
  - **Invalid moves**: moving into itself or into a subfolder gives `invalid-move`;
  - **Delete**:
    - the dry run returns `pageCount`/`fileCount`;
    - delete with a matching `expectedPageCount` is one commit, and the files stay reachable in history;
    - a mismatched count (a page pushed meanwhile) gives `tree-changed` with `pageCount` and no commit;
    - a missing folder gives `tree-changed`;
  - **Auth**: a read-only user gets 403 on both endpoints.

### Implementation for User Story 3

- [X] T038 [US3] Extend the Move plan in `src/Copernica/Spaces/TreeOperations.cs` for `kind: "folder"`:
  - re-link every blob under the prefix, including non-page files and the folder's own `.order`;
  - build the full `MoveMap` (per file) with one root trailer `old/ -> new/`;
  - rewrite links in outside pages and in the moved pages (links between moved pages that keep their relative form stay byte-identical);
  - reject `to` inside `from`.
- [X] T039 [US3] Add the DeleteFolder plan to `src/Copernica/Spaces/TreeOperations.cs`, and `POST /spaces/{spaceId}/tree/delete` to `src/Copernica/Api/TreeEndpoints.cs` (contracts/api.md §2):
  - request: `base`, `folder`, `expectedPageCount` (required unless `dryRun`), `message`, `dryRun?`;
  - remove all files under the folder;
  - discussions of removed pages are handled as for single-page delete in 001 (FR-016).
- [X] T040 [P] [US3] Add `tree/delete` and the folder `kind` to `specs/001-git-backed-team-wiki/contracts/openapi.yaml`, and regenerate `src/web/src/api/schema.d.ts`.
- [X] T041 [US3] Add folder entries to `src/web/src/components/TreeItemMenu.tsx` (Rename…, Move…, Delete…). Make `RenameDialog`/`MoveDialog` in `src/web/src/components/TreeDialogs.tsx` work for folders. In the Move dialog, disable the folder itself and its subfolders with the explanation "A folder cannot be moved into itself." (contracts/ui.md §3).
- [X] T042 [US3] Add `DeleteFolderDialog` to `src/web/src/components/TreeDialogs.tsx` (contracts/ui.md §4):
  - an `AlertDialog` with "This removes N pages and M other files. They stay available in the repository history.";
  - on `tree-changed` with a new `pageCount`, update the text and ask again;
  - after success, if the current page was inside the folder, navigate to the space home;
  - focus moves to the nearest neighbour or the parent.
- [X] T043 [US3] Extend `tests/e2e/us8-tree.spec.ts` with scenarios T16–T20.

---

## Phase 6: User Story 5 - Control the order of pages in the tree (Priority: P3)

**Goal**: Azure DevOps-compatible `.order` files are read into the tree, editable with Move
up/down, and maintained by every operation.

**Independent Test**: quickstart scenarios T22, T24–T28.

### Tests for User Story 5

- [X] T044 [P] [US5] Add `tests/Copernica.Tests/Spaces/FolderOrderTests.cs` per contracts/order-file.md:
  - **Parsing**: blank lines and whitespace are trimmed, a BOM is accepted, and both `\r\n` and `\n` work;
  - **Matching**: exact first, then case-insensitive; the first duplicate wins; unknown entries are ignored;
  - **Unlisted items** follow folders-then-pages alphabetically, and a page `X.md` and folder `X/` stay adjacent, page first;
  - **Ignored files**: more than "64 KiB" or invalid UTF-8;
  - **Minimal edits**: `Insert`/`Remove`/`Replace` keep the other lines byte-for-byte, and the line ending follows the first line;
  - **`Materialize`**, for the first reorder of a folder with no file, lists all children in display order and ends with a newline.
- [X] T045 [P] [US5] Extend `tests/Copernica.Tests/Spaces/PageTreeTests.cs`: `PageTreeBuilder` applies `.order` per folder (root included), `.order` is never a page, and a malformed `.order` falls back to alphabetical order.
- [X] T046 [P] [US5] Add `tests/Copernica.IntegrationTests/Tree/OrderTests.cs`:
  - reorder in a folder without `.order` creates one listing all items (one commit);
  - reorder with `before: null` moves to the end;
  - a no-op returns the head without a commit;
  - an `item`/`before` that is not a child gives `tree-changed`;
  - a concurrent push adding `guides/zeta.md` before the reorder: both survive (scenario T26);
  - create page appends to `.order`; create page in a new folder appends the folder to its parent's `.order`;
  - deleting a page removes its line; rename replaces it in place;
  - a move removes the entry from the source and appends it to the destination only if the destination has a file;
  - a folder without a file never gets one from create, delete, rename or move;
  - each of these happens in the operation's single commit (FR-021).

### Implementation for User Story 5

- [X] T047 [US5] Implement `src/Copernica/Spaces/FolderOrder.cs` per T044 and data-model.md "FolderOrder": `Parse(byte[])`, `Sort(children)`, `Insert(name, before?)`, `Remove(name)`, `Replace(old, new)`, `Materialize(children)`, `ToBytes()`.
- [X] T048 [US5] Apply `.order` in `src/Copernica/Spaces/PageTree.cs`:
  - `PageTreeService.GetTree` reads the `.order` blobs of the space at the commit (`MirrorRepository.ListBlobs` + `ReadBlobs`);
  - `PageTreeBuilder.Build` takes a `Func<string folder, FolderOrder?>` and uses `FolderOrder.Sort` in `MutableNode.ToNode`.
- [X] T049 [US5] Maintain `.order` in every write (research R8, FR-021):
  - **Move / DeleteFolder plans** in `src/Copernica/Spaces/TreeOperations.cs`: remove the entry from the source folder's file; append it to the destination folder's file if it exists; replace it in place on a same-folder rename; remove the folder's entry from its parent on delete;
  - **page create and delete plans** in `src/Copernica/Git/PageWriter.cs`: append the page on create, or append the top-most newly created folder to its parent's file; remove the line on delete.
- [X] T050 [US5] Add the Reorder plan to `src/Copernica/Spaces/TreeOperations.cs`, and `POST /spaces/{spaceId}/tree/reorder` to `src/Copernica/Api/TreeEndpoints.cs` (contracts/api.md §3):
  - request: `base`, `folder` (`""` = root), `item`, `before` (`null` = end), `message?`;
  - the default message is `Reorder <folder or "root">: move <item title> before <before title>`;
  - computed on the tip.

  Add it to `openapi.yaml` and regenerate `schema.d.ts`.
- [X] T051 [US5] Add Move up / Move down to `src/web/src/components/TreeItemMenu.tsx`: disabled at the first and last position, calling `tree/reorder` directly. Focus stays on the item, with a live region announcement and the toast "Moved up" / "Moved down" (contracts/ui.md §7).
- [X] T052 [US5] Extend `tests/e2e/us8-tree.spec.ts` with scenarios T24–T28 (scenario T22 comes with US4).

---

## Phase 7: User Story 4 - Reorganize by dragging, with a keyboard equivalent (Priority: P3)

**Goal**: native drag and drop to move into folders and to reorder within a folder. Mouse
only; keyboard and screen-reader users use the same menu actions.

**Independent Test**: quickstart scenarios T21, T22, T23, T29.

- [X] T053 [P] [US4] Create `src/web/src/components/treeDnd.ts` (research R11, contracts/ui.md §6). It contains pure functions:
  - `dropZone(rect, clientY, node)`:
    - `into` for the middle 50 % of folder rows;
    - `before`/`after` for the top and bottom quarter of rows, when the item is a sibling in the same folder;
    - `none` otherwise;
  - `isValidDrop(dragged, target, zone)`: the item itself, its own folder for `into`, and its own subtree are invalid;
  - an auto-expand timer (700 ms) and edge auto-scroll helpers.

  Add tests in `src/web/src/components/treeDnd.test.ts`.
- [X] T054 [US4] Wire native DnD in `src/web/src/components/PageTree.tsx` and `PageTree.css`:
  - `draggable` only when `canWrite` and `matchMedia('(pointer: fine)')`;
  - drop indicators: a folder highlight, an insertion line, and a not-allowed style;
  - Escape cancels;
  - an `into` drop opens `MoveDialog` with the destination preselected and focus on the primary button;
  - a `before`/`after` drop calls `tree/reorder`;
  - live region announcements for start, target and result;
  - the root header in `src/web/src/pages/SpaceLayout.tsx` is an `into` target for the root.
- [X] T055 [US4] Extend `tests/e2e/us8-tree.spec.ts` with scenarios T21, T22 and T23 (keyboard-only equivalent) and T29 (375 px viewport: long-press scrolls, no drag, "⋯" menu works).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T056 [P] Add F2, Delete and Shift+F10 to the "Page tree" group of the shortcut help in `src/web/src/shortcuts/index.ts` and `src/web/src/shortcuts/ShortcutHelp.tsx`, and extend `src/web/src/shortcuts/shortcuts.test.ts`.
- [X] T057 [P] Add `tests/perf/tree-move.mjs`, modelled on `tests/perf/run.mjs` (fast-import repository): a 5 000-page space, then move a 500-page folder with 200 linking pages via `tree/move`. It asserts under 10 s (SC-006) and prints the dry-run and commit timings.
- [X] T058 [P] Add the scenario T30 test (push rejected by branch policy → dialog callout, tree unchanged) to `tests/e2e/us8-tree.spec.ts`, simulating the rejection with `page.route`, as `tests/e2e/us1-state.spec.ts` (V6) does.
- [X] T059 [P] Extend `tests/e2e/a11y.spec.ts` with scenario T31: a WCAG scan with the item menu open, each dialog (Rename, Move, New folder, Delete folder), and a drag in progress, in both themes, with 0 violations (SC-005).
- [X] T060 [P] Update `SECURITY.md` "Files": repositories may gain `.order` files, and wiki move commits carry `Copernica-Moved:` trailers. Add an "Organizing pages" section to `README.md` under "User interface" covering rename/move with link updates, redirects, `.order` compatibility with Azure DevOps Wiki, and the shortcuts.
- [X] T061 Run `dotnet test`, `npm --prefix src/web test`, `npx --prefix tests/e2e playwright test --project=chromium` and `pwsh scripts/check-licenses.ps1`. Walk through the manual quickstart scenarios, and record results in `specs/005-page-tree-management/quickstart.md`. The PR description must call out the storage-format change (`.order` files, trailers), per the constitution's Quality Gates.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** blocks all stories.
  - Inside Phase 2, tests come first: T003, T004 and T005 before T007, T008 and T009.
  - T006 is independent of T007/T008, but every write plan needs it.
  - T008 → T009.
  - T010 and T011 are independent.
- **US1 (Phase 3)** needs Phase 2. It is the MVP.
  - T015 → T016 → T017 → T018 → T019/T020.
  - T021 and T022 need T009.
  - Client: T023 → T025 → T026 → T027 → T028, then T029–T031.
- **US2** needs T025 (menu) and T026 (tree wiring) from US1. It has no server work.
- **US3** needs US1's Move plan (T017) and endpoint (T018).
- **US5** needs Phase 2. T047 → T048. T049 needs T017, T039 and the `PageWriter` plan (T006). T050 needs T047.
- **US4** needs US1's `MoveDialog` (T027) and US5's reorder endpoint (T050).
- **Polish** comes after the stories you ship.

### Parallel opportunities

- Phase 2: T003, T004 and T005 in parallel. T007, T008, T010 and T011 in parallel.
- US1: the tests T012, T013 and T014 in parallel. T023 and T024 in parallel with the server tasks T015–T022.
- US3: T037 and T040 in parallel with T038.
- US5: T044, T045 and T046 in parallel. T047 can start any time after Phase 1.
- Polish: T056–T060 in parallel.

```bash
# Phase 2, after T001:
Task: "T003 NameValidationTests"   Task: "T004 MoveTrailersTests"   Task: "T005 MoveResolverTests"
# US1, tests first:
Task: "T012 LinkRewriterTests"     Task: "T013 MovePageTests"       Task: "T014 MovedPageFollowTests"
# US5, tests first:
Task: "T044 FolderOrderTests"      Task: "T045 PageTreeTests"       Task: "T046 OrderTests"
```

## Implementation Strategy

1. **MVP**: Phases 1–2, then US1. Pages can be renamed and moved from the tree and the page,
   with link updates, redirects, history and discussions. Validate scenarios T1–T11.
2. **US2**: create from the tree. Small, and it completes the P1 scope; ship it with US1 if
   possible.
3. **US3**: folder operations, reusing the Move plan.
4. **US5**: `.order`. The read path (T047, T048) alone already improves Azure DevOps Wiki
   repositories.
5. **US4**: drag and drop on top of Move and Reorder.
6. **Polish**: shortcuts help, perf, accessibility scan, docs, the regression run.
