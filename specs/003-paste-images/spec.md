# Feature Specification: Paste and Drop Images into the Page Editor

**Feature Branch**: `003-paste-images`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Paste and drop images into the page editor. When a user pastes an image from the clipboard or drops image files onto the editor, the wiki inserts a Markdown image reference at the cursor and the preview shows the image immediately. The image is stored in the space's repository and committed together with the page in the same save (one commit per save, attributed to the user); images added to an edit that is abandoned are never committed and are cleaned up. Where images are stored is configurable per space with a path template, with a deployment-wide default: ".attachments" (shared folder at the space root, compatible with Azure DevOps Wiki, the default), any other shared folder such as "images", "{page}.assets" (a folder per page), or "{dir}" (next to the page). Inserted links are always relative to the page so the Markdown also works outside the wiki (other git platforms, editors); the wiki also displays root-relative links such as "/.attachments/x.png" used by Azure DevOps Wiki. File names get a short unique suffix so simultaneous pastes never collide; dropped files keep their original name plus the suffix. Only image formats are accepted (PNG, JPEG, GIF, WebP, SVG) up to a configurable size limit; anything else is rejected with a clear message and nothing is uploaded. Uploading shows progress and errors inline without losing the edited text, works with the keyboard (an "Insert image" button with a file picker as the alternative to paste and drop) and meets the same accessibility rules as the rest of the interface; the user is prompted for alternative text. Out of scope: moving or cleaning up images when pages are moved or deleted (to be handled with page hierarchy management), non-image attachments, image editing or resizing."

**Builds on**:
- [001 Git-Backed Team Wiki](../001-git-backed-team-wiki/spec.md): editing, saving, the one-commit-per-save rule, permissions and conflict handling.
- [002 Consistent, Accessible Wiki Interface](../002-accessible-wiki-ui/spec.md): the editor, notifications and the accessibility rules.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paste or drop an image while editing (Priority: P1)

A team member is editing a page and wants to add a screenshot. They paste it from the
clipboard, or drag an image file from their computer onto the editor. The image appears
in the preview at once, and a Markdown image reference is inserted where the cursor was.
When they save, the image and the page change are recorded together, under their name, as
one change in the repository's history.

**Why this priority**: Screenshots and diagrams are the most common non-text content in
team documentation. Today they have to be added with git tooling outside the wiki, which
most editors will not do. This story alone makes the editor usable for everyday
documentation.

**Independent Test**: Edit a page, paste a screenshot, and drop a PNG file. Check that:
- both appear in the preview;
- after saving, the repository has exactly one new commit by the user that contains the
  page change and both image files;
- the page shows both images.

**Acceptance Scenarios**:

1. **Given** a user editing a page they can change, **When** they paste an image from the
   clipboard, **Then** an image reference is inserted at the cursor, the preview shows the
   image, and the edited text is otherwise unchanged.
2. **Given** a user editing a page, **When** they drop one or more image files onto the
   editor, **Then** one image reference per file is inserted at the drop position, in the
   order of the files.
3. **Given** a page with newly added images, **When** the user saves with a change
   description, **Then** the repository receives exactly one commit, attributed to the
   user, that contains the page change and every image still referenced in the saved text.
4. **Given** a user who inserted an image and then deleted its reference before saving,
   **When** they save, **Then** that image is not committed.
5. **Given** a user who added images and then cancels or abandons the edit, **When** the
   edit ends, **Then** none of those images ever reach the repository.
6. **Given** a user who pastes or drops a file that is not an accepted image format, or is
   larger than the size limit, **When** the file is processed, **Then** nothing is
   inserted or uploaded, and a message explains why (format or size, naming the limit).
7. **Given** an image is being uploaded, **When** the user keeps typing, **Then** the text
   is not blocked and progress is visible. If the upload fails, the reason is shown next
   to the editor, and the edited text and the other images are kept.
8. **Given** two users who paste images with the same name at the same time, **When** both
   save, **Then** both images are kept as different files and each page shows its own
   image.

---

### User Story 2 - Insert an image with the keyboard and describe it (Priority: P2)

A team member who works without a mouse, or who has the image as a file, uses an "Insert
image" control in the editor. It opens a file picker; after they choose files, the images
are added as with paste and drop. For every inserted image, the wiki asks for alternative
text, so readers using assistive technology know what the image shows.

**Why this priority**: Paste and drag-and-drop are not available to every user or device.
The project's accessibility target requires an equivalent way to do the same thing, and
alternative text is required for meaningful images.

**Independent Test**: Using only the keyboard, insert an image through the "Insert image"
control, enter alternative text, and save. Verify the saved Markdown contains the
alternative text and the published page exposes it to assistive technology.

**Acceptance Scenarios**:

1. **Given** a user in the editor, **When** they activate "Insert image" (by keyboard or
   pointer), **Then** a file picker limited to the accepted image formats opens.
2. **Given** an image was inserted by any method, **When** it is added, **Then** the user is
   asked for alternative text in a dialog. The field is pre-filled with a suggestion based
   on the file name.
3. **Given** the alternative-text dialog, **When** the user confirms, **Then** the text
   becomes the image's description in the Markdown.
4. **Given** the alternative-text dialog, **When** the user marks the image as decorative,
   **Then** the image is inserted with an empty description.
5. **Given** the alternative-text dialog, **When** the user dismisses it, **Then** the image
   is still inserted with the suggested description, so pasting is never blocked.
6. **Given** the alternative-text dialog is closed, **When** focus returns, **Then** it is
   back in the editor at the position after the inserted reference.
7. **Given** any part of this flow, **When** it is checked, **Then** it meets the same
   accessibility rules as the rest of the interface (002): keyboard operable, visible
   focus, announced progress and errors.

---

### User Story 3 - The deployer chooses where images are stored (Priority: P3)

A deployer configures, per space, where new images are stored: in a shared folder (by
default `.attachments` at the space root, as Azure DevOps Wiki does, or any other folder
such as `images`), in a folder per page (`{page}.assets`), or next to the page (`{dir}`).
A deployment-wide default applies to spaces that do not set their own. Whatever the
location, the inserted reference is relative to the page. The repository's Markdown
therefore still shows the images when viewed outside the wiki, on any git platform or in
any Markdown editor.

**Why this priority**: Teams bring repositories with existing conventions: a docs site
with `docs/images`, a migrated Azure DevOps Wiki, an editor that stores images per page.
Matching the convention keeps the repository consistent and its content portable. The
default works without configuration, so this story is not needed to start using the
feature.

**Independent Test**: Configure three spaces with `.attachments`, `images` and
`{page}.assets`, add an image to a page in a sub-folder of each, and verify:
- each file is stored at the configured location;
- the inserted reference is relative to the page;
- the image is displayed both in the wiki and when the repository is viewed in an ordinary
  Markdown preview.

**Acceptance Scenarios**:

1. **Given** a space with no storage setting, **When** an image is added to any of its
   pages, **Then** it is stored in `.attachments` at the space root.
2. **Given** a space configured with a shared folder name, **When** an image is added,
   **Then** it is stored in that folder at the space root.
3. **Given** a space configured with `{page}.assets`, **When** an image is added to
   `guides/setup.md`, **Then** it is stored in `guides/setup.assets/`.
4. **Given** a space configured with `{dir}`, **When** an image is added to
   `guides/setup.md`, **Then** it is stored in `guides/`.
5. **Given** any configuration, **When** a reference is inserted, **Then** it is relative to
   the page, e.g. `../.attachments/…` from `guides/setup.md`.
6. **Given** a configured location that would point outside the space, or is otherwise
   invalid, **When** the deployment starts, **Then** that space reports a configuration
   error. Other spaces keep working (as in 001), and no image is ever written outside the
   space.
7. **Given** a deployment-wide default and a space-level setting, **When** both are
   present, **Then** the space-level setting wins.

---

### User Story 4 - Pages from Azure DevOps Wiki show their images (Priority: P4)

A team moves an existing Azure DevOps Wiki repository into a space. Its pages reference
images with links that start at the wiki root, such as `/.attachments/image-123.png`. The
wiki displays these images without the pages being rewritten.

**Why this priority**: Azure DevOps is the first supported platform, and migrated wikis are
a likely first use. It is a reading-side compatibility concern that does not depend on
the editing stories.

**Independent Test**: Push a page containing `![x](/.attachments/x.png)` and the file
`.attachments/x.png`, with plain git, to a space whose root is a sub-folder of the
repository. Verify that the image is displayed.

**Acceptance Scenarios**:

1. **Given** a page with an image link starting with `/`, **When** the page is displayed,
   **Then** the link is resolved from the space root (not the repository root) and the
   image is shown.
2. **Given** a root-relative link that points to a missing file, **When** the page is
   displayed, **Then** it is treated like any other broken image (001): no error page,
   the page still renders.
3. **Given** a root-relative link that tries to leave the space (e.g. `/../secret.png`),
   **When** the page is displayed, **Then** nothing outside the space is served.

---

### Edge Cases

- **Many images at once.** Dropping many images or very large batches: each file is
  validated separately. Accepted ones are inserted; rejected ones are listed with their
  reason.
- **Clipboard with mixed content.** If the clipboard holds both text and an image (e.g.
  copied from an office document), the image is inserted when the clipboard contains image
  data. Otherwise the text is pasted as usual.
- **Images from a web page.** If the clipboard contains only links to images on the web, no
  image is fetched (the wiki makes no outbound requests). The text or link is pasted as
  usual.
- **Session expiry or reload.** If the session expires or the page is reloaded during an
  edit with pending images, the restored draft still shows its images, and saving still
  includes them.
- **Edit conflict (001 US3).** Pending images survive the conflict screen and are included
  in the save of the resolved version.
- **Save rejected** by the git hosting platform (e.g. protected branch): nothing is
  committed, and the images stay pending so a retry can include them.
- **Existing file with the same name.** The unique suffix makes collisions practically
  impossible. If one still happens, the existing file is never overwritten.
- **New page.** Images can be added before the page's first save. A per-page location
  (`{page}.assets`) uses the new page's path.
- **Read-only users** (001 FR-009) cannot open the editor and so cannot upload. Direct
  upload attempts are rejected.
- **Animated GIF and SVG.** Animated GIFs are stored and shown as they are. SVG images are
  displayed safely: never executed, as for SVG files already in repositories (001).
- **Reusing an image.** Pasting the same image twice creates two files. Deduplication is out
  of scope.

## Requirements *(mandatory)*

### Functional Requirements

**Adding images in the editor**

- **FR-001**: Users editing a page MUST be able to add images by pasting image data from
  the clipboard, by dropping image files onto the editor, and through an "Insert image"
  control that opens a file picker.
- **FR-002**: For each accepted image, the system MUST insert a Markdown image reference at
  the cursor, or at the drop position, and show the image in the editor preview as soon as
  it is available.
- **FR-003**: The system MUST accept only PNG, JPEG, GIF, WebP and SVG images, up to a size
  limit configurable for the deployment (default 10 MB per image). Other files MUST be
  rejected before anything is stored, with a message naming the reason and, for size, the
  limit.
- **FR-004**: Uploading MUST NOT block typing. Progress MUST be visible and announced to
  assistive technology. A failure MUST be shown next to the editor while keeping the
  edited text and other images.
- **FR-005**: After an image is inserted, the user MUST be asked for alternative text. The
  field is pre-filled with a suggestion from the file name; the user can mark the image as
  decorative (empty description); dismissing the request keeps the suggestion. Focus MUST
  return to the editor afterwards.

**Saving**

- **FR-006**: Images added during an edit MUST NOT be written to the repository before the
  page is saved.
- **FR-007**: A save MUST produce exactly one commit, attributed to the user (001 FR-011),
  containing the page change and every image added during the edit that is still
  referenced in the saved text. Images no longer referenced MUST NOT be committed.
- **FR-008**: Images added during an edit that is cancelled, abandoned or never saved MUST
  never reach the repository. They MUST be removed from the wiki's storage within 24 hours
  of the last activity of that edit.
- **FR-009**: Pending images MUST survive a page reload, a re-sign-in, an edit conflict and
  a rejected save within that period, so the subsequent save includes them.
- **FR-010**: Pending images MUST be visible only to the user who added them until the page
  is saved.
- **FR-011**: Uploading MUST require permission to change the page's space, exactly as
  saving does (001 FR-009).

**File names and locations**

- **FR-012**: Each stored image MUST get a file name with a short unique suffix. Pasted
  images get a generic name (e.g. `image-<suffix>.png`); dropped and picked files keep
  their original name, made safe for file systems and URLs, plus the suffix. An existing
  file MUST never be overwritten.
- **FR-013**: The storage location for new images MUST be configurable per space as a path
  template, with a deployment-wide default. Supported forms:
  - a folder name at the space root (default `.attachments`);
  - `{page}.assets`: a folder named after the page, next to it;
  - `{dir}`: the page's own folder.

  A space setting overrides the default.
- **FR-014**: A location that would resolve outside the space, or is otherwise invalid,
  MUST make that space report a configuration error at startup without affecting other
  spaces. No image may ever be written outside its space.
- **FR-015**: Inserted image references MUST be relative to the page, so the Markdown
  displays correctly outside the wiki (other git platforms and Markdown editors).

**Displaying images**

- **FR-016**: When displaying a page, image and link targets that start with `/` MUST be
  resolved from the space root, as Azure DevOps Wiki does. Targets that would leave the
  space MUST NOT be served.
- **FR-017**: Stored images MUST be served with the existing safe-file rules (001): never
  executed, SVG isolated, correct content type.

### Key Entities

- **Pending image**: an image added during an edit but not yet saved. It belongs to one
  user and one edit of one page, and has a file name, a format, a size and the time of
  last use. It becomes a repository file when it is saved while still referenced, and is
  discarded otherwise.
- **Attachment location**: the per-space or deployment-wide rule that decides the folder
  for new images (shared folder, per-page folder or page folder).
- **Image reference**: the Markdown image element in a page: alternative text plus a path
  relative to the page. When displayed, it may also be written root-relative (Azure
  DevOps Wiki style).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user adds a screenshot to a page and saves it in under 30 seconds, with no
  tools other than the browser.
- **SC-002**: After a paste or drop, an image of up to 2 MB appears in the preview within
  2 seconds on the organization's network.
- **SC-003**: In testing, 100% of saves with images produce exactly one commit, attributed
  to the user, containing the page change and only the still-referenced images.
- **SC-004**: 0 images from cancelled or abandoned edits reach any repository. 100% of
  them are removed from the wiki's storage within 24 hours.
- **SC-005**: Pages saved with images display all their images when the repository is
  viewed outside the wiki, in at least two other common Markdown viewers (e.g. a git
  platform's file view and a code editor preview), for every supported location setting.
- **SC-006**: A keyboard-only user adds an image with alternative text, without help, on
  the first attempt. The automated accessibility checks (002) report 0 violations for the
  new controls and dialog.
- **SC-007**: A page migrated from Azure DevOps Wiki with root-relative image links shows
  100% of its images without changes to the page.

## Assumptions

- **Pasting text.** Only image data and image files are handled. Pasting rich text or HTML
  keeps its current behaviour, and no image referenced by a web address is ever downloaded
  (the constitution forbids server-side fetching of arbitrary URLs).
- **Size limit.** The default of 10 MB per image is a common default for documentation
  screenshots. Deployers can change it; there is no per-space size setting.
- **Abandoned uploads.** "Abandoned" means 24 hours without activity on the edit. The draft
  of an edit already survives reloads (001/002), so the 24-hour window covers ordinary
  interruptions.
- **Moving and deleting pages.** Moving images with pages, cleaning up images that are no
  longer referenced, and deleting them with a page are out of scope (to be handled with
  page hierarchy management). Images stay where they were committed.
- **Scope of attachments.** Non-image attachments, image editing, resizing, captions and
  galleries are out of scope.
- **Deduplication.** Identical images are not deduplicated.
- **Link style.** The relative link style is fixed (not configurable), because it works in
  every viewer. Reading root-relative links needs no configuration.
- **Storage.** Pending images are held on the wiki's data volume, within the existing
  storage rules. No new external storage is introduced (constitution Principles II and
  V).
