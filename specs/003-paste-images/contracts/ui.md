# UI Contract: Paste and Drop Images

Extends the editor screen S4 of [002 ui.md](../../002-accessible-wiki-ui/contracts/ui.md).
All rules of that contract apply: `ui/` wrappers only, tokens, keyboard map, accessibility
acceptance. Design: [research.md](../research.md) R6.

## Editor toolbar

Above the editor (in all tabs that show the editor: *Write*, *Split*), a small toolbar:

| Control | Behaviour |
|---------|-----------|
| **Insert image** (`Button`, `ImageIcon`, tooltip "Insert image — or paste / drop") | Opens a file picker limited to PNG, JPEG, GIF, WebP and SVG, multiple selection; files go through the same flow as paste and drop |

## Adding images

1. **Paste** (`Ctrl/⌘+V` with image data) or **drop** files onto the editor. In the Split
   view, dropping onto the preview behaves like dropping at the end of the document.
2. Each file is checked against the format and size limits, client-side first and then by
   the server. A rejected file shows an inline danger `Callout` under the editor:
   "*screenshot.bmp* was not added: only PNG, JPEG, GIF, WebP and SVG images are
   accepted", or "… is larger than 10 MB". The Callout is listed per file and dismissible.
3. An accepted file inserts a placeholder `![Uploading screenshot.png…]()` at the cursor or
   drop point, and a progress row appears under the editor ("Uploading screenshot.png —
   40 %", a `progressbar`). Progress is announced politely at start and end, not at every
   percent.
4. When the upload completes, a `Dialog` titled **"Describe the image"** opens:
   - a thumbnail (the preview URL) with an empty `alt`, since the dialog itself describes
     it;
   - `Field` **"Description"**, pre-filled from the file name (`network-diagram.png` →
     "Network diagram"; `image-….png` → "Image");
   - a checkbox **"Decorative image (no description)"**, which disables the field;
   - *Insert* (primary) and *Skip* (keeps the suggestion). Escape behaves like *Skip*.

   Several files are described one after another. The dialog title shows "(2 of 3)".
5. The placeholder is replaced with `![<description>](<link>)`. Focus returns to the editor
   with the cursor after the reference.
6. The preview shows the image as soon as the reference is in the text.
7. On upload failure, the placeholder is removed and an inline danger Callout gives the
   reason. The text and other images are untouched.

## Saving and leaving

- The save works as in 002 (FR-006–FR-008, 002). The success toast is unchanged.
- *Cancel*/*Discard* with pending images uses the existing "Discard your changes?"
  AlertDialog. It adds the line "Images added in this edit will be discarded."
- On reload, the restored-draft Callout (002) also restores the pending images; the
  preview shows them.

## Keyboard and accessibility

- The *Insert image* button is in the tab order before the editor and is reachable from
  the editor with `Shift+Tab`.
- No new single-key shortcuts. Paste uses the platform shortcut.
- Live region messages:
  - "Uploading screenshot.png";
  - "screenshot.png uploaded";
  - "screenshot.png was not added: <reason>".
- The progress row uses `role="progressbar"` with `aria-valuenow` and a text label.
- The alt-text dialog follows the Dialog rules of 002: a title, focus starts in the
  Description field, and focus returns on close.
- WCAG scan (002 R10) covers: the editor with the toolbar, a visible progress row, an
  error Callout and the alt-text dialog, in both themes.

## Requirement traceability

| Spec | Where |
|------|-------|
| FR-001 | Paste/drop handlers; *Insert image* |
| FR-002 | Placeholder → reference; preview via upload URL |
| FR-003 | Client + server checks; error Callouts |
| FR-004 | Progress row, live region, non-blocking placeholder |
| FR-005 | "Describe the image" dialog |
| FR-006–FR-010 | Draft `attachments`; save, render and discard behaviour |
