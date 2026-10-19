# Data Model: Managing the Page Tree

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

There are no new SQLite tables or migrations. All new state lives in the content
repositories (`.order` files, commit trailers) or is derived from them. One existing column,
`Discussion.PagePath`, is updated by moves.

## TreeNode (existing, extended semantics)

`Spaces/PageTree.cs`, `GET /api/spaces/{id}/tree`.

| Field | Type | Notes |
|-------|------|-------|
| name | string | File or folder name (`setup.md`, `guides`) |
| path | string | Space-relative path |
| title | string? | Pages: first heading or file name |
| kind | `"page"` \| `"folder"` | |
| children | TreeNode[]? | Folders only. **Order now comes from the folder's `.order`** (see FolderOrder), otherwise as before |

There is no new field. The root node is a folder with `path: ""`.

## FolderOrder (new, derived)

`Spaces/FolderOrder.cs`. Parsed from `<folder>/.order` at the tree's commit.
Format: [contracts/order-file.md](contracts/order-file.md).

| Field | Type | Notes |
|-------|------|-------|
| Folder | string | Space-relative folder path (`""` = root) |
| Entries | string[] | Lines as written (trimmed, blanks dropped) |
| LineEnding | `"\n"` \| `"\r\n"` | Kept when the file is edited |

**Operations** (pure functions, unit-tested):
- `Sort(children)`: listed first in entry order, then unlisted in default order. A page and a
  folder with the same name stay adjacent, page first.
- `Insert(name, before?)`, `Remove(name)`, `Replace(old, new)`: minimal edits that keep the
  other lines byte-for-byte.
- `Materialize(children)`: a full listing for the first reorder of a folder with no file.

**Validation**: the file must be valid UTF-8 and at most 64 KiB, otherwise it is ignored.
Entries match an item exactly first, then case-insensitively. Unknown entries are kept on
edit and ignored on read.

## Tree operation (new, request-scoped)

`Spaces/TreeOperations.cs`. Each one becomes **exactly one commit** (FR-005), computed on
the fetched tip (research R1).

| Operation | Inputs | Effect on the tree at tip |
|-----------|--------|---------------------------|
| **Move** (incl. rename) | `from`, `kind`, `to`, `retitle?` | Re-links every blob under `from` to `to`; rewrites links (LinkRewrite); updates source and destination `.order`; optionally replaces the first heading |
| **DeleteFolder** | `folder` | Removes every file under `folder`; removes its entry from the parent `.order` |
| **Reorder** | `folder`, `item`, `before?` | Creates or edits `folder/.order` |
| **CreatePage** (existing save, base = null) | `path`, content | Adds the page; appends to the parent `.order` if present. If the page creates new folders, the top-most new folder is appended to its parent's `.order` if present |
| **DeletePage** (existing) | `path`, base | Removes the page; removes its entry from the parent `.order` |

**Validation** (fail with nothing changed):

| Rule | Problem |
|------|---------|
| `from` missing at tip, or a different kind than at `base` | `409 tree-changed` |
| `to` exists at tip (case-sensitive; a case-only rename of the same item is allowed) | `409 target-exists` |
| `to` equals `from`, or `to` is inside `from` (folder) | `400 invalid-move` |
| Names invalid (research R15) | `400 validation` |
| DeleteFolder: the page count under `folder` at tip differs from `expectedPageCount` | `409 tree-changed` (with the current count) |
| Reorder: `item` or `before` not a child of `folder` at tip | `409 tree-changed` |
| Message empty or longer than 500 characters | `400 validation` |

**Commit message**:
- the user's description;
- a blank line;
- then, for Move, one `Copernica-Moved: <old> -> <new>` trailer per moved root item
  (research R3).

## Move map (new, request-scoped)

| Field | Type | Notes |
|-------|------|-------|
| Entries | (old, new)[] | Every moved file path (pages and other files) |
| Roots | (old, new, kind)[] | The moved page or folder itself; written as trailers |

It is used by the link rewriter, by `.order` maintenance and by the discussion update after
the push.

## LinkRewrite (new, request-scoped)

`Rendering/LinkRewriter.cs`.

| Field | Type | Notes |
|-------|------|-------|
| PagePath | string | Page being edited (its new path if the page moved) |
| Edits | (span, oldUrl, newUrl)[] | Exact source ranges of URLs (Markdig precise locations) |
| ChangedPages | string[] | Pages, other than moved ones, whose content changes; the dry run reports these |

**Rules** (research R7):
- **Rewritten** when the resolved target is in the move map, or when the link is relative,
  inside a moved page, and its target did not move.
- **Kept**: link text, fragment, query, link style (relative, rooted, `wiki:`), angle
  brackets, encoding style.
- **Never touched**: code, autolinks, external URLs, raw HTML, links from other spaces.

## MoveRecord / MoveResolver (new, derived)

`Git/MoveResolver.cs`. It has no storage: results are cached per `(space, head, path)` in
`IMemoryCache`.

| Query | Result |
|-------|--------|
| `CurrentPath(path)` | `Moved(currentPath)` \| `Deleted(commitId)` \| `Unknown` |
| `PreviousPath(path, addedIn)` | Old path in the parent of `addedIn`, or null |
| `MovedBetween(path, base, tip)` | New path at tip, `Deleted`, or `Unchanged` |

**Sources**, in order:
1. the `Copernica-Moved` trailers of the relevant commit (a folder trailer maps a prefix);
2. rename detection on that commit's diff.

**Limits**: walk at most 10 000 commits and follow at most 20 hops. Cycles stop the walk.

## Discussion (existing, one column updated)

`Discussions/Discussion.cs`. After a successful Move push, `PagePath` is set to the new path
for every discussion whose page is in the move map (same request). Moves made outside the
wiki keep going through `FollowRenamesAsync`, which now uses `MoveResolver`. Anchors are not
touched here; they re-anchor on next listing, as after any content change.

## SaveResult (existing, extended)

| Field | Type | Notes |
|-------|------|-------|
| version | PageVersionRef | |
| merged | bool | |
| mergedAuthors | string[] | |
| **path** | string | **New.** Where the page was saved. It differs from the request path when the page was moved since the edit started (research R6) |

## Session draft (client, existing, re-keyed)

`src/web/src/drafts.ts`. When a save returns a different `path`, or the page view resolves
`page-moved`, the draft under the old key moves to the new key (`moveDraft(spaceId, old,
new)`).

## State: tree item actions (client)

| Space state | Write access | Actions shown |
|-------------|--------------|---------------|
| current | yes | all |
| read-only, out of sync, unavailable | yes | listed but disabled, with the reason (FR-002) |
| any | no | none (open only) |
