# Implementation Plan: Paste and Drop Images into the Page Editor

**Branch**: `003-paste-images` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-paste-images/spec.md`

## Summary

Users paste, drop or pick images in the editor.

1. Each image is uploaded right away as a **pending image**: its bytes are kept on the
   data volume and its metadata in SQLite, owned by the user and tied to the edited page.
   A placeholder in the text is replaced by a relative Markdown reference.
2. The server-side preview shows the image through an owner-only URL.
3. On save, the server commits the page together with the images the text still
   references, in the existing one-commit save path. The three-way merge is unchanged.
4. Unsaved images expire after 24 hours of inactivity.

The storage folder is a per-space path template (`.attachments` by default). Root-relative
links in the style of Azure DevOps Wiki already work and get tests. There are no new
dependencies.

## Technical Context

**Language/Version**: C# 14 / .NET 10; TypeScript 5.9 (strict), React 19

**Primary Dependencies**: no new ones. ASP.NET Core multipart form binding,
LibGit2Sharp (existing), CodeMirror 6 event handlers (existing), `ui/` wrappers from 002.

**Storage**:
- new SQLite table `pending_images` (EF Core migration);
- new folder `<DataDirectory>/pending/`;
- committed images are ordinary files in the space repositories.

**Testing**:
- xUnit unit and integration (temp bare remotes, fake `TimeProvider` for expiry);
- Vitest;
- Playwright, with synthetic `ClipboardEvent`/`DragEvent` and `setInputFiles`;
- the 002 WCAG scan.

**Target Platform**: unchanged (self-contained binary; chiseled container on
Kubernetes/Docker; browsers per the constitution)

**Project Type**: web application (server + embedded SPA), one artifact

**Performance Goals**:
- a 2 MB image appears in the preview in < 2 s (SC-002);
- the save adds no more than the image bytes to the push;
- upload never blocks typing (FR-004).

**Constraints**:
- one commit per save;
- no outbound requests (no fetching of image URLs);
- data volume only (read-only root FS);
- strict CSP unchanged (no `blob:` or `data:` additions for previews);
- 10 MB per image and 200 MB of pending images per user by default.

**Scale/Scope**:
- 4 user stories, 17 FRs;
- 3 new endpoints or fields, 2 extended requests;
- 1 table and 1 background service;
- an editor toolbar, a dialog and the upload states.

No open unknowns. Decisions are in [research.md](research.md) R1–R9.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / rule | Status | Evidence |
|---|------------------|--------|----------|
| I | English artifacts | ✅ | Spec, plan, contracts and UI strings in English |
| II | No new egress; bundled assets; single command | ✅ | Images come only from the user's browser; image URLs found in pasted content are never fetched. No new service or asset |
| III | Auth on write paths; least privilege; safe content; transparency | ✅ | Upload requires write permission (as saving) and antiforgery. Pending images are owner-only. Formats are checked by content (magic bytes), the extension comes from the detected format, SVG is served sandboxed, everything gets `nosniff`. Size and quota limits. `SECURITY.md` lists the new files |
| III | Forbidden: user code execution, server-side URL fetching | ✅ | Neither: images are stored and served, never processed or executed. No URL fetching |
| IV | Dependencies | ✅ | None added (shipped or test) |
| V | Git is the source of truth; one commit per save; non-content data separate; derived data rebuildable; YAGNI | ✅ | Images reach git only in the page's save commit. Pending uploads are temporary non-content data on the data volume and never committed when abandoned. One template setting covers all layouts; no deduplication or image processing |
| Sec | Config via env/file; safest defaults; CSP; server-side rendering | ✅ | Settings under `Copernica:Attachments` (env-friendly); defaults are safe. Preview still rendered on the server, and the CSP is unchanged |
| QG | Tests: rendering/sanitization, auth on write paths, conflicts, storage | ✅ | Integration tests for upload auth, owner-only access, one-commit save with images, merge and conflict with images, link rendering, cleanup (research R9) |
| QG | Storage-format change must be called out | ⚠️ call out | New table and data folder; the repository layout gains image files. PR description and `SECURITY.md` must say so |

**Post-design re-check (after Phase 1)**: ✅ No violations.
- **Upload endpoint**: write-guarded, size-limited before reading, content-validated.
- **Upload URLs**: owner-only, `no-store`.
- **Save**: never overwrites existing repository files (`409 attachment-exists`), and
  never commits images the text doesn't reference.
- **Templates**: validated to stay inside the space; an invalid template only disables
  that space.

## Project Structure

### Documentation (this feature)

```text
specs/003-paste-images/
├── plan.md              # This file
├── research.md          # R1–R9
├── data-model.md        # PendingImage, AttachmentLocation, draft extension
├── quickstart.md        # P1–P17
├── contracts/
│   ├── api.md           # uploads endpoints; SavePageRequest/RenderRequest.attachments; /api/me limits
│   ├── configuration.md # Copernica:Attachments:*
│   └── ui.md            # editor toolbar, upload flow, alt-text dialog
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/Copernica/
├── Attachments/                     # new feature folder
│   ├── AttachmentOptions.cs         # Path, MaxBytes, MaxPendingBytesPerUser (+ per-space override)
│   ├── AttachmentLocation.cs        # template validation/expansion, relative link computation
│   ├── ImageFormat.cs               # magic-byte detection, extension mapping
│   ├── AttachmentNames.cs           # safe stem + random suffix
│   ├── PendingImage.cs              # entity
│   ├── PendingImageStore.cs         # create/get/touch/delete; quota; files under pending/
│   ├── PendingImageCleanup.cs       # hourly BackgroundService
│   ├── ReferencedImages.cs          # collect image targets from Markdown (Markdig) → space paths
│   └── UploadEndpoints.cs           # POST uploads, GET /api/uploads/{id}
├── Api/PageWriteEndpoints.cs        # SavePageRequest/RenderRequest.attachments
├── Git/PageWriter.cs                # PageChange.Files → same TreeDefinition; attachment-exists
├── Rendering/WikiLinkRewriter.cs    # optional pending-path → upload URL lookup
├── Spaces/SpaceOptions.cs           # Attachments.Path override; validation in SpaceRegistry
├── Data/CopernicaDbContext.cs       # DbSet<PendingImage> + migration AddPendingImages
└── Auth/AuthEndpoints.cs or Api     # /api/me uploads limits
src/web/src/
├── editor/                          # new
│   ├── imageInput.ts                # CodeMirror paste/drop handlers → files
│   ├── uploads.ts                   # XHR upload with progress + antiforgery; client pre-check
│   ├── placeholders.ts              # insert/replace/remove placeholder ranges
│   └── altText.ts                   # suggestion from file name
├── components/MarkdownEditor.tsx    # onFiles callback + exposes EditorView for insertion
├── pages/PageEdit.tsx               # toolbar, upload rows, errors, dialog queue, draft attachments
├── pages/ImageDescriptionDialog.tsx # "Describe the image"
├── drafts.ts                        # Draft.attachments
└── api/schema.d.ts                  # regenerated
tests/
├── Copernica.Tests/Attachments/     # ImageFormat, AttachmentNames, AttachmentLocation, ReferencedImages
├── Copernica.IntegrationTests/Attachments/  # upload, save, render, auth, cleanup, templates
└── e2e/us7-images.spec.ts           # P1–P17 automated parts (+ fixtures for images)
```

**Structure Decision**: a new `Attachments/` feature folder in the existing backend
project, following the feature-folder layout from 001. A small `editor/` folder in the
frontend keeps the CodeMirror integration out of `PageEdit.tsx`. No new projects.

## Delivery increments

1. **Server foundation**:
   - options and template validation;
   - format detection and names;
   - pending store, migration and cleanup;
   - upload and serve endpoints with tests.
2. **US1**:
   - `PageChange.Files` and save with `attachments`;
   - render with `attachments`;
   - editor paste/drop, placeholders and progress;
   - draft persistence;
   - e2e P1–P8 and P14–P16.
3. **US2**: *Insert image* button and the "Describe the image" dialog; e2e P9, P10, P17.
4. **US3**: per-space templates end to end; e2e P11, P12.
5. **US4**: tests locking in root-relative links and `.attachments` serving; P13.
6. **Polish**:
   - `SECURITY.md` (files written, upload rules);
   - configuration docs;
   - README "Images" section;
   - the OpenAPI update.

## Complexity Tracking

| Added complexity | Why needed | Simpler alternative rejected because |
|------------------|------------|--------------------------------------|
| Server-side pending store with expiry (table + folder + background sweep) | One commit per save (Principle V) forbids committing at paste time, and the preview must show images before the save | Uploading only at save time gives no preview. Browser-side storage is quota-limited, and the bytes would still have to travel in the save |
