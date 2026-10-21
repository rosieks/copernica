# Contract: Visual Editor UI

**Feature**: [../spec.md](../spec.md) | **Builds on**: 002 `contracts/ui.md`, 003, 004, 005

All strings are in English (constitution I). "Announce" means the existing polite live
region of `PageEdit` (`PageEdit.tsx:384-386`).

## 1. Edit page layout

```text
┌ Edit "Page title" ────────────────────────────────────────────────┐
│ [Visual | Markdown]  (segmented toggle, aria-pressed)  [Review changes] │
│ ── visual mode ───────────────────────────────────────────────── │
│ Toolbar: [Paragraph ▾] B I S <> 🔗 | • 1. ☐ ❝ | ⊞ 🖼 ◇ ─ | ⋯       │
│ ┌ Page content (role=textbox) ─────────────────────────────────┐ │
│ │ formatted content                                             │ │
│ └───────────────────────────────────────────────────────────────┘ │
│ ── markdown mode: unchanged 002 layout (Write / Preview / Split) ─ │
│ Change description [............................]  [Save] [Cancel] │
└───────────────────────────────────────────────────────────────────┘
```

- The mode toggle sits above the editor in both modes. Switching is announced: "Visual
  mode" or "Markdown mode".
- In visual mode there are no Write/Preview/Split tabs (spec Assumptions).
- The existing "Insert image" button moves into the visual toolbar in visual mode. It stays
  where it is in Markdown mode.
- **Review changes** opens a dialog with `DiffView from={pristine} to={current}` (label
  "Changes to the page file"). For a new page, `from` is empty. The dialog shows "No
  changes" when the two are equal.

## 2. Toolbar

The WAI-ARIA Toolbar pattern: one Tab stop, then arrow keys, Home and End. Every button has
an accessible name and a tooltip that shows its shortcut.

| Control | Action | Shortcut | State |
|---------|--------|----------|-------|
| Block type select | Paragraph, Heading 1–6, Code block | Ctrl+Alt+0–6 | current type |
| Bold | toggle `strong` | Ctrl/⌘+B | `aria-pressed` |
| Italic | toggle `em` | Ctrl/⌘+I | `aria-pressed` |
| Strikethrough | toggle `strike` | Ctrl/⌘+Shift+X | `aria-pressed` |
| Inline code | toggle `code` | Ctrl/⌘+E | `aria-pressed` |
| Link | link dialog (§6) | Ctrl/⌘+K | `aria-pressed` when the cursor is in a link |
| Bulleted / Numbered / Task list | wrap/unwrap list | Ctrl/⌘+Shift+8 / 7 / 9 | `aria-pressed` |
| Quote | wrap/lift quote | Ctrl/⌘+Shift+. | `aria-pressed` |
| Table | insert 3×3 table; in a table: table menu (§7) | – | – |
| Image | file picker (003 flow) | – | – |
| Diagram | insert diagram and open the diagram dialog (§8) | – | – |
| Horizontal rule | insert | – | – |
| Undo / Redo | history | Ctrl/⌘+Z / Ctrl/⌘+Shift+Z, Ctrl+Y | disabled when empty |

- Below 768 px, Strikethrough, Inline code, Quote, Table, Diagram, Horizontal rule, Undo
  and Redo move into a "More formatting" menu (Radix `DropdownMenu`).
- Ctrl/⌘+S (save) keeps working (002).
- Applying formatting announces it ("Bold on" / "Bold off", "Heading 2", "Bulleted list").

## 3. Typing shortcuts (input rules)

At the start of a paragraph:
- `# `–`###### ` turns it into a heading;
- `- `, `* ` or `+ ` into a bulleted list;
- `1. ` or `1) ` into a numbered list;
- `[ ] ` or `[x] ` (inside a list item) into a task item;
- `> ` into a quote;
- ```` ``` ```` + Enter into a code block;
- `---` + Enter into a horizontal rule.

Inline: `**text**`, `*text*`, `` `text` `` and `~~text~~` apply the mark. Undo right after an
input rule reverts it to the typed characters.

## 4. "/" command menu

- Opens when `/` is typed at the start of an empty paragraph. It uses the combobox/listbox
  pattern: the editor keeps focus and has `aria-expanded`, `aria-controls` and
  `aria-activedescendant`.
- Items: Heading 1–3, Bulleted list, Numbered list, Task list, Table, Quote, Code block,
  Diagram, Image, Horizontal rule, Link to page.
- Typing filters the items by label (case-insensitive substring). ↑ and ↓ move, Enter
  inserts (removing the `/query` text), Esc closes and keeps the typed text.
- When no item matches, it shows "No matching blocks" and Enter inserts nothing.

## 5. Placeholders, images and diagrams in the content

- **Placeholder**: a bordered chip or box with an icon and its `label`, plus the first line
  of its source in monospace (truncated). It is `role="group"` with
  `aria-label="{label}, can be edited in Markdown mode"` and a tooltip saying the same.
  - Selected with the arrow keys (NodeSelection, visible focus ring).
  - Delete or Backspace removes it.
  - Drag or cut and paste moves it.
- **Image**: shown at its natural size up to the content width. When selected, a small
  popover offers "Change description" (opens the 003 `ImageDescriptionDialog` prefilled)
  and "Remove". External images show an "External image (not shown in the editor)" frame
  with the alt text.
- **Diagram**: shown drawn (the 004 display). While drawing it shows "Drawing diagram…".
  On error it shows the 004 error state. When selected, it offers "Edit diagram" (Enter)
  and "Remove".
- **Upload in progress**: an inline "Uploading {name}…" chip with progress (003 behaviour).

## 6. Link dialog and page picker

- **Ctrl/⌘+K or the Link button** opens the dialog. It has two tabs:
  - **Page in this space** (default when the selection is empty or not a URL): a search
    field "Find a page" filters the space tree by title and path. Results show the title
    with the path as secondary text, at most 50, and the list is keyboard-navigable.
    Choosing one inserts a relative `.md` link (research R9). The link text defaults to the
    page title when nothing is selected.
  - **Web address**: a URL field validated by the §5 allow-list of the fidelity contract.
- "Link to page" from the "/" menu opens the dialog on the first tab.
- **With the cursor in a link**, a popover shows the target (page title for internal
  links), "Open" (new tab), "Edit link" and "Remove link". Remove keeps the text.
- Closing the dialog returns focus to the editor at the previous selection (002 FR-014).

## 7. Tables

- **Inside a table**: Tab / Shift+Tab move to the next or previous cell. Tab in the last
  cell adds a row.
- **The table menu** (toolbar Table button while in a table) offers:
  - Insert row above/below, Insert column left/right;
  - Delete row/column, Delete table;
  - Align column left/center/right.
- The header row always exists (GFM). The first row cannot be deleted while other rows
  exist.

## 8. Diagram dialog

- Title "Edit diagram".
- Left: a CodeMirror source field (label "Diagram source", Mermaid text).
- Right: the drawing, updated 300 ms after typing, with the 004 error state when the
  source is invalid.
- Buttons: "Apply" and "Cancel". Esc cancels.
- Below 768 px the drawing sits below the source.
- A new diagram starts with `flowchart TD\n  A --> B` and the file's fence style.

## 9. Mode switch, fallback and saving

- Switching keeps all content and maps the cursor (fidelity M2). It is announced.
- **Load-time guard failure** (FR-019) shows an info callout in Markdown mode: "This page
  uses Markdown the visual editor can't edit safely, so it opened in Markdown mode."
  Switching to visual shows the same message in the callout and stays in Markdown mode.
- **Save with no changes** (FR-012): no request is sent, the change description is not
  required, and the status "No changes to save" is announced. For a new page, saving always
  proceeds.
- All other save, cancel, conflict and draft behaviour is unchanged (001–003). Conflicts
  are resolved in the existing ConflictView, which is Markdown-based.

## 10. Pasting

- **Formatted paste** keeps the schema's elements (research R12). Dropped external images
  are reported once per paste.
- Ctrl/⌘+Shift+V pastes plain text.
- Pasting a URL over a text selection turns the selection into a link.

## 11. Accessibility checks (e2e)

- An IBM checker scan of the edit page in visual mode with the toolbar, "/" menu, link
  dialog, diagram dialog and table menu open, in light and dark themes, at 1280, 900 and
  375 px. 0 violations (SC-006).
- A keyboard-only flow for SC-003's task (no mouse events).
- Single-key wiki shortcuts (`e`, `c`, `?`) typed in the editor insert text and trigger
  nothing (FR-026).
