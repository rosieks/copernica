# Research: Paste and Drop Images into the Page Editor

Decisions behind [plan.md](plan.md). The stack, the save flow and the UI layer come from
001 ([research](../001-git-backed-team-wiki/research.md)) and 002
([research](../002-accessible-wiki-ui/research.md)). This feature adds **no new shipped
dependencies**.

## R1. Pending images: where they live until the page is saved (FR-006, FR-008–FR-010)

- **Decision**: an uploaded image is stored as a **pending image** on the data volume:
  - the bytes go to `<DataDirectory>/pending/<id>` (one file per image, `<id>` a random
    128-bit value in hex);
  - the metadata goes to a new SQLite table `pending_images` (data-model.md);
  - it is bound to **user + space + page path** and has a `LastUsedAt` timestamp.

  The client keeps the ids of the edit's pending images in the editor draft (the existing
  `sessionStorage` draft, 001), so a reload or re-sign-in restores them (FR-009). Only the
  owner can read or use a pending image (FR-010).
- **Rationale**:
  - The constitution requires one commit per save (V) and allows non-content data on the
    data volume, but forbids writing it to repositories early. Committing at paste time,
    as Azure DevOps Wiki does, would violate the rule.
  - Keeping the bytes in the browser (sessionStorage or IndexedDB) was rejected. Storage
    quotas are small and unreliable, and the server would still need the bytes at save
    time in the same request.
- **Alternatives**:
  - Upload together with the save, as one multipart request: no preview before saving, and
    large requests on every save.
  - A temporary git branch per edit: noise in the repository, and pushing it uses the
    user's credentials, so a write the user did not ask for.

## R2. Upload API and validation (FR-001, FR-003, FR-011, FR-012)

- **Decision**:
  - `POST /api/spaces/{spaceId}/uploads?page=<path>` takes a `multipart/form-data` body
    with one `file` part.
  - It requires **write** permission on the space (`PermissionService.RequireWriteAsync`,
    same as save) and the existing antiforgery header.
  - The per-request body limit is `Attachments.MaxBytes` plus a small allowance for the
    multipart framing. ASP.NET Core rejects larger bodies before they are read.
  - The response holds the pending id, the future repository path, the relative link from
    the page, and a URL for previewing the image.
- **Format check by content, not by name or client content type**:
  - PNG `89 50 4E 47 0D 0A 1A 0A`;
  - JPEG `FF D8 FF`;
  - GIF `GIF87a` / `GIF89a`;
  - WebP `RIFF????WEBP`;
  - SVG: valid UTF-8 whose first element, after an optional XML declaration, comments and
    whitespace, is `<svg`.

  The stored extension comes from the detected format. A mismatch with the uploaded file
  name is corrected, never trusted.
- **Names** (FR-012):
  - pasted images (generic clipboard names such as `image.png`) → `image-<suffix>.<ext>`;
  - dropped or picked files → `<safe-stem>-<suffix>.<ext>`.

  `safe-stem` is the original name lower-cased, with runs of characters other than
  `[a-z0-9._-]` replaced by `-`, trimmed to 60 characters, and never empty.
  `<suffix>` is 8 random base32 characters, about 40 bits. Collision is improbable, and
  the save still refuses to overwrite an existing path (R3).
- **Rationale**: magic-byte checks are the established defence against renamed
  executables. They also keep the "safe uploads" rule of constitution III without a new
  library: the checks are a few lines.
- **Alternatives**: an image decoding library to validate and re-encode. Rejected: a new
  shipped dependency (Principle IV) for little gain. Images are never executed, and SVG is
  already isolated (R7).

## R3. Committing the page and its images together (FR-007)

- **Decision**:
  - `PageChange` gains `IReadOnlyList<AddedFile> Files` (repository path + bytes).
  - `PageWriter.Prepare` adds them to the same `TreeDefinition` as the page blob, so they
    land in the one commit, with the same author and message.
  - The existing three-way merge (001 R5) covers them. They are new paths, so they never
    conflict with concurrent edits.
  - If a path already exists at the base or the tip, the save fails with
    `409 attachment-exists`, so nothing is ever overwritten. The client retries with a new
    upload.
  - `SavePageRequest` gains `attachments: string[]`, the pending ids of the edit. The
    server first keeps only the ids the user owns for the same space and page. Then, using
    the same link resolution as rendering (`WikiLinkRewriter`'s path combination), it
    collects every image target in the saved Markdown and **includes only the pending
    images whose repository path is referenced** (FR-007).
  - After a successful save, all pending images listed in the request are deleted,
    referenced or not: the edit is over. After a failed save (rejected, conflict,
    unavailable) they stay, so a retry or the resolved conflict includes them (spec edge
    cases).
- **Rationale**: one commit per save is a constitution rule (V) and 001 FR-011. Reusing the
  merge path keeps conflict handling unchanged.
- **Alternatives**: a separate commit for the images before the page commit. Violates the
  rule and leaves orphan images when the page commit fails.

## R4. Storage location templates and links (FR-013–FR-015)

- **Decision**: one setting, `Attachments:Path`, deployment-wide default `.attachments`,
  overridable per space (`Spaces:N:Attachments:Path`). It is a relative template with
  optional tokens:
  - `{dir}`: the page's folder, empty at the root;
  - `{page}`: the page path without `.md`, e.g. `guides/setup`.

  Examples:

  | Template | Page | Image folder |
  |----------|------|--------------|
  | `.attachments` (default) | `guides/setup.md` | `.attachments/` |
  | `images` | `guides/setup.md` | `images/` |
  | `{page}.assets` | `guides/setup.md` | `guides/setup.assets/` |
  | `{dir}` | `guides/setup.md` | `guides/` |
  | `{dir}/img` | `guides/setup.md` | `guides/img/` |

  - **Validation at startup**: the template is expanded for a root page and a nested page,
    and both results must pass `SpacePaths.TryNormalize` after collapsing empty segments
    (no `..`, no absolute paths, no backslashes). Unknown tokens are rejected. An invalid
    template makes **that space** fail with a configuration error, others start normally
    (001 FR-026; FR-014).
  - **Links**: the server computes the inserted link as the path from the page's folder to
    the image, with `../` steps and URL-encoded segments, e.g. `../.attachments/x.png` from
    `guides/setup.md`. Links are always relative (FR-015). The alternative text is set by
    the client.
- **Rationale**: one template covers all conventions found in practice (Azure DevOps Wiki,
  docs-site folders, Typora-style per-page folders) with one option and no mode switches.
- **Alternatives**: separate `Mode` and `Folder` options, rejected as more configuration
  for the same result. A configurable link style, rejected: relative links work
  everywhere (spec Assumptions).

## R5. Showing pending images in the preview (FR-002)

- **Decision**:
  - `RenderRequest` gains `attachments: string[]`. The render endpoint resolves the user's
    pending images for that space and page into a map `repository path → /api/uploads/{id}`.
  - `WikiLinkRewriter` takes an optional lookup and, for images whose resolved path is in
    the map, emits the upload URL instead of the `files` URL.
  - The same call refreshes `LastUsedAt` of those images, which keeps an active edit alive
    (R8).
  - `GET /api/uploads/{id}` serves the bytes to the owner only. Others get `404`, as for
    unreadable spaces. The headers follow 001's file rules (R7).
- **Rationale**: the preview keeps using the one server-side renderer (constitution:
  Markdown is rendered and sanitized in one place). The client never builds image HTML
  itself.
- **Alternatives**: object URLs (`blob:`) in the preview. These need `img-src blob:` in the
  CSP and bypass the server renderer; rejected.

## R6. Editor integration (FR-001, FR-002, FR-004, FR-005)

- **Decision**:
  - **Input**: CodeMirror `EditorView.domEventHandlers({ paste, drop, dragover })`. They
    handle `clipboardData.files` / `items` of kind `file` with an image type, and
    `dataTransfer.files`. Anything else falls through to the default paste or drop, so
    text pasting is unchanged.
  - **Placeholder**: at the cursor or drop position (`posAtCoords`), insert a unique
    placeholder text `![Uploading image-1…]()`. CodeMirror maps it through later edits, so
    typing never blocks. When the upload finishes, the placeholder range is replaced with
    `![<alt>](<link>)`; on failure it is removed.
  - **Upload with progress**: `XMLHttpRequest` (the Fetch API has no upload progress). It
    sends the same antiforgery header as `api()`. Progress goes to a polite live region
    and an inline progress bar under the editor ("Uploading screenshot.png — 40 %"). Errors
    appear as an inline danger Callout that stays until dismissed (002 R8) and lists every
    rejected file with its reason.
  - **Client-side pre-check**: the accepted extension and MIME list, and the size limit
    (from `/api/me`, see contracts). It rejects early with the same messages as the
    server. The server check stays authoritative.
  - **"Insert image"**: a toolbar `Button` above the editor (`ImageIcon`) that opens a
    hidden `<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" multiple>`.
    It is the keyboard alternative to paste and drop (FR-001; WCAG 2.1.1).
  - **Alternative text** (FR-005): after each successful upload, a `ui/Dialog` "Describe
    the image" with:
    - a `Field` pre-filled from the file name (`image-…` → "Image"; `network-diagram.png`
      → "Network diagram");
    - a "Decorative image (no description)" checkbox;
    - *Insert*.

    Several files are described one after another. Escape keeps the suggestion. Focus
    returns to the editor after the inserted reference (`EditorView.focus()` +
    selection).
  - **Draft**: `Draft` (001 `drafts.ts`) gains `attachments: { id, path, link, name }[]`.
    Uploads are added to it; it is sent with save and render requests and cleared with the
    draft on a successful save.
- **Rationale**: everything uses existing primitives (CodeMirror, `ui/` wrappers, the live
  region and Callout patterns of 002). No new library.
- **Alternatives**: a separate upload drop zone outside the editor. It is less direct and
  duplicates what paste and drop already cover.

## R7. Displaying stored and root-relative images (FR-016, FR-017)

- **Findings** (001 code):
  - `WikiLinkRewriter` already resolves targets that start with `/` from the **space**
    root (it does not prepend the page folder), and returns a broken link for paths that
    escape the space. So `/.attachments/x.png` works today.
  - `SpacePaths.TryNormalize` accepts dot-folders such as `.attachments`, and the files
    endpoint serves images inline with `nosniff` and SVG with `CSP: sandbox`.
- **Decision**: no change in behaviour. Add **tests** that lock it in:
  - root-relative images in a space with a folder;
  - escaping attempts;
  - `.attachments` being served.

  `GET /api/uploads/{id}` reuses the same header rules (inline for the five accepted
  formats, `sandbox` CSP for SVG, `nosniff`, `Cache-Control: private, no-store`).
- **Rationale**: US4 is satisfied by 001's design. The work is verification.

## R8. Cleanup of abandoned uploads (FR-008, SC-004)

- **Decision**: a `PendingImageCleanup` `BackgroundService` runs every hour. It deletes
  rows with `LastUsedAt < now − 24 h` and their files.
  - `LastUsedAt` is refreshed on upload, render (preview) and failed save.
  - Files without a row (left by a crash between the file write and the insert) are
    removed when older than 24 h.
  - Startup runs one pass immediately.
  - The total pending size per user is capped at 200 MB (`Attachments:MaxPendingBytesPerUser`).
    Further uploads get `413` with a clear message, which stops one user from filling the
    volume.
- **Rationale**: SC-004 asks for removal within 24 hours. An hourly sweep after 24 h of
  inactivity removes them in at most 25 h after the last use. The requirement counts from
  the last activity, so this is acceptable and stated in the quickstart.

  *Plan clarification*: FR-008's "within 24 hours of the last activity" is implemented as
  "eligible after 24 h of inactivity, removed by the next hourly sweep". The tasks must
  keep the sweep interval at ≤ 1 h.
- **Alternatives**: cleanup only on startup, rejected because single-replica deployments
  may run for months. A timer per image, rejected as needless complexity.

## R9. Testing

- **Unit** (xUnit):
  - format detection: valid and invalid signatures, renamed executables, SVG with a BOM,
    an XML declaration, or HTML posing as SVG;
  - name sanitizing and suffixes;
  - template expansion, validation and link computation;
  - referenced-image collection from Markdown.
- **Integration** (temp bare remotes, as in 001):
  - upload → render shows the upload URL → save gives **one commit** with page + images
    (author, message);
  - unreferenced images are not committed;
  - a read-only user's upload → 403/404;
  - another user cannot read or use someone's pending image;
  - oversize → 413, wrong type → 415;
  - a template outside the space → that space errors and others work;
  - a concurrent edit is merged with images included;
  - a conflict, then the resolved save includes the images;
  - an existing path → 409 `attachment-exists`;
  - cleanup removes stale rows and files (`TimeProvider` fake);
  - root-relative and `.attachments` links render and serve.
- **Vitest**: paste and drop handler routing (image vs text), placeholder replacement and
  removal, the alt-text suggestion from file names, client pre-check messages.
- **Playwright**: scenarios in [quickstart.md](quickstart.md). Paste is simulated by
  dispatching a `ClipboardEvent` with a `DataTransfer` containing a `File`. Drop uses a
  `DragEvent` with a `DataTransfer`, and the file picker uses `setInputFiles`. The 002 WCAG
  scan is extended to the alt-text dialog and the upload progress and error states.
