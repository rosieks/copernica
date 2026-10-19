# API Contract: Managing the Page Tree

Extends [001 openapi.yaml](../../001-git-backed-team-wiki/contracts/openapi.yaml). All
write endpoints:
- require write access to the space (`RequireWriteAsync`), the same antiforgery token as
  page saves, and a non-`unavailable` space;
- return the existing problem types for `pat-required`, `push-rejected` and
  `hosting-unavailable`.

Problem `type` values are `urn:copernica:problem:<suffix>`.

Shared request fields:

| Field | Type | Notes |
|-------|------|-------|
| base | string | Commit id the client's tree was loaded at (full hex id) |
| message | string | 1–500 characters; required unless `dryRun` |
| dryRun | bool? | `true`: validate and report effects, commit nothing |

The tree response carries no commit id today. **`GET /api/spaces/{id}/tree` gains the
response header `X-Copernica-Commit: <head>`** so the client can send `base`.

---

## 1. `POST /api/spaces/{spaceId}/tree/move`

Rename or move a page or folder (US1, US3, US4).

**Request**

```json
{
  "base": "3f2a…",
  "kind": "page",
  "from": "guides/setup.md",
  "to": "howto/install.md",
  "retitle": "Installing the agent",
  "message": "Move guides/setup.md to howto/install.md",
  "dryRun": false
}
```

| Field | Notes |
|-------|-------|
| kind | `"page"` or `"folder"` |
| from / to | Space-relative. Pages end in `.md` (the client adds it). Folders have no trailing `/` |
| retitle | Pages only, optional. Replaces the text of the first level-1 heading (research R13) |

**200, dry run**

```json
{
  "moves": [{ "from": "guides/setup.md", "to": "howto/install.md" }],
  "pageCount": 1,
  "fileCount": 1,
  "linkingPages": ["index.md", "guides/faq.md"]
}
```

- `pageCount`, `fileCount`: pages and all files that move (a folder includes images and
  other files).
- `linkingPages`: other pages whose links will be updated (FR-011 confirmation).

**200, committed**

```json
{
  "commitId": "9b1c…",
  "path": "howto/install.md",
  "moves": [{ "from": "guides/setup.md", "to": "howto/install.md" }],
  "updatedPages": ["index.md", "guides/faq.md"]
}
```

`path` is the new path of the moved root item.

**Errors**

| Status | type | When |
|--------|------|------|
| 400 | `validation` | Invalid name or path, missing message (research R15) |
| 400 | `invalid-move` | `to` equals `from`, or a folder is moved into itself or a subfolder |
| 409 | `target-exists` | `to` exists at tip; `detail` names it |
| 409 | `tree-changed` | `from` no longer exists or changed kind since `base`; the client reloads the tree |
| 403 | `push-rejected` | Branch policy or permissions |
| 503 | `hosting-unavailable` | Fetch or push failed |

The commit has one parent (the tip) and is authored by the user. Its message is
`message` + `\n\n` + the `Copernica-Moved:` trailers.

## 2. `POST /api/spaces/{spaceId}/tree/delete`

Delete a folder with everything in it (US3, FR-015). Single pages keep using
`DELETE /pages/{path}`.

**Request**

```json
{ "base": "3f2a…", "folder": "archive/2019", "expectedPageCount": 42, "message": "Delete archive/2019", "dryRun": false }
```

- `expectedPageCount` is the count from the dry run that the user confirmed. If the tip has
  a different number of pages under the folder, the server returns `409 tree-changed` with
  `pageCount`.

**200, dry run**: `{ "pageCount": 42, "fileCount": 57 }`

**200, committed**: `{ "commitId": "…", "pageCount": 42 }`

**Errors**: `400 validation`, `409 tree-changed` (folder missing, or count differs:
extension `pageCount`), `403`, `503`.

## 3. `POST /api/spaces/{spaceId}/tree/reorder`

Change an item's position among its siblings (US5, FR-020).

**Request**

```json
{ "base": "3f2a…", "folder": "guides", "item": "setup.md", "before": "faq", "message": null }
```

| Field | Notes |
|-------|-------|
| folder | `""` for the space root |
| item | Child name as in `TreeNode.name` (`setup.md` or `api`) |
| before | Child name the item goes before; `null` = end |
| message | Optional; default `Reorder <folder or "root">: move <item title> before <before title>` |

**200**: `{ "commitId": "…" }`. A no-op (already there) returns the current head without a
commit.

**Errors**: `400 validation`, `409 tree-changed` (item or `before` not a child at tip),
`403`, `503`.

## 4. Changes to existing endpoints

### `GET /api/spaces/{spaceId}/pages/{path}`

When the path does not exist at the requested commit (head, or `version` if given), the
server asks the move resolver (research R4).

**404, moved**:

```json
{ "type": "urn:copernica:problem:page-moved", "title": "This page has moved.", "status": 404,
  "currentPath": "howto/install.md", "movedIn": "9b1c…" }
```

**404, deleted** (existing `not-found`, new extension):

```json
{ "type": "urn:copernica:problem:not-found", "status": 404, "deletedIn": "7aa0…", "lastVersion": "51c3…" }
```

`lastVersion` is the parent of `deletedIn`, where the page still exists; the page history is
opened from there (`GET history/{path}?version=<lastVersion>`). Without these extensions it is
the plain `not-found`, as today.

### `PUT /api/spaces/{spaceId}/pages/{path}` (save or create)

- **Response** `SaveResult` gains `path` (string, always present). It differs from the
  request path when the page was moved after the edit started (research R6).
- **New error**: `409 page-deleted`, when the page was deleted after the edit started. The
  extension `mineSource` carries the user's text.
- **Create** (`base` null) also appends the page, or its top-most new folder, to the
  parent's `.order` when that file exists.

### `DELETE /api/spaces/{spaceId}/pages/{path}`

- Also removes the page's entry from the parent `.order`, in the same commit.

### `GET /api/spaces/{spaceId}/history/{path}`

- No shape change. Entries continue across wiki moves even when rename detection would miss
  them (research R5). `PageVersion.path` shows the path at each version, as today.

### `GET /api/spaces/{spaceId}/tree`

- No shape change. Children follow `.order` (FR-019). New response header
  `X-Copernica-Commit`.
