# Data Model: Paste and Drop Images into the Page Editor

Additions to the 001 model ([data-model.md](../001-git-backed-team-wiki/data-model.md)).
Git remains the source of truth for committed images. Nothing here is written to a
repository before a save.

## PendingImage *(database, table `pending_images` + file `<DataDirectory>/pending/<Id>`)*

| Field | Type | Rules |
|-------|------|-------|
| `Id` | string (32 hex) | Random 128-bit; primary key; also the file name under `pending/` |
| `UserId` | string | FK → `users.Id`; owner; only the owner can read or use it (FR-010) |
| `SpaceId` | string | Space the upload was made for; the save must be for the same space |
| `PagePath` | string | Page the upload was made for (space-relative, `.md`); the save must be for the same page |
| `RepositoryPath` | string | Space-relative target path computed at upload time from the attachment location and file name, e.g. `.attachments/image-k3m9q2xa.png` |
| `OriginalName` | string | File name as uploaded (display only, ≤ 255 chars) |
| `ContentType` | enum | `image/png` \| `image/jpeg` \| `image/gif` \| `image/webp` \| `image/svg+xml`, **detected from content** (research R2) |
| `Size` | long | Bytes; `1 … Attachments.MaxBytes` |
| `CreatedAt` | timestamp | |
| `LastUsedAt` | timestamp | Set on upload; refreshed by render (preview) and by a failed save; drives cleanup |

Indexes: `(UserId, SpaceId, PagePath)`, `(LastUsedAt)`. Unique `(SpaceId, RepositoryPath)`
among pending rows, so two pending uploads never target the same path.

**Lifecycle**:

```text
uploaded ──(render / failed save: LastUsedAt = now)──▶ uploaded
uploaded ──(save succeeds, still referenced)──▶ committed  → row + file deleted
uploaded ──(save succeeds, not referenced)──▶ discarded    → row + file deleted
uploaded ──(LastUsedAt older than 24 h, hourly sweep)──▶ expired → row + file deleted
```

Constraints:
- the total `Size` per `UserId` is ≤ `Attachments.MaxPendingBytesPerUser` (default 200 MB);
- a pending image is used only by saves of the same user, space and page.

## AttachmentLocation *(configuration)*

| Setting | Type | Default | Rules |
|---------|------|---------|-------|
| `Copernica:Attachments:Path` | template | `.attachments` | Relative path template; tokens `{dir}`, `{page}` only; must expand inside the space (research R4) |
| `Copernica:Spaces:N:Attachments:Path` | template | *(inherits)* | Overrides the default for space N |
| `Copernica:Attachments:MaxBytes` | long | `10485760` (10 MB) | Per image; > 0 |
| `Copernica:Attachments:MaxPendingBytesPerUser` | long | `209715200` (200 MB) | > `MaxBytes` |

Effective folder = template expanded for the page, empty segments collapsed. The stored
path is `folder/name`.

## Editor draft *(browser `sessionStorage`, extends 001 `Draft`)*

| Field | Type | Rules |
|-------|------|-------|
| `attachments` | `{ id, repositoryPath, link, name }[]` | Pending images of this edit; sent with render and save; cleared with the draft after a successful save |

## Image reference *(Markdown in the page; not stored separately)*

`![<alt>](<link>)`. `link` is relative to the page (FR-015). When rendering, links starting
with `/` resolve from the space root (FR-016). An empty `alt` marks a decorative image
(FR-005).

## Relationships

```text
User 1 ── * PendingImage * ── 1 Space (config)
PendingImage ──(at save)──▶ blob in the space repository at RepositoryPath (one commit with the page)
```
