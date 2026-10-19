# Research: Managing the Page Tree

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-19

The spec has no open questions; its two clarifications are recorded there. These are the
design decisions. They build on the existing write path:
- `Git/PageWriter.cs`: space lock, fetch, one commit built in memory with
  `TreeDefinition`, push with the user's credentials, up to 3 attempts when the branch
  moves;
- `Discussions/DiscussionService.FollowRenamesAsync`: discussions follow renames made
  outside the wiki;
- `Git/HistoryService`: history follows renames through LibGit2Sharp `QueryBy(path)`.

---

## R1. One commit per tree operation, computed against the current tip

**Decision**: Move, rename, folder delete and reorder are **operations**. Each attempt of
the existing write loop applies the operation to the branch tip it just fetched, not to the
client's base commit. One attempt:
1. reads the tip tree;
2. validates the operation against it;
3. builds one new tree with `TreeDefinition` (moves are blob-id re-links, so no file content
   is read unless it must change);
4. commits once on top of the tip and pushes.

If the push is stale, the loop fetches again and recomputes. `PageWriter`'s
lock/fetch/commit/push loop moves into a shared `RepositoryWriter` that takes a "plan"
callback `(Repository, Commit tip) → TreeDefinition | outcome`. Page saves keep their
3-way merge plan, and tree operations add their own plans.

**Rationale**:
- A move by definition takes the current content. Recomputing on the tip means a concurrent
  edit of the moved page, of a linking page, or of an `.order` file is never overwritten
  (FR-008, SC-007), and no textual merge of `.order` files or link edits is needed.
- One commit per operation (FR-005, SC-002) comes for free.
- Case-only renames work on every platform, because nothing touches a working tree (the
  mirror is bare).

**Alternatives considered**:
- Build the commit on the client's base and 3-way merge it with the tip, as page saves do.
  This produces textual conflicts in `.order` files and in linking pages that are not real
  conflicts, and it gains nothing.
- A `git mv` in a working tree. The mirror is bare, a working tree costs disk and time, and
  case-only renames break on Windows and macOS.

## R2. What counts as a conflict for a tree operation

**Decision**: The client sends the commit its tree was loaded at (`base`). An operation is
rejected with `409 tree-changed` and changes nothing when, at the tip:
- the source no longer exists or is no longer the same kind (page or folder) as at `base`,
  for example because someone else moved or deleted it;
- for a folder delete: the folder's page count at the tip differs from the count the user
  confirmed (`expectedPageCount`). The user must see the real count before deleting
  (FR-015).

Other concurrent changes are kept and combined automatically: content edits of the moved
page, edits of linking pages, new pages elsewhere, `.order` edits. A target that already
exists at the tip gives `409 target-exists` (FR-007).

**Rationale**: This rejects exactly the cases where the user's intent no longer matches
reality, and silently combines everything else. It is the conflict rule the spec asks for
("safely combined or reported as a conflict").

**Alternatives considered**: Rejecting whenever anything under the source changed since
`base`. That gives frequent false conflicts on busy spaces and protects nothing extra,
because the move keeps the newer content anyway.

## R3. Recording moves: git rename detection plus a commit trailer

**Decision**: Wiki moves are unchanged blob re-links whenever possible, so git's own rename
detection (`git log --follow`, LibGit2Sharp `QueryBy`, `FindRename`) sees them as 100 %
renames. A moved page's content changes only when its relative links have to be adjusted
(R7) or when the user renames its title (R13), so the wiki also writes one **commit
trailer** per moved root item:

```
Move guides/setup.md to howto/install.md

Copernica-Moved: guides/setup.md -> howto/install.md
Copernica-Moved: guides/old/ -> archive/old/
```

- Space-relative paths, each segment percent-encoded as a URI data string (a space becomes
  `%20`). Encoded paths contain no spaces, so the ` -> ` separator is unambiguous.
- A folder ends in `/` and maps its whole prefix.
- The summary line is the user's change description; the trailer block is appended by the
  server and is not editable.

A **move resolver** (`Git/MoveResolver.cs`) answers "where is path P now?" and "what was
P called before commit C?". It reads the trailer of the commit that removed or added the
path, and falls back to rename detection on that one commit's diff, so moves made outside
the wiki also count.

**Rationale**:
- Rename detection stays the primary, tool-compatible mechanism.
- The trailer makes small pages robust: a three-line page whose one link changed can fall
  below git's 50 % similarity threshold.
- Trailers are plain commit text. The repository stays usable with ordinary git
  (Principle V), and the move record stays derived from history (spec assumption), not a
  second store.

**Alternatives considered**:
- A SQLite table of moves. It is a parallel authoritative record, misses moves pushed by
  another wiki instance or by hand, and is not rebuildable.
- Two commits (pure rename, then link edits). This breaks the one-commit rule (FR-005).
- Only rename detection. It fails exactly for the small pages described above.

## R4. Old addresses lead to the new location

**Decision**: `GET /api/spaces/{id}/pages/{path}` for a missing path asks the move
resolver:
1. Find the newest commit on the first-parent chain from head where the path stopped
   existing (bounded walk: 10 000 commits).
2. Map the path through that commit's trailer, or through rename detection on that commit.
3. Repeat from the new path until it exists at head (at most 20 hops; a cycle stops the
   walk).

If the walk ends at an existing page, the response is `404` with problem type
`page-moved` and `currentPath`. The SPA replaces the URL and shows "This page was moved
from …" (FR-010, SC-004). If the path was deleted, the `not-found` problem carries
`deletedIn` (the commit id), and the SPA links to the history as of its parent. Results
are cached per `(space, head, path)` in `IMemoryCache`, as trees are.

**Rationale**: No stored redirect table (derived data only), works for chains of moves and
for moves made outside the wiki, and costs nothing for pages that exist.

**Alternatives considered**: An HTTP redirect from the API (`301`). The SPA would follow it
silently and could not show the "moved" notice. A redirect on the HTML route has the same
problem.

## R5. History and discussions follow wiki moves

**Decision**:
- **History**: `HistoryService.GetHistory` keeps `QueryBy(path)` (similarity-based
  following). When the result ends at a commit that *added* the path and that commit's
  trailer names the path as a move target, it continues with the old path from that
  commit's parent. This covers pages whose content changed too much for rename detection.
  The cursor stays an offset over the stitched sequence.
- **Discussions**: after a successful push, the tree operation service updates
  `Discussion.PagePath` for every moved page from the exact move map, in the same request
  (FR-006, SC-003). `FollowRenamesAsync` keeps handling moves made outside the wiki. It
  switches from `FindRename` to the move resolver, so trailers count there too. Anchors
  re-anchor as on any content change. Discussions of pages removed by a folder delete
  behave as for a single-page delete in 001 (FR-016).

**Rationale**: Exact data is used when the wiki made the move; derived data is used when
someone else did.

## R6. Saving an edit whose page was moved meanwhile

**Decision**: Before building the save commit, `PageWriter` checks whether the page exists
at the base but not at the tip. If it does not exist at the tip, the move resolver looks up
the page's new path between base and tip:
- **Moved**: the "mine" commit is built as base + the same move + the user's content at the
  new path. Merged with the tip, both sides agree on the rename, so the merge is clean
  unless the content itself conflicts, which is handled as today. The result carries
  `path` (the new location). The editor then replaces its route, re-keys the session draft
  and tells the user the page was moved and the edit was saved there.
- **Deleted**: `409 page-deleted` with the user's text, so they can save it as a new page.
  Nothing is recreated at the old path.

**Rationale**: This covers two edge cases: edit and move in different tabs, and a draft
over a page someone else moved. The user's text is never lost.

## R7. Updating links in the same commit

**Decision**: `Rendering/LinkRewriter.cs` parses pages with the renderer's Markdig
extensions plus `UsePreciseSourceLocation()`, so that `LinkInline.UrlSpan` and
`LinkReferenceDefinition.UrlSpan` give exact source ranges. It replaces only the URL text,
splicing from the end of the document to the start.

- **Which links**: inline links, images, reference definitions, and `wiki:{this space}/…`
  links. A link is rewritten when its resolved target (resolved with
  `WikiLinkRewriter.ResolvePath`, the same rules as rendering) is a moved path (pages and
  other files moving with a folder). Inside the moved pages, relative links are also
  rewritten when the target did not move but the page did (FR-011, FR-012).
- **Style preserved**:
  - relative links stay relative (shortest `../` path);
  - `/`-rooted links stay rooted;
  - `wiki:` links stay `wiki:`;
  - `#fragment` and `?query` are kept;
  - `<…>` brackets are kept;
  - percent-encoding follows the original: if it used `%20`, the new link does too.
- **Not touched**: code spans and code blocks (they are not links in the Markdig tree),
  autolinks and external URLs, raw HTML `<a href>`, links from other spaces (spec
  assumption; old addresses redirect).
- **Cost**: page blobs are prefiltered with a substring check for any moved file stem or
  folder name, raw or encoded. Only candidates are parsed. Unchanged pages keep their blob
  id.
- **Dry run**: the same computation returns the list of pages that would change. The
  confirmation dialog shows the count ("3 other pages link here and will be updated").

**Rationale**: Exact spans guarantee that link text, formatting and surrounding Markdown
are byte-for-byte unchanged, and that nothing inside code is touched. Reusing
`ResolvePath` means "links that worked before still work" (SC-008), judged exactly as the
renderer judges them.

**Alternatives considered**:
- Regex replacement. It cannot tell code from text, or reference links from prose.
- Re-serialising the Markdig AST. It reformats the whole page.

## R8. `.order` files (Azure DevOps Wiki compatible)

**Decision**: The format is documented in [contracts/order-file.md](contracts/order-file.md).

**Reading** (`Spaces/FolderOrder.cs`, used by `PageTreeBuilder`):
- one entry per line; the line is trimmed and blank lines are ignored;
- an entry names a page by its file name without `.md`, or a subfolder by its name;
- matching is exact first, then case-insensitive;
- duplicate entries and unknown entries are ignored;
- listed items come first in file order;
- unlisted items follow in today's order: folders, then pages, each case-insensitive
  alphabetical;
- when a page and a folder share a name (the Azure DevOps subpage layout), the page comes
  first and the folder right after it.

A malformed file (binary, too large: more than 64 KiB) is ignored, so the folder falls back
to alphabetical order and the tree still loads. `.order` files never appear as pages
(FR-019).

**Writing**, always in the same commit as the operation that requires it (FR-021):
- **Reorder** creates the file if it is missing. It lists every current item in the
  displayed order, with the item moved.
- **Create** a page or folder in a folder that has a file: the entry is appended at the end,
  as Azure DevOps does.
- **Delete**: the line is removed.
- **Rename**: the line is replaced in place.
- **Move**: the entry is removed from the source file and appended to the destination file
  if it has one.
- Folders without a file are never given one by create, delete, rename or move. A folder's
  own `.order` moves or is deleted with the folder.
- Edits are minimal: the rest of the file is kept byte-for-byte, and the line ending
  follows the file's first line.

**Reordering**: `POST …/tree/reorder` takes the folder, the item, and the item it goes
before (or "end"). It is computed on the tip (R1), so a page added by someone else
meanwhile stays in the list (spec edge case).

**Rationale**: The same files Azure DevOps Wiki reads and writes, so a repository shared
with an Azure DevOps Wiki shows the same order in both (SC-009). Minimal edits keep diffs
reviewable.

**Alternatives considered**: An order field in front matter. Azure DevOps ignores it, and
it would add commits to every page in a folder.

## R9. API shape

**Decision**: Three new write endpoints under `/api/spaces/{spaceId}/tree/`:
`move` (also rename), `delete` (folders), `reorder`. Each takes
`{ base, message?, dryRun? }` plus its own fields; `dryRun: true` returns the effects
without committing, for the confirmation dialog. They use the existing write guard
(`RequireWriteAsync`), antiforgery and problem types, plus `tree-changed`,
`target-exists` and `invalid-move`.

The existing page `PUT` (create) and `DELETE` keep their shape, and gain `.order`
maintenance and the discussion update. `SaveResult` gains `path`, and `GET page` gains the
`page-moved` problem. Full contract: [contracts/api.md](contracts/api.md).

**Rationale**: One endpoint per user intent maps onto the dialogs and keeps validation
simple. A dry run on the same endpoint guarantees the confirmation shows what the commit
will actually do.

## R10. Actions in the tree (accessibility)

**Decision**: Every tree item gets an actions menu built from the existing `ui/Menu`
(Radix). It can be opened:
- with the visible "⋯" button that appears on hover and focus. It is `tabIndex=-1`, so the
  tree keeps one tab stop (WAI-ARIA tree pattern);
- by right-click;
- with **Shift+F10** or the **ContextMenu** key on the focused item. The item gets
  `aria-haspopup="menu"`.

Two shortcuts follow file-manager conventions: **F2** for rename and **Delete** for delete.
They are listed in the shortcut help (002). The space root's actions are in a "⋯" menu next
to "New page" in the navigation header.

The "Move" dialog uses a folder picker: a filterable list of the space's folders, with
invalid destinations disabled and explained (FR-007, US3-3). Focus goes back to the moved
or renamed item in the tree, or to the nearest neighbour after a delete (FR-022). Results
are announced through the existing live region and toasts.

**Rationale**: This meets 002's tree pattern, keeps keyboard and screen-reader users on
par with mouse users (FR-018, SC-005), and reuses existing components.

**Alternatives considered**:
- A focusable button inside each treeitem. That gives two tab stops per row and is invalid
  in the tree pattern.
- A separate "manage" mode. It adds friction for a frequent action.

## R11. Drag and drop without a new dependency

**Decision**: Native HTML5 drag and drop on tree items.
- Enabled only for users with write access, and only when `(pointer: fine)`. On touch the
  tree scrolls normally, and moving is done through the actions menu (US4-3).
- **Drop zones**: the middle of a folder row (or the root header) means "move into". The top
  or bottom quarter of a sibling in the same folder means "reorder before/after". Invalid
  targets (self, own folder for a move, own subtree) show a "not allowed" cursor and style.
- Hovering a collapsed folder for 700 ms expands it, and the tree auto-scrolls near its
  edges.
- **Dropping**: a move opens the Move confirmation prefilled (US4-1); a reorder commits
  directly with a default message, like Move up/down.
- Start, target and result are announced in the live region.

**Rationale**: Native DnD covers mouse users with zero bundle cost (Principle IV). Every
outcome stays reachable without dragging (FR-018).

**Alternatives considered**: `dnd-kit` or `react-dnd`. These add a shipped dependency for
behaviour a few dozen lines of native events provide; keyboard support is already covered
by the menu.

## R12. New pages and folders from the tree

**Decision**: No new server endpoint.
- **"New page here"** opens the existing `NewPageDialog` with `folder` set.
- **"New folder"** asks for the folder name and the first page name, then opens the editor
  at `/-/new/<folder>/<page>.md`.

The folder exists only once that page is saved, so nothing is left behind on cancel
(FR-014, US2-3). Saving a new page appends it to the parent's `.order` if there is one
(R8). The server creates the new folder's own entry in its parent's `.order`, if that file
exists.

## R13. Renaming changes the file name and, optionally, the title

**Decision**: The tree label is the page's first heading. If "Rename" only changed the file
name, the label would not change, which looks broken. When the page has a first-level
heading, the rename dialog shows a **Title** field prefilled with it and a derived
**File name** (spaces become hyphens, `.md` is added, as in the new-page dialog). The file
name can be edited, and stops following the title once edited. If the title changed, the
server replaces the heading text in the same commit (`retitle`). Without a heading, the
dialog edits only the file name.

**Rationale**: What users expect from "rename", within the spec assumption that the title
comes from the heading.

## R14. Refresh and performance

**Decision**:
- **Refresh**: the tree query refetches on window focus and every 60 s. Trees are cached per
  head commit on the server, so an unchanged tree is a cache hit. After the user's own
  operation, the client invalidates the tree, page, history and discussion queries (FR-009).
- **Folder of 500 pages** (SC-006): the operation re-links 500 blob ids in one
  `TreeDefinition`, which takes milliseconds. Link scanning reads page blobs in one batch
  through `MirrorRepository.ReadBlobs`, and the prefilter keeps parsing small. The push
  carries only new tree objects and the changed pages.
- **Perf test**: a fixture space of 5 000 pages; moving a folder of 500 pages with 200
  linking pages must finish in under 10 s. It is added to `tests/perf`.
- **Busy state**: the dialog stays open with a busy button until the response arrives.

## R15. Validation of names

**Decision**: Names come from dialogs, but the server validates them. The rules are
`SpacePaths.TryNormalize` plus extra checks for a single segment:
- no `/`, `\` or control characters;
- not `.` or `..`;
- not empty after trim;
- no leading or trailing spaces;
- no characters invalid on Windows file systems (`<>:"|?*`), so repositories stay
  checkoutable everywhere;
- at most 255 bytes;
- not `.order` (reserved).

Page names get `.md` if it is missing. The client applies the same rules to give
immediate feedback.
