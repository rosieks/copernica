# Research: Visual Page Editor

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-21

Each item records the decision, the reasoning and the alternatives that were rejected.

---

## R1. Editor framework

**Decision**: plain **ProseMirror** packages (all MIT, one maintainer), with no wrapper
framework:
- `prosemirror-model` 1.25.12
- `prosemirror-state` 1.4.4
- `prosemirror-view` 1.42.6
- `prosemirror-transform` 1.12.2
- `prosemirror-commands` 1.7.2
- `prosemirror-keymap` 1.2.3
- `prosemirror-history` 1.5.1
- `prosemirror-inputrules` 1.5.1
- `prosemirror-schema-list` 1.5.1
- `prosemirror-tables` 1.8.5
- `prosemirror-gapcursor` 1.4.1
- `prosemirror-dropcursor` 1.8.4

**Rationale**:
- No library examined offers byte-exact Markdown round-trip. ProseMirror's author treats
  Markdown as a lossy export format
  (https://discuss.prosemirror.net/t/markdown-newlines-and-ranges/370). So the
  source-preservation layer is ours to build whatever we choose, and the base on which it
  is easiest to control is the best one.
- ProseMirror gives:
  - a schema that acts as an allow-list (FR-027, constitution v1.4.0);
  - immutable, structurally shared nodes, so an untouched block keeps the same `Node`
    object across transactions (used in R4);
  - no injected `<style>` elements, `eval` or `new Function` (R7).
- Size: about 110–120 KB min+gz, loaded lazily with the editor (R8).

**Alternatives considered**:
- **TipTap 3** (MIT core; `@tiptap/markdown` is MIT). It adds an abstraction layer and uses
  `marked`, whose tokens carry no offsets. Its docs call markdown support an early release
  whose round-trip "isn't guaranteed". It injects a `<style>` by default (needs
  `injectCSS: false`). Bigger, and it does not help with fidelity.
- **Milkdown 7** (MIT, remark/mdast). It has the best positions on paper, but every preset
  node schema would need overriding to carry them. It adds unified, micromark and a plugin
  framework (about 200–250 KB), and its components pull in Vue.
- **Lexical**: its regex-based markdown transformers are lossy and have no positions.
- **BlockNote**: MPL-2.0, not on the license allow-list.
- **Toast UI Editor**: unmaintained since 2023, and its WYSIWYG mode re-serializes the
  whole document.
- **CodeMirror "live preview"** (hide syntax away from the cursor): rejected in the spec
  (Assumptions) because it does not meet the needs of non-technical users.

## R2. Markdown parser for the editor

**Decision**: **`@lezer/markdown`** 1.8.0 with its GFM extensions:
- `Table`, `TaskList`, `Strikethrough`, `Autolink`;
- plus small project extensions (R5).

It is already in the lockfile as a dependency of `@codemirror/lang-markdown` (same
version). It becomes a direct, pinned dependency, so no new package enters the tree.

**Rationale**:
- Lezer produces a syntax tree with **exact character offsets for every node, inline nodes
  and markers included** (`EmphasisMark`, `ListMark`, `HeaderMark`, `CodeMark`, `LinkMark`,
  `URL`, …). That is precisely what source preservation and style detection (R6) need.
- It is CommonMark-compliant and extensible with block and inline parsers, and its author
  is the ProseMirror author.
- markdown-it (via `prosemirror-markdown`) only gives block line ranges and no inline
  offsets. Its container children map to lines that still carry `> ` and indent prefixes.
- `prosemirror-markdown` is not used at all. Its module creates a markdown-it instance at
  load time, which would pull markdown-it into the bundle even if only the serializer were
  imported. We need our own serializer anyway (R4, R6).

**Alternatives considered**:
- markdown-it + `prosemirror-markdown`: no inline offsets, a second parser in the bundle,
  and aggressive escaping in the serializer.
- micromark/mdast: good offsets, but about 60 KB more and a different tree model.

**Consequence**: the server renders with Markdig and the editor parses with Lezer. Both
follow CommonMark and GFM, so they agree on all supported constructs. Constructs only
Markdig understands (grid tables, definition lists, footnotes, custom containers) become
placeholders (R5). Any remaining difference affects how a block *looks in the editor*,
never the bytes saved (R4).

## R3. Converting between Markdown and the editor document

**Decision**: a **pure TypeScript module** with no DOM use (`src/web/src/visual/markdown/`).
It has three parts:
1. **`parse(markdown) → { doc, source }`**: walks the Lezer tree and builds a ProseMirror
   document of the schema in the [fidelity contract](contracts/fidelity.md). Every block
   node gets `src` (`{from, to}` offsets into the source) and a stable `srcId`. Every
   supported mark records its original markers in attributes (e.g. `marker: "_"`).
2. **`serialize(doc, source) → markdown`**: the preserving serializer (R4).
3. **`detectStyle(tree, source) → FileStyle`** (R6).

Being pure lets the corpus check (R10) run in Vitest under jsdom, with no browser.

## R4. Source preservation algorithm

**Decision**: a block-level **emit-original-if-equivalent** rule, applied recursively, with
line-level refinement inside paragraphs:

```text
serialize(block):
  if block is the identical Node object created by parse()      → original slice   (fast path)
  if block.src and canon(block) == canon(parse(original slice)) → original slice   (FR-009)
  if block is a container (list, list item, quote, table row)   → container prefix kept,
                                                                  children serialized recursively
  if block is a paragraph or heading with src                   → line-level merge (below)
  otherwise                                                     → fresh Markdown in FileStyle (R6)
between blocks a and b:
  if both are emitted from source and were adjacent in source   → original gap text
  else                                                          → one blank line (or the
                                                                  file's line ending ×2)
```

- `canon(node)` is the node's structure (type, attrs other than `src`/`srcId`/markers,
  text, marks) compared by value. This makes "unchanged" independent of how the user got
  there (an edit that was undone or typed back), as FR-009 requires.
- **Container prefixes.** Lezer gives the exact offsets of `QuoteMark` and `ListMark` and of
  each child block. A changed child is serialized fresh and then prefixed:
  - in a quote, with the quote's continuation prefix as written in the source (`> ` or
    `>`);
  - in a list item, with the item's original content indent.

  Unchanged siblings keep their exact lines, so a change inside one list item does not
  touch the others (FR-008).
- **Line-level merge** (FR-008, hand-wrapped paragraphs):
  - soft line breaks are kept in the document as `soft_break` inline nodes, so the edited
    paragraph still has the same lines;
  - the fresh serialization of each line is compared with the fresh serialization of the
    original line;
  - lines that are equal emit their original bytes (including trailing spaces and escapes);
  - only differing lines are emitted fresh;
  - if the user removes or adds a soft break, only the lines around it change.
- **New blocks** (no `src`) are always serialized fresh in the file's style.
- **Load-time guard.** After `parse`, the editor runs `serialize(doc)` once. If the result
  is not byte-identical to the input, the page opens in Markdown mode with the FR-019
  message. This is a runtime safety net on top of the corpus check (R10): fidelity cannot
  silently break for a page shape the corpus misses.
- **No-change save** (FR-012): the client compares the resulting Markdown with the
  `pristine` text it loaded. If they are equal, it shows "No changes to save" and does not
  call the API. The server already turns an identical tree into no commit
  (`PageWriter.cs:177-181`). That path gets a missing integration test, but no API change
  is needed.
- **Performance**: the fast path (object identity) makes serializing an unchanged 100 KB
  page linear in the number of blocks with no string building. `serialize` runs on a
  200 ms idle debounce for drafts, and synchronously before save, mode switch and "Review
  changes".

**Alternatives considered**:
- **Whole-document diff and patch** (serialize everything, diff against
  `serialize(parse(original))`, map hunks back onto the original). Mapping from a
  normalized text to the original is ambiguous whenever normalization changes line counts
  (escapes, wrapped lines, list renumbering).
- **Tracking edited ranges through transactions.** Fragile under paste, undo and
  structural edits, and it fails FR-009 (undo back to the original would still count as
  changed).

## R5. Unsupported constructs and placeholders

**Decision**: two atom node types, `raw_block` and `raw_inline`. Each holds the verbatim
source text and a `kind` label. Placeholders are created:
- **Explicitly** for:
  - `HTMLBlock`, `CommentBlock`, `ProcessingInstructionBlock`;
  - inline `HTMLTag` and `Comment`;
  - `LinkReference` definitions ("Link definition: name");
  - and constructs recognised by small project Lezer extensions:
    - front matter at the start of the file;
    - Azure DevOps `[[_TOC_]]` (a line on its own);
    - `:::` containers other than `::: mermaid`;
    - footnote definitions `[^x]:` and references `[^x]`;
    - grid tables (`+---+` lines);
    - definition lists (`: ` lines after a term), which Markdig renders.
- **Generically**: any Lezer node type that the converter does not map becomes a
  placeholder with its exact slice. Nothing is ever dropped.

Placeholders are read-only atoms. They can be selected (NodeSelection), moved and deleted
as a whole, and are announced with their label (contracts/ui.md §5). Their content is
emitted byte-for-byte. Moving a placeholder moves its source text.

`::: mermaid` containers and ` ```mermaid ` fences become a `diagram` node instead (R9).
That node keeps the original fence or container syntax through `src`.

## R6. File style detection

**Decision**: `detectStyle` counts what the file already uses, by majority, from Lezer
marker nodes:

| Style item | Detected from | Default (new page / no evidence) |
|------------|---------------|----------------------------------|
| bullet marker | `ListMark` of bullet lists (`-` `*` `+`) | `-` |
| ordered style | `1.` vs `1)`; all-ones vs incrementing numbers | `1.`, incrementing |
| emphasis / strong | `EmphasisMark` (`*`/`_`, `**`/`__`) | `*`, `**` |
| code fence | `CodeMark` of fenced code (```` ``` ```` / `~~~`, length) | ```` ``` ```` |
| heading | ATX vs setext; closing `#`s | ATX, no closing |
| horizontal rule | the rule's exact text | `---` |
| line ending | first line break (`\r\n` / `\n`) | `\n` |
| final newline | last character | present |
| list indent | content offset of first-level items | marker + 1 space |
| table pipes | leading/trailing pipes in table rows | both |

The defaults match how the wiki's new-page dialog creates pages (`# Title\n\n`). Inside an
existing list, a new item copies its nearest sibling's marker and indent rather than the
file-wide majority.

## R7. Content Security Policy

The current policy (`SecurityHeadersMiddleware.cs:22-26`) is:
- `style-src 'self' 'nonce-…'`
- `style-src-attr 'unsafe-inline'`
- `script-src 'self'`
- `img-src 'self' data:`

**Decision**: no CSP change.
- ProseMirror injects no `<style>`. Its CSS (`prosemirror-view/style/prosemirror.css`,
  `prosemirror-tables/style/tables.css`, gapcursor) is imported into the Vite bundle as
  files.
- Our node views and decorations use classes, not `style` attributes. CSSOM writes made
  by the library itself (hidden clipboard elements, table column widths) are allowed in
  any case.
- No `eval` or `new Function` in ProseMirror or Lezer.
- `tests/e2e/csp.spec.ts` is extended to the visual editor and must report 0 violations.

## R8. Bundle and loading

**Decision**:
- The visual editor is a lazily loaded chunk (`import()` from `PageEdit`), the same way
  CodeMirror and Mermaid are kept out of the reading path.
- Estimated chunk size: about 120 KB min+gz for ProseMirror plus our code. Lezer is already
  in the CodeMirror chunk; Vite splits it as a shared chunk.
- Reading pages is unaffected.
- SC-005 (ready within 1 s for 100 KB pages) is verified in e2e with a generated 100 KB
  page.

## R9. Existing features in visual mode

**Images (003)**:
- `useImageUploads` is reused unchanged.
- A new `VisualImageInput` adapter (ProseMirror `handlePaste`/`handleDrop` plus the
  existing toolbar button) does the same steps as the CodeMirror one:
  - it inserts an `image_upload` placeholder node at the position;
  - when the alt-text dialog finishes, it replaces the placeholder with an `image` node
    (`src = attachment.link`, `alt`).
- The placeholder is a ProseMirror decoration-free node mapped through transactions, like
  the CodeMirror `StateField`. Unfinished placeholders are never serialized.
- `draft.attachments` and the save flow are untouched. The server still commits only
  images still referenced (`ReferencedImages.Collect`).

**Image display** in the editor uses a client-side resolver, `resolveImageSrc(link,
pagePath, spaceId, attachments)`, that mirrors `WikiLinkRewriter.Resolve` for images:
- relative and space-root paths resolve to `/api/spaces/{space}/files/{path}`;
- pending uploads resolve to their `previewUrl`;
- `data:` images are allowed;
- external (`http(s):`) images are not loaded and are shown as an "External image"
  frame. The CSP blocks them anyway, and this matches the constitution's "no outbound
  connections".

**Diagrams (004)**:
- A `diagram` atom node with a node view that draws through the existing
  `rendererClient()` and shows `<img src="data:image/svg+xml…">`, the same display as
  `useDiagrams`.
- Editing happens in a **"Edit diagram" dialog**: a CodeMirror source field and a live
  drawing beside it, redrawn after 300 ms. A dialog is keyboard- and
  screen-reader-friendly, unlike an inline nested editor inside contenteditable.
- The node keeps the fence/container style through `src`, so an unchanged diagram is
  emitted byte-for-byte.

**Links to pages (005)**:
- A **page picker** dialog filters the space tree (`GET /api/spaces/{id}/tree`, already
  cached under `['tree', spaceId]`) by title and path, client-side, like `MoveDialog`'s
  "Find a folder" field. No new API.
- The link is written as a **relative path to the `.md` file, percent-encoded per segment**
  (e.g. `../guides/Set-up-VPN.md`). This is the same form as image links (003), works in
  Azure DevOps and other git tools, and `WikiLinkRewriter` already resolves it.
  `LinkRewriter` keeps it up to date when pages move (005).
- The spec's "same form as links the wiki writes elsewhere" resolves to this, because the
  wiki writes relative links for images today.
- Link display uses the same scheme allow-list as the server sanitizer:
  - `http`, `https` and `mailto`, plus relative, space-root and `wiki:` targets;
  - any other scheme is shown as text with a "Link not allowed" style and is never placed
    in an `href`;
  - its Markdown is preserved.

## R10. Fidelity corpus and CI

**Decision**: fixtures live in `src/web/src/visual/markdown/corpus/`:
- **`commonmark/`**: the CommonMark spec examples (`spec.json`, CC-BY-SA 4.0) with their
  license and attribution file. They are test data only, never in the shipped bundle, so
  share-alike applies to that folder only.
- **`gfm/`**: GFM extension examples (tables, task lists, strikethrough, autolinks), same
  treatment.
- **`azure-devops/`**: pages written for the project in Azure DevOps Wiki style:
  - `[[_TOC_]]`, `::: mermaid`, `.attachments` images, HTML snippets;
  - hand-wrapped text, CRLF files, a BOM, no final newline, `*` bullets, `_` emphasis,
    setext headings, reference links, footnotes, grid tables.
- **`wiki/`**: this repository's own docs and specs (real-world Markdown we own).

Two checks run per file in Vitest (`fidelity.test.ts`), so they run in CI's existing
`npm test` step:
1. **Round trip**: `serialize(parse(x)) === x`.
2. **Single-block edit**: for every leaf block, change one character of its text through
   a ProseMirror transaction and serialize. The line diff against `x` must lie within that
   block's line range.

A failure lists the file, the example number and a minimal diff.

**Byte fidelity outside the editor** (verified in code):
- The server decodes with `Encoding.UTF8.GetString` and encodes with `GetBytes`
  (`PageService.cs:76`, `PageWriter.cs:159`). A BOM survives as U+FEFF and CRLF survives
  JSON transport.
- The editor treats a leading U+FEFF as part of the "file preamble" and keeps it.

## R11. Mode switch and preferences

**Decision**:
- `draft.markdown` stays the single source of truth.
- **Visual → Markdown**: serialize, hand the text to `MarkdownEditor`.
- **Markdown → Visual**: parse the current text. Fresh `src` offsets come from that text,
  so text typed in Markdown mode is preserved exactly (FR-016).
- **Cursor mapping**: the current block's source offset maps to a CodeMirror position, and
  in the other direction a CodeMirror position maps to the innermost block containing it.
- **Preference**: `localStorage['copernica.editorMode']` = `"visual" | "markdown"`, default
  `"visual"`. It is handled like `copernica.editorTab`.
- **Load-time guard fallback** (R4): opens Markdown mode without writing the preference.

## R12. Pasting formatted content

**Decision**: ProseMirror's clipboard parsing turns HTML into a detached document (it uses
`createHTMLDocument`, so nothing runs or loads) and keeps only what the schema's
`parseDOM` rules match. On top of that:
- `transformPastedHTML` strips Word/Office debris: `mso-*`, `<o:p>`, conditional comments,
  `<style>`, `<meta>`.
- `parseDOM` rules never read `style` or `on*` attributes. Links keep `href` only when its
  scheme passes the R9 allow-list.
- `<img>` with an `http(s)` or `blob:` source is dropped. One status message per paste
  says "N images from other sites were not inserted — paste or upload the image files
  instead" (spec US5-2). Clipboard image *files* go through the 003 upload flow first
  (`handlePaste` checks `clipboardData.files`).
- Plain-text paste (Ctrl/⌘+Shift+V) uses ProseMirror's `clipboardTextParser` and inserts
  paragraphs.
- Pasted content is new content, serialized fresh in the file's style.

## R13. Accessibility

**Decision**:
- The editable area is `role="textbox"`, `aria-multiline="true"`, labelled "Page content".
- **Toolbar**: the WAI-ARIA Toolbar pattern with roving tabindex. Mark buttons use
  `aria-pressed`. "Block type" is a Radix `Select` (already used in the UI). Less common
  actions go in a "More" menu (Radix `DropdownMenu`) below 768 px.
- **"/" menu**: the combobox + listbox pattern. The editor keeps focus and gets
  `aria-activedescendant`. Esc closes it, Enter inserts.
- **Atoms** (placeholders, diagrams, images) are rendered as `role="group"` or `figure`
  with an `aria-label` and are selectable by keyboard.
- **Announcements**: formatting changes ("Bold on"), block changes and mode switches go to
  the existing polite live region of `PageEdit`.
- **Tables**: Tab/Shift+Tab move between cells (`prosemirror-tables` `goToNextCell`). Row
  and column actions live in a table menu reachable from the toolbar when the cursor is in
  a table.
- The single-key shortcut guard already covers `contenteditable`
  (`useShortcuts.ts:35-39`), so FR-026 needs no change. It is tested.
- **Verification**: the existing IBM checker scan (`tests/e2e/a11y.ts`) on the visual
  editor in both themes and at 3 widths, plus keyboard-only e2e flows.

## R14. Security review

- **Display path**: the schema allow-list leads to `toDOM` with fixed tags and classes.
  No `innerHTML` and no user-derived markup. Raw HTML appears only as text inside
  placeholders.
- **URLs**: one `isAllowedUrl` function shared by links, images and paste, matching
  `HtmlSanitizerFactory` (`http`, `https`, `mailto`) plus internal forms.
- **Diagrams**: only through the sandboxed renderer (constitution, 004).
- **No server changes** to rendering or sanitizing. The preview in Markdown mode and
  published pages still use the server renderer.
- **SECURITY.md** gets a short "Visual editor" paragraph describing the above. The PR
  calls out the new dependencies and the v1.4.0 amendment.
