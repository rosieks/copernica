---

description: "Task list for 003 Paste and Drop Images into the Page Editor"
---

# Tasks: Paste and Drop Images into the Page Editor

**Input**: Design documents from `specs/003-paste-images/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[contracts/configuration.md](contracts/configuration.md), [contracts/ui.md](contracts/ui.md),
[quickstart.md](quickstart.md)

**Tests**: Included. The constitution's Quality Gates require tests for write paths
(upload, save), auth, conflict handling and storage. SC-003, SC-004 and SC-006 need
automated checks. Scenario IDs P1–P17 refer to [quickstart.md](quickstart.md).

**Organization**: tasks are grouped by user story (US1–US4 from spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to

Conventions:
- server code goes in `src/Copernica`, frontend in `src/web/src`;
- UI follows [002 ui.md](../002-accessible-wiki-ui/contracts/ui.md) (only `ui/` wrappers,
  tokens, English strings);
- no new dependencies;
- Python edits to source files must use `encoding='utf-8'`.

---

## Phase 1: Setup

- [X] T001 Create the folders `src/Copernica/Attachments/`, `src/web/src/editor/`, `tests/Copernica.Tests/Attachments/`, `tests/Copernica.IntegrationTests/Attachments/` and `tests/e2e/fixtures/images/`. Add test images to the last one, generated in a script or committed small:
  - `screenshot.png` (≈ 50 KB);
  - `photo.jpg`;
  - `anim.gif` (2 frames);
  - `diagram.svg`;
  - `fake.png` (bytes `MZ` + random, i.e. a renamed executable);
  - `notes.txt`.

  Generate the 11 MB `big.png` at test time instead of committing it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: options, format detection, names, locations, the pending store and the upload
endpoints, which every story needs.

### Tests first

- [X] T002 [P] Add `tests/Copernica.Tests/Attachments/ImageFormatTests.cs`:
  - PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, GIF `GIF87a`/`GIF89a` and WebP `RIFF????WEBP` are detected;
  - SVG is detected with an optional UTF-8 BOM, an XML declaration, comments and whitespace before `<svg`;
  - HTML (`<html>`), an `MZ` executable named `.png`, empty input and truncated headers are rejected;
  - the extension follows the detected format, not the file name.
- [X] T003 [P] Add `tests/Copernica.Tests/Attachments/AttachmentNamesTests.cs`:
  - a generic clipboard name (`image.png`, `blob`, empty) → `image-<suffix>.<ext>`;
  - `Network Diagram (v2).PNG` → `network-diagram-v2-<suffix>.png`;
  - the stem is trimmed to 60 characters and never empty;
  - the suffix is 8 base32 characters, lower case `[a-z2-7]`;
  - two calls give different suffixes.
- [X] T004 [P] Add `tests/Copernica.Tests/Attachments/AttachmentLocationTests.cs`. Templates `.attachments`, `images`, `{page}.assets`, `{dir}` and `{dir}/img` are expanded for `index.md` and `guides/setup.md`, as in the research R4 table, with empty segments collapsed.
  - **Validation** rejects `..`, `../x`, `/abs`, `a\b`, `{unknown}` and empty strings.
  - **Links** from `guides/setup.md` to `.attachments/x y.png` give `../.attachments/x%20y.png`; from `index.md` to `images/a.png` give `images/a.png`; from `guides/setup.md` to `guides/setup.assets/a.png` give `setup.assets/a.png`.

### Implementation

- [X] T005 Create `src/Copernica/Attachments/AttachmentOptions.cs`:
  - `Path` = `".attachments"`, `MaxBytes` = `10485760`, `MaxPendingBytesPerUser` = `209715200`;
  - add `public AttachmentOptions Attachments { get; set; } = new();` to `CopernicaOptions` (`src/Copernica/Configuration/CopernicaOptions.cs`);
  - add `public SpaceAttachmentOptions Attachments { get; set; } = new();` with a nullable `Path` to `SpaceOptions` (`src/Copernica/Spaces/SpaceOptions.cs`);
  - validate in `CopernicaOptionsValidator` that `MaxBytes > 0` and `MaxPendingBytesPerUser > MaxBytes`.
- [X] T006 [P] Create `src/Copernica/Attachments/ImageFormat.cs`:
  - `static ImageFormat? Detect(ReadOnlySpan<byte> head)` returns `Png|Jpeg|Gif|Webp|Svg` with `ContentType` and `Extension`;
  - SVG check: valid UTF-8 in the first 4 KB, then optional BOM, `<?xml …?>`, `<!-- … -->` and whitespace, then `<svg` (case-insensitive) as the first element.

  Make T002 pass.
- [X] T007 [P] Create `src/Copernica/Attachments/AttachmentNames.cs`:
  - `Create(string? originalName, ImageFormat format)` follows research R2;
  - the suffix comes from `RandomNumberGenerator`, 5 bytes → base32.

  Make T003 pass.
- [X] T008 Create `src/Copernica/Attachments/AttachmentLocation.cs`:
  - `static bool TryParse(string template, out AttachmentLocation location, out string error)` allows only the tokens `{dir}` and `{page}`, and validates that the template expands to normalized paths for `x.md` and `a/b/x.md` (`SpacePaths.TryNormalize` after collapsing empty segments);
  - `string FolderFor(string pagePath)`;
  - `string PathFor(string pagePath, string fileName)`;
  - `static string RelativeLink(string fromPagePath, string toPath)`, URL-encoded per segment.

  Make T004 pass.
- [X] T009 Wire the effective location into `Space` (`src/Copernica/Spaces/Space.cs`):
  - `Space.CreateAll(options, dataDirectory)` gains a `string defaultAttachmentPath` parameter; update its caller (find it with grep);
  - each space resolves `o.Attachments.Path ?? defaultAttachmentPath` with `AttachmentLocation.TryParse`;
  - on failure, add `"Attachments:Path '<value>' is invalid: <error>."` to `errors`, which makes that space unavailable (001 FR-026; FR-014);
  - expose `public AttachmentLocation Attachments { get; }`.
- [X] T010 Create the entity `src/Copernica/Attachments/PendingImage.cs` with the fields of data-model.md:
  - `Id` string (32 hex), `UserId`, `SpaceId`, `PagePath`, `RepositoryPath`;
  - `OriginalName` ≤ 255 chars;
  - `ContentType` (one of `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`);
  - `Size` long, `CreatedAt`, `LastUsedAt`.

  Register `DbSet<PendingImage> PendingImages` in `src/Copernica/Data/CopernicaDbContext.cs`:
  - table `pending_images`;
  - indexes `(UserId, SpaceId, PagePath)` and `(LastUsedAt)`;
  - unique `(SpaceId, RepositoryPath)`.

  Add the migration with `dotnet tool run dotnet-ef migrations add AddPendingImages --project src/Copernica --output-dir Data/Migrations`.
- [X] T011 Create `src/Copernica/Attachments/PendingImageStore.cs` (singleton or scoped, matching the `DiscussionService` style). The pending folder is `<DataDirectory>/pending/` and is created on start.
  - `CreateAsync(user, space, pagePath, originalName, Stream content)`:
    - reads at most `MaxBytes + 1` bytes and rejects with a `TooLarge` result beyond `MaxBytes`;
    - checks the user's current total plus the new size against `MaxPendingBytesPerUser` (`QuotaExceeded`);
    - detects the format (`Unsupported`);
    - names the file (T007) and computes `RepositoryPath` via `space.Attachments.PathFor`;
    - writes `pending/<id>` to a temp name, then moves it into place, then inserts the row.
  - `GetOwnedAsync(user, id)`.
  - `ResolveAsync(user, spaceId, pagePath, ids)` returns only owned rows of that space and page, and touches `LastUsedAt`.
  - `TouchAsync(ids)`, `DeleteAsync(ids)`, `OpenRead(id)`.

  Use `TimeProvider` for timestamps.
- [X] T012 Create `src/Copernica/Attachments/PendingImageCleanup.cs`, a `BackgroundService`:
  - it runs once at start and then every **1 hour** (keep it ≤ 1 h; research R8);
  - it deletes rows with `LastUsedAt < now − 24 h` and their files, plus files in `pending/` without a row that are older than 24 h;
  - it logs counts at Information level.

  Register it with `builder.Services.AddHostedService<PendingImageCleanup>()` in `src/Copernica/Program.cs`, next to `SpaceSyncService`.
- [X] T013 Create `src/Copernica/Attachments/UploadEndpoints.cs` and map it in `Program.cs` with the other API groups. Behaviour per contracts/api.md §1–2:
  - **`POST /api/spaces/{spaceId}/uploads?page=`**:
    - `RequireWriteAsync`, page validated with `SpacePaths.TryNormalizePage`;
    - exactly one form file `file` (`400`);
    - body limit via `.WithMetadata(new RequestSizeLimitAttribute(MaxBytes + 65536))` or `IHttpMaxRequestBodySizeFeature`;
    - results `413 attachment-too-large` (detail "Images can be at most N MB."), `415 unsupported-image` (detail "Only PNG, JPEG, GIF, WebP and SVG images are accepted."), `503` for a space with configuration errors;
    - `201 PendingUpload { id, repositoryPath, link, name, contentType, size, previewUrl }`, where `link` = `AttachmentLocation.RelativeLink(page, repositoryPath)`.
  - **`GET /api/uploads/{id}`**:
    - `404` unless owned;
    - headers `Content-Type` (detected), `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, and `Content-Security-Policy: sandbox` for SVG.
  - Add the problem types to `src/Copernica/Api/ProblemTypes.cs`.
- [X] T014 Add `uploads: { maxBytes, formats: ["image/png","image/jpeg","image/gif","image/webp","image/svg+xml"] }` to the `/api/me` response in `src/Copernica/Api/SpacesEndpoints.cs`.
- [X] T015 Update `specs/001-git-backed-team-wiki/contracts/openapi.yaml` per contracts/api.md:
  - new paths `/spaces/{spaceId}/uploads` and `/uploads/{id}`, schema `PendingUpload`;
  - `SavePageRequest.attachments` and `RenderRequest.attachments` (`maxItems: 100`);
  - `User.uploads`;
  - problem `attachment-exists`.

  Regenerate with `npm --prefix src/web run gen:api`.
- [X] T016 [P] Add `tests/Copernica.IntegrationTests/Attachments/UploadTests.cs` (factory with one `Git` space, as in `Editing/SaveTests.cs`):
  - upload a PNG → `201` with `repositoryPath` `.attachments/image-*.png` and `link` `../.attachments/…` for page `guides/a.md`;
  - `GET previewUrl` as the owner gives `200` with the PNG bytes and `nosniff`, and as bob `404`;
  - read-only bob (`Hosting.Set("bob", …, CanWrite: false)`) → `403`;
  - 11 MB → `413`; `fake.png` → `415`; `notes.txt` → `415`;
  - quota: set `MaxPendingBytesPerUser` low and exceed it → `413`;
  - SVG preview has `Content-Security-Policy: sandbox`;
  - a missing antiforgery header → `400` (as in `SecurityHeadersTests`);
  - a space with `Attachments:Path=../x` is unavailable while the others work.
- [X] T017 [P] Add `tests/Copernica.IntegrationTests/Attachments/CleanupTests.cs`: with a fake `TimeProvider`, a pending row with `LastUsedAt` 25 h ago and its file are removed by one cleanup pass, a 23 h old one is kept, and an orphan file older than 24 h is removed.

**Checkpoint**: uploads can be stored, served to their owner and expire; nothing is
committed yet.

---

## Phase 3: User Story 1 - Paste or drop an image while editing (Priority: P1) 🎯 MVP

**Goal**: paste or drop an image, see it in the preview, and save it together with the
page in one commit.

**Independent Test**: P1–P8 and P14–P16 in quickstart.md.

### Tests for User Story 1

- [X] T018 [P] [US1] Add `tests/Copernica.Tests/Attachments/ReferencedImagesTests.cs`. `ReferencedImages.Collect(markdown, pagePath)` returns space paths for:
  - `![a](../.attachments/x.png)`;
  - `![a](/.attachments/y.png)` (root-relative);
  - reference-style images.

  It ignores raw HTML `<img src>` (sanitized HTML, not an inserted reference form), absolute URLs, `wiki:` links, and paths escaping the space.
- [X] T019 [P] [US1] Add `tests/Copernica.IntegrationTests/Attachments/SaveWithImagesTests.cs`:
  - upload two images, save Markdown referencing one of them with `attachments: [both]`:
    - exactly **one** new commit on the remote (`TestRemote.Log()`), author Alice, the save's message;
    - the tree contains the page and the referenced image with the uploaded bytes;
    - the unreferenced image is absent;
    - both pending rows and files are gone afterwards;
  - another user's pending id in `attachments` is ignored;
  - an id of another page is ignored;
  - a concurrent non-overlapping edit is merged, and the image is included;
  - a conflict (`409 edit-conflict`) keeps the pending rows, and the resolved save includes the image;
  - a pre-existing file at the `RepositoryPath` (commit it to the remote first) gives `409 attachment-exists`, nothing is committed and the pending row is kept;
  - render with `attachments` returns HTML whose `<img src>` is `/api/uploads/{id}`, and touches `LastUsedAt`.
- [X] T020 [P] [US1] Add `src/web/src/editor/editor.test.ts` (Vitest):
  - `pickImageFiles(dataTransfer)` returns only image files and leaves text-only clipboards to the default handler;
  - placeholders are inserted, survive edits before and after them, and are replaced or removed (use a CodeMirror `EditorState`);
  - `checkFile(file, limits)` gives the same messages as the server (format, size with "10 MB").

### Implementation for User Story 1

- [X] T021 [US1] Create `src/Copernica/Attachments/ReferencedImages.cs`. It parses with the same Markdig pipeline as `src/Copernica/Rendering/MarkdownRenderer.cs`, walks `LinkInline` nodes with `IsImage`, and resolves each URL with the path logic of `WikiLinkRewriter` (extract `Combine` into an `internal static` helper in `src/Copernica/Rendering/WikiLinkRewriter.cs` and reuse it). It returns a `HashSet<string>` of space paths. Make T018 pass.
- [X] T022 [US1] Extend the save path in `src/Copernica/Git/PageWriter.cs`:
  - `PageChange` gains `IReadOnlyList<AddedFile> Files` (default empty), with `record AddedFile(string SpacePath, byte[] Content)`;
  - in `Prepare`, add each file to the same `TreeDefinition` with `space.ToRepositoryPath`;
  - before that, if any path exists in `baseCommit` or `tip`, return the new `SaveOutcome.AttachmentExists(path)`.

  The merge and commit code stays as is.
- [X] T023 [US1] In `src/Copernica/Api/PageWriteEndpoints.cs`:
  - add `IReadOnlyList<string>? Attachments` to `SavePageRequest` and `RenderRequest`.
  - In `SaveAsync`:
    - resolve the ids with `PendingImageStore.ResolveAsync(user, spaceId, path, ids)` (max 100);
    - keep the ones whose `RepositoryPath` is in `ReferencedImages.Collect(markdown, path)`;
    - read their bytes into `AddedFile`s and pass them in `PageChange`.
    - On `SaveResult` OK, delete **all** resolved ids. On any failure, touch them.
    - Map `AttachmentExists` to `409 attachment-exists` in `PageWriteService`, with detail "An image with the same name already exists. Remove it and paste again."
  - In `RenderAsync`, build `path → /api/uploads/{id}` from `ResolveAsync`, pass it to the renderer, and add an optional `IReadOnlyDictionary<string,string>? pending` to `WikiLinkRewriter` (and to `PageService.RenderPreview`) that is used for images.
- [X] T024 [P] [US1] Create `src/web/src/editor/uploads.ts`:
  - `uploadImage(spaceId, pagePath, file, onProgress): Promise<PendingUpload>` using `XMLHttpRequest`, `FormData` with `file` and the `X-XSRF-TOKEN` header read like `api/client.ts`;
  - failures reject with `ApiError`-compatible problems;
  - `checkFile(file, { maxBytes, formats })`.
- [X] T025 [P] [US1] Create `src/web/src/editor/placeholders.ts` (a CodeMirror `StateField` of placeholder ranges keyed by upload id) with `insertPlaceholder(view, pos, id, name)`, `replacePlaceholder(view, id, text)` and `removePlaceholder(view, id)`. The placeholder text is `![Uploading <name>…]()`.
- [X] T026 [P] [US1] Create `src/web/src/editor/imageInput.ts`:
  - `imageInput({ onFiles(files, pos) })` returns `EditorView.domEventHandlers` for `paste` (image files or items from `clipboardData`; otherwise return false for default handling), `drop` (`dataTransfer.files`, position from `view.posAtCoords`) and `dragover` (preventDefault when files are present);
  - export `pickImageFiles` for T020.
- [X] T027 [US1] Extend `src/web/src/components/MarkdownEditor.tsx`:
  - optional props `onFiles?: (files: File[], pos: number) => void` and `editorRef?: MutableRefObject<EditorView | null>`;
  - add the `imageInput` and `placeholders` extensions.
- [X] T028 [US1] Wire the upload flow in `src/web/src/pages/PageEdit.tsx`:
  - on `onFiles`, check each file (`checkFile` with the limits from `useMe().data.uploads`), insert a placeholder per accepted file, and upload it;
  - keep an `uploads` state for progress rows (`role="progressbar"`, text "Uploading <name> — n %"), announced politely at start and end;
  - on success, add `{ id, repositoryPath, link, name }` to `draft.attachments` and replace the placeholder with `![<suggested alt>](<link>)`; US2 replaces this with the dialog;
  - on failure or rejection, remove the placeholder and show an inline danger `Callout` per file (dismissible) with the reason, keeping the text;
  - send `attachments: draft.attachments.map(a => a.id)` with save (`api(pageApi…, PUT)`) and with the preview render (`usePreview`);
  - add "Images added in this edit will be discarded." to the discard `AlertDialog` when `draft.attachments.length > 0`.
- [X] T029 [US1] Add `attachments?: { id: string; repositoryPath: string; link: string; name: string }[]` to `Draft` in `src/web/src/drafts.ts`. Restoring a draft restores them, which the preview shows via render (FR-009).
- [X] T030 [US1] Add `tests/e2e/us7-images.spec.ts` with P1–P8 and P14–P16:
  - simulate paste with `page.evaluate` dispatching a `ClipboardEvent('paste', { clipboardData: dt })` on `.cm-content`, where `dt` is a `DataTransfer` holding a `File` built from fixture bytes passed in as base64;
  - drop with a `DragEvent('drop', { dataTransfer: dt, clientX, clientY })`;
  - verify commits with `remoteLog` and `git show --stat` on the bare remote (helpers);
  - P5's expiry is covered by T017, so here only assert that no commit was made;
  - P8 uses two browser contexts.

**Checkpoint**: US1 complete. The MVP: images can be pasted and dropped, previewed, and
saved in one commit.

---

## Phase 4: User Story 2 - Insert with the keyboard and describe the image (Priority: P2)

**Goal**: an *Insert image* button and a "Describe the image" dialog for alternative text.

**Independent Test**: P9, P10 and P17.

- [X] T031 [P] [US2] Create `src/web/src/editor/altText.ts` with `suggestAlt(fileName)`:
  - `image-<suffix>.png`, `image.png` and `blob` → "Image";
  - `network-diagram_v2.png` → "Network diagram v2";
  - remove the extension and the 8-character suffix, replace `-` and `_` with spaces, sentence case.

  Add cases to `src/web/src/editor/editor.test.ts`.
- [X] T032 [US2] Create `src/web/src/pages/ImageDescriptionDialog.tsx` per contracts/ui.md step 4:
  - `ui/Dialog` titled "Describe the image" (with "(n of m)" for queues);
  - a thumbnail `<img src={previewUrl} alt="">`;
  - `Field` "Description", pre-filled with `suggestAlt`, focused on open;
  - checkbox "Decorative image (no description)" that disables the field;
  - buttons *Insert* (primary) and *Skip*; Escape counts as *Skip*.

  It resolves with the alt text (`""` for decorative).
- [X] T033 [US2] In `src/web/src/pages/PageEdit.tsx`:
  - queue completed uploads through `ImageDescriptionDialog` before replacing the placeholder;
  - after each, focus the editor with the cursor after the inserted reference (`editorRef.current.focus()` + selection);
  - add the editor toolbar above the `Tabs` with an *Insert image* `Button` (`ImageIcon`, tooltip "Insert image — or paste / drop") that triggers a hidden `<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" multiple>`;
  - selected files go through the same `onFiles` path at the current cursor.
- [X] T034 [US2] Extend `tests/e2e/us7-images.spec.ts` with:
  - P9 (keyboard only: Tab to *Insert image*, `setInputFiles`, type the description, Enter, save; the rendered page has `img[alt="…"]`; the SVG response has `CSP: sandbox`);
  - P10 (decorative → `![](`).

  Extend `tests/e2e/a11y.spec.ts` (P17) with:
  - the editor with toolbar;
  - an open "Describe the image" dialog;
  - a visible error Callout (drop `notes.txt` before scanning).

**Checkpoint**: US1 and US2 work.

---

## Phase 5: User Story 3 - The deployer chooses where images are stored (Priority: P3)

**Goal**: per-space templates end to end.

**Independent Test**: P11 and P12.

- [X] T035 [P] [US3] Add `tests/Copernica.IntegrationTests/Attachments/LocationTests.cs`. Spaces with `images` (and `Folder=docs`), `{page}.assets` and `{dir}`:
  - an upload for `guides/setup.md` returns the `repositoryPath` and `link` of research R4;
  - a save commits to `docs/images/…`, `guides/setup.assets/…` and `guides/…` respectively;
  - the default from `Copernica:Attachments:Path=img` applies to a space without its own setting, and a space setting overrides it.
- [X] T036 [US3] Extend `tests/e2e/server.mjs` with a third local-only space, `notes`, with `Copernica__Spaces__2__Attachments__Path: '{page}.assets'`, and set `images` for `service`. Add P11 and P12 to `tests/e2e/us7-images.spec.ts`. For P12, start no extra server: assert via the integration test T016 and only check in e2e that `notes` and `service` work.

**Checkpoint**: US1–US3 work.

---

## Phase 6: User Story 4 - Pages from Azure DevOps Wiki show their images (Priority: P4)

**Goal**: lock in root-relative image links and dot-folder serving.

**Independent Test**: P13.

- [X] T037 [P] [US4] Add tests to `tests/Copernica.Tests/Rendering/WikiLinkRewriterTests.cs`:
  - `![x](/.attachments/x.png)` from `guides/a.md` → `/api/spaces/{id}/files/.attachments/x.png?version=…`;
  - `![y](/../secret.png)` → broken;
  - in a space with `Folder=docs`, the resolved file path is space-relative (the files endpoint maps it to `docs/…`).
- [X] T038 [P] [US4] Add `tests/Copernica.IntegrationTests/Attachments/RootRelativeTests.cs`. With plain git, commit to a `Folder=docs` space the page `docs/a.md` containing `![x](/.attachments/x.png)` plus `docs/.attachments/x.png`. The rendered HTML points to the files endpoint, `GET` returns the PNG, and `/.attachments/../../x` never leaves the space.
- [X] T039 [US4] Add P13 to `tests/e2e/us7-images.spec.ts` (push with `pushOutside` to `service`, `Folder=docs`; the image is visible and `naturalWidth > 0`).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T040 [P] Update `SECURITY.md`:
  - files written: `<data>/pending/` (unsaved uploads, removed 24 h after last use) and the `pending_images` table;
  - upload rules: write permission, formats checked by content, size and quota limits, owner-only preview, SVG sandboxed;
  - no outbound connections added.
- [X] T041 [P] Update `specs/001-git-backed-team-wiki/contracts/configuration.md` (or the deployment docs it points to) with the `Copernica:Attachments:*` settings from `contracts/configuration.md`, and add an "Images" bullet to the "User interface" section of `README.md` (paste, drop, *Insert image*, where images are stored).
- [X] T042 Run `pwsh scripts/check-licenses.ps1` (expect no new packages) and `dotnet test`, `npm --prefix src/web test`, and the Chromium e2e suite including 001/002 regressions. Fix regressions in the 002 editor tests (`tests/e2e/us2-editing.spec.ts`, `us2-responsive.spec.ts`) caused by the new toolbar.
- [ ] T043 Run quickstart P1–P17. P11's external viewer check (VS Code preview and the git platform's file view) is manual. Record the results and the storage-format callout (new table and data folder) in the PR description (constitution Quality Gates).

---

### Found during implementation

- [X] T044 [US4] Root-relative links on Linux: .NET parses "/x" as an absolute `file:` URI on Unix, so `WikiLinkRewriter` treated `/…` links as external there. In containers this broke links to the space root (already in 001) and the Azure DevOps Wiki image links of US4. Fixed with `WikiLinkRewriter.IsExternal` (a scheme or `//` only), which `ReferencedImages` also uses; covered by unit tests.
- [X] T045 [US2] The "Describe the image" dialog is portaled, but React bubbles its `submit` event up the component tree to the editor's form. Pressing *Insert* therefore saved the page when the change description was already filled in, e.g. for new pages. Fixed with `stopPropagation` in `ImageDescriptionDialog`; covered by e2e P11.
- [X] T046 [US2] The description field was reset on every render (the `request` object was recreated) and lost what the user typed. It now resets only when a new image comes up. Focus returns to the editor content after the dialog.

## Dependencies & Execution Order

- **Phase 1 → Phase 2** blocks all stories.
  - Inside Phase 2: tests T002–T004 come before T006–T008.
  - T005 → T008 → T009.
  - T010 → T011 → T012/T013.
  - T013 → T014 → T015.
- **US1 (Phase 3)** needs Phase 2. It is the MVP.
- **US2** needs US1's upload flow in `PageEdit.tsx` (T028). It adds the dialog in front of the replacement step.
- **US3** needs Phase 2 only (the templates exist since T008/T009). Its e2e part needs US1's UI.
- **US4** is independent of US1–US3: tests on existing rendering. It can be done any time after Phase 1.
- **Polish** comes after the stories you ship.

### Parallel opportunities

- Phase 2: T002, T003 and T004 in parallel; T006 and T007 in parallel; T016 and T017 in parallel after T013.
- US1: T018, T019 and T020 in parallel; T024, T025 and T026 in parallel. Then T027 → T028 → T029 in `PageEdit.tsx`/`drafts.ts` (same feature area), and T030.
- US4 (T037, T038) can run in parallel with any other phase.

```bash
# Phase 2, after T001:
Task: "T002 ImageFormatTests"   Task: "T003 AttachmentNamesTests"   Task: "T004 AttachmentLocationTests"
# US1 client pieces:
Task: "T024 editor/uploads.ts"  Task: "T025 editor/placeholders.ts" Task: "T026 editor/imageInput.ts"
```

## Implementation Strategy

1. **MVP**: Phases 1–2, then US1. Paste and drop work, with the alt text taken from the
   file name; images are saved in one commit. Validate P1–P8 and P14–P16.
2. **US2**: the keyboard path and the description dialog. Required for the accessibility
   target, so ship it together with US1 if possible.
3. **US3**: configurable locations.
4. **US4**: compatibility tests, which can be done any time.
5. **Polish**: docs, security notes, the regression run.
