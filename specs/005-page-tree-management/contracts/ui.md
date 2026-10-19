# UI Contract: Managing the Page Tree

Builds on the 002 UI contract: tree pattern, dialogs, toasts, live region, shortcuts and
responsive sheets. All strings are English. Components come from `src/web/src/ui`.

## 1. Item actions menu

Opened from a tree item in any of these ways:
- the "⋯" button shown on row hover or focus (`tabIndex=-1`, label "Actions for
  <title>");
- right-click on the row;
- **Shift+F10** or the **ContextMenu** key on the focused item (`aria-haspopup="menu"`).

| Item | Page | Folder | Root ("⋯" in the nav header) |
|------|------|--------|------------------------------|
| Open | ✓ | | |
| New page here… | ✓ (in the page's folder) | ✓ | ✓ |
| New folder… | | ✓ | ✓ |
| Rename… (F2) | ✓ | ✓ | |
| Move… | ✓ | ✓ | |
| Move up / Move down | ✓ | ✓ | |
| Delete… (Delete key) | ✓ | ✓ | |

- **Move up** is disabled for the first item and **Move down** for the last.
- Users without write access see only "Open". With write access in a read-only or
  out-of-sync space, write items are disabled and the menu shows a one-line reason (FR-002).
- The page's own "More page actions" menu gains **Rename…** and **Move…**, which open the
  same dialogs (FR-003).

**Shortcuts**: F2 and Delete act on the focused tree item. They are added to the shortcut
help under "Page tree" and follow the 002 single-key shortcut preference (they are
disabled when single-key shortcuts are off; Shift+F10 still opens the menu).

## 2. Rename dialog

- **Title**: "Rename page" or "Rename folder".
- **Page with a first heading**:
  - **Title** field, prefilled with the heading;
  - **File name** field, derived from the title (spaces become `-`, `.md` added) until the
    user edits it.
- **Page without a heading, or folder**: only a **Name** field.
- **Change description** field, prefilled with `Rename <old> to <new>` and kept in sync
  until edited.
- **Effects line** (from a dry run, debounced 300 ms after the name changes, also run on
  open): "3 other pages link here. Their links will be updated." It is hidden when the
  count is 0, and shows a spinner while loading.
- **Validation**: inline errors for invalid names (research R15) and for `target-exists`
  ("A page named “x.md” already exists in this folder.").
- **Buttons**: Cancel / **Rename** (primary, busy while saving).

## 3. Move dialog

- **Title**: "Move “<title>”".
- **Destination**: a filterable list of all folders, plus "Space root". The current folder
  is marked "(current)". The item itself and its subfolders are disabled and explained
  ("A folder cannot be moved into itself.").
- Optional **Name** field, prefilled (move and rename in one step).
- **Change description**, prefilled with `Move <old path> to <new path>`.
- **Effects line**: "Moves 12 pages and 3 other files. 5 other pages link here and will be
  updated."
- **Buttons**: Cancel / **Move**.
- **Opened by a drag and drop**: the destination is preselected, and focus starts on the
  primary button.

## 4. Delete folder dialog

- **AlertDialog**:
  - **title**: "Delete folder “<name>”?";
  - **description**: "This removes 42 pages and 15 other files. They stay available in the
    repository history.";
  - **Change description** field;
  - **confirm label**: "Delete folder".
- If the server answers `tree-changed` with a new count, the dialog updates the count and
  asks again. It does not delete.

## 5. New folder dialog

- Fields: **Folder name**, **First page name** (default `index`).
- **Create** opens the editor for `<parent>/<folder>/<page>.md`. Nothing is committed until
  the page is saved.

## 6. Drag and drop (pointer: fine, write access only)

| Gesture | Result |
|---------|--------|
| Drag an item over the middle of a folder row or the root header | Folder row highlighted "drop to move here"; drop opens the Move dialog prefilled |
| Drag over the top or bottom quarter of a sibling in the same folder | An insertion line is shown; drop reorders immediately (toast "Moved before <x>") |
| Hover a collapsed folder for 700 ms | It expands |
| Drag near the tree's top or bottom edge | The tree scrolls |
| Invalid target (itself, its own folder for a move, its own subtree) | "Not allowed" cursor and muted style; the drop does nothing |
| Escape | Cancels the drag |

The live region announces the drag start ("Moving <title>"), the target ("Drop to move into
<folder>") and the result.

## 7. Feedback and focus

| Outcome | Feedback | Focus |
|---------|----------|-------|
| Rename or move succeeded | Toast "Page moved" / "Folder renamed", plus "Updated links in N pages" when N > 0 | The item at its new place in the tree (ancestors expanded); if it is the open page, the URL is replaced |
| Reorder | Toast "Moved up"; live region announcement | Stays on the item |
| Delete folder succeeded | Toast "Folder deleted"; if the current page was inside, navigate to the space home | The nearest neighbour in the tree, or the parent folder |
| `tree-changed` | Callout in the dialog: "The tree changed since you opened it. It has been reloaded; check and try again." The tree reloads | Stays in the dialog |
| `push-rejected` / `hosting-unavailable` | Callout in the dialog with the server reason; nothing changes | Stays in the dialog |

## 8. Moved pages

- **Opening an old address**: the URL is replaced with the current path, and an info
  callout is shown above the page: "This page was moved from “<old path>”." (dismissible).
- **Opening a deleted page**: "Page not found. It was deleted; you can view its history."
  The link opens the history as of the parent of `deletedIn`.
- **Saving an edit whose page moved meanwhile**: the route is replaced with the new path,
  the draft is re-keyed, and the toast says "Saved. The page had been moved to “<path>”."
- **Saving an edit whose page was deleted**: a callout with "Save as a new page" (prefills
  the new-page dialog with the old path) and "Copy text".

## 9. Responsive

On narrow screens the tree is in the navigation sheet (002). There:
- menus and dialogs work as on wide screens;
- drag and drop is off (pointer: coarse);
- a long press does not start a drag, so the list scrolls normally (US4-3).
