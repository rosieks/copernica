# API Changes: Paste and Drop Images

Changes to [001 openapi.yaml](../../001-git-backed-team-wiki/contracts/openapi.yaml), which
stays the single source for the generated client. These are applied to that file in the
implementation tasks. All new endpoints:
- sit behind the existing authentication;
- require the antiforgery header for state-changing requests;
- answer `404` for spaces the user cannot read, as in 001.

Design: [research.md](../research.md) R2–R5.

---

## 1. `POST /api/spaces/{spaceId}/uploads?page={path}` — new

Uploads one image as a **pending image** for a page edit.

- **Authorization**: write permission on the space (as saving, FR-011). Otherwise `403`
  (`no-write-permission`), or `404` if the space is not readable.
- **Request**: `multipart/form-data` with one part `file` (file name + bytes). `page` is
  the page being edited (space-relative, `.md`; it may not exist yet, for new pages).
- **Responses**:

| Status | Body | When |
|--------|------|------|
| `201` | `PendingUpload` | Stored |
| `400` | Problem `invalid-request` | No file part, more than one file, invalid `page` |
| `413` | Problem `attachment-too-large` (`detail` names the limit) | File over `Attachments.MaxBytes`, or the user's pending total would exceed `MaxPendingBytesPerUser` |
| `415` | Problem `unsupported-image` (`detail` names the accepted formats) | Content is not PNG, JPEG, GIF, WebP or SVG (detected from bytes) |
| `503` | Problem `space-unavailable` | Space has a configuration error (e.g. invalid attachment template) |

```yaml
PendingUpload:
  type: object
  required: [id, repositoryPath, link, name, contentType, size, previewUrl]
  properties:
    id: { type: string, pattern: '^[0-9a-f]{32}$' }
    repositoryPath: { type: string, description: Space-relative path the image will be committed to }
    link: { type: string, description: Relative link from the page, URL-encoded, e.g. "../.attachments/image-k3m9q2xa.png" }
    name: { type: string, description: Original file name }
    contentType: { type: string, enum: [image/png, image/jpeg, image/gif, image/webp, image/svg+xml] }
    size: { type: integer }
    previewUrl: { type: string, description: "/api/uploads/{id}" }
```

## 2. `GET /api/uploads/{id}` — new

Serves a pending image to its **owner** only. Everyone else gets `404`.

Headers:
- `Content-Type` is the detected type;
- `X-Content-Type-Options: nosniff`;
- `Cache-Control: private, no-store`;
- SVG also gets `Content-Security-Policy: sandbox`, as for repository files (001).

## 3. `PUT /api/spaces/{spaceId}/pages/{path}` — `SavePageRequest.attachments`

```yaml
SavePageRequest:
  properties:
    attachments:
      type: array
      items: { type: string, pattern: '^[0-9a-f]{32}$' }
      maxItems: 100
      description: >
        Pending images of this edit. Ids that are not the user's own, or belong to another
        space or page, are ignored. Only images whose repository path is referenced by an
        image in `markdown` are committed, in the same commit as the page.
```

- **Success (`200 SaveResult`)**: every listed pending image of the user is deleted. The
  committed ones are now repository files.
- **New failure** `409` Problem `attachment-exists`: a referenced pending image's path
  already exists in the base or the tip. Nothing is committed and the pending images are
  kept.
- **Other failures** (`409 edit-conflict`, `403 push-rejected`, `503`): pending images are
  kept and their `LastUsedAt` is refreshed.

## 4. `POST /api/render` — `RenderRequest.attachments`

```yaml
RenderRequest:
  properties:
    attachments:
      type: array
      items: { type: string }
      maxItems: 100
```

For the user's own pending images of that space and page, images in the Markdown that
resolve to their `repositoryPath` are rendered with `/api/uploads/{id}`. All other
behaviour is unchanged. The call refreshes `LastUsedAt` of those images.

## 5. `GET /api/me` — upload limits

```yaml
User:
  properties:
    uploads:
      type: object
      properties:
        maxBytes: { type: integer }
        formats: { type: array, items: { type: string } }
```

The client uses these for its early checks. The server check stays authoritative.

## Unchanged, now covered by tests

- `GET /api/spaces/{spaceId}/files/{path}` serves `.attachments/...` like any other path.
- Rendering resolves image targets starting with `/` from the space root (FR-016). Targets
  that escape the space become broken images.
