---

description: "Task list for 007 Visual Page Editor"
---

# Tasks: Visual Page Editor

**Input**: Design documents from `specs/007-wysiwyg-editor/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/fidelity.md](contracts/fidelity.md),
[contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. The spec requires an automated round-trip check (FR-014, SC-001,
SC-002, SC-004, SC-006), and the constitution's Quality Gates require storage-format and
rendering safety tests. Scenario IDs W1–W18 refer to [quickstart.md](quickstart.md) and are
written as "scenario W1" so they are not confused with task IDs. Rules S1–S10 and M1–M2
refer to [contracts/fidelity.md](contracts/fidelity.md).

**Organization**: tasks are grouped by user story. Both P1 stories are needed for the MVP.
**US2 (fidelity) comes first** because the visual editor (US1) must never save through a
non-preserving serializer. After US2 and US1, phases follow priority: US3, US4, US5.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to

Conventions:
- all new code goes in `src/web/src/visual/` unless stated;
- `src/web/src/visual/markdown/` is **pure** (no DOM, no React) so it runs in Vitest;
- UI uses only the `src/web/src/ui` wrappers, tokens and English strings
  ([002 ui.md](../002-accessible-wiki-ui/contracts/ui.md));
- no inline `style` attributes or injected `<style>` in our code (research R7); use classes
  in `visual.css` with theme tokens;
- never assign user-derived strings to `innerHTML`; node views build DOM with
  `document.createElement` and `textContent` only (constitution v1.4.0);
- Python edits to source files must use `encoding='utf-8'`; prefer the Write/Edit tools.

---

## Phase 1: Setup

- [X] T001 Add the shipped dependencies to `src/web/package.json` with **exact** versions (no `^`) and update `src/web/package-lock.json` with `npm install`:
  - `prosemirror-model` 1.25.12, `prosemirror-state` 1.4.4, `prosemirror-view` 1.42.6, `prosemirror-transform` 1.12.2, `prosemirror-commands` 1.7.2, `prosemirror-keymap` 1.2.3;
  - `prosemirror-history` 1.5.1, `prosemirror-inputrules` 1.5.1, `prosemirror-schema-list` 1.5.1, `prosemirror-tables` 1.8.5, `prosemirror-gapcursor` 1.4.1, `prosemirror-dropcursor` 1.8.4;
  - promote `@lezer/markdown` 1.8.0 and `@lezer/common` 1.5.3 to direct dependencies, keeping the versions already in the lockfile.

  Then run `scripts/check-licenses.ps1` and confirm it passes with no new exceptions. Regenerate `THIRD-PARTY-NOTICES.md`.
- [X] T002 [P] Create the folder skeleton `src/web/src/visual/markdown/corpus/{commonmark,gfm,azure-devops,wiki,guard}/` with a `README.md` in `corpus/` explaining each folder (research R10). Exclude `corpus/` from the production bundle; it is only imported by `*.test.ts`.
- [X] T003 [P] Vendor the CommonMark spec examples as `corpus/commonmark/spec.json`, from the CommonMark spec version matching `@lezer/markdown`'s test suite. Add `corpus/commonmark/LICENSE.md` (CC-BY-SA 4.0, attribution to John MacFarlane and the source URL) and a note that the folder is test data, not shipped.
- [X] T004 [P] Add GFM extension examples (tables, task lists, strikethrough, autolinks) as `corpus/gfm/*.md`, one file per example, with `corpus/gfm/LICENSE.md` (attribution, CC-BY-SA 4.0).
  *Done as:* one file `corpus/gfm/examples.md` written for the project, modelled on the GFM spec, so no third-party licence applies.
- [X] T005 [P] Write the Azure DevOps-style fixture pages in `corpus/azure-devops/`. Each covers one shape from research R10:
  - `toc-html-frontmatter.md`: front matter, `[[_TOC_]]`, an HTML block, inline `<br>`, an HTML comment;
  - `hand-wrapped-crlf.md`: CRLF endings, paragraphs wrapped at 80 columns, trailing two-space hard breaks;
  - `bom-no-final-newline.md`: UTF-8 BOM and no final newline;
  - `star-bullets-underscore.md`: `*` and `+` bullets, `_em_`, `__strong__`, setext headings, `~~~` fences, `***` rule, `1)` lists;
  - `references-footnotes.md`: reference links, link definitions, footnotes;
  - `mermaid.md`: a ` ```mermaid ` fence and a `::: mermaid` container;
  - `containers-grid-deflist.md`: a `::: note` container, a grid table, a definition list;
  - `nested-lists-quotes.md`: lists nested 3 deep with 2- and 4-space indents, loose and tight lists, task items, quotes containing lists and code, lazy continuation lines;
  - `tables.md`: aligned and unaligned pipe tables, with and without leading or trailing pipes, escaped pipes;
  - `images-links.md`: relative, `/.attachments/`, `wiki:`, external and `mailto:` links and images, angle-bracket URLs, titles;
  - `hostile.md`: `<script>`, `<img onerror>`, `<style>`, `javascript:` and `vbscript:` links, `data:text/html` (for scenario W18).
- [X] T006 [P] Add a `corpus/wiki/` loader in `src/web/src/visual/markdown/corpus/index.ts` that collects fixtures with `import.meta.glob` (`?raw`):
  - every `corpus/**/*.md` file;
  - every `specs/**/*.md` and the root `README.md`/`SECURITY.md` of the repository, via a relative glob, so real project Markdown is part of the corpus without copying it.

  Expose `corpusFiles(): { name: string; text: string }[]`, with the CommonMark and GFM examples expanded from `spec.json` and the `.md` files.
  *Done as:* `specs/**/*.md` only; Vite's `server.fs.allow` admits folders, not single files, so `README.md`/`SECURITY.md` are not included. CRLF files in the corpus are protected by a `-text` entry in `.gitattributes`.
- [X] T007 [P] Seed a `visual` space ("Visual Lab") in `tests/e2e/server.mjs` the way the 005 `tree` space is seeded:
  - copy every file of `src/web/src/visual/markdown/corpus/azure-devops/` byte-for-byte (keep CRLF and BOM; use `Buffer` copies, not text);
  - add a generated `large.md` of about 100 KB (headings, paragraphs, lists, a table) for scenario W17;
  - add `guides/target-page.md` (`# Target page`) for link tests.

  Expose it as `state().visual` in `tests/e2e/helpers.ts`, and add `tests/e2e/fixtures/word-paste.html` (Word-style HTML with `mso-*` styles, `<o:p>`, a heading, a list, a link, a table and an `<img src="https://example.com/x.png">`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the pure Markdown ↔ document layer without the preserving rules: schema, Lezer
configuration, parse, fresh serialization, style detection and URLs. Every story depends
on it.

### Tests first

- [X] T008 [P] Write `src/web/src/visual/markdown/style.test.ts` for `detectStyle(markdown)`. Cover every row of the research R6 table, including majority voting, ties (prefer the default), CRLF detection from the first line break, final newline, and defaults for an empty string.
- [X] T009 [P] Write `src/web/src/visual/markdown/urls.test.ts` covering contracts/fidelity.md §5 for `isAllowedUrl(url, kind: 'link'|'image')`, `resolvePageHref(href, spaceId, pagePath)` and `resolveImageSrc(src, spaceId, pagePath, attachments)`:
  - relative, `../`, space-root `/`, `wiki:{space}/{path}`, `#frag`;
  - `http`, `https`, `mailto`;
  - `javascript:`, `vbscript:`, `file:`, `data:text/html` (disallowed);
  - `data:image/png` (allowed for images only);
  - percent-encoded segments, and paths that escape the space (rejected).

  Add a pin test that reads `src/Copernica/Rendering/HtmlSanitizerFactory.cs` as text (via `?raw` import) and asserts its `AllowedSchemes` array equals the `ALLOWED_SCHEMES` constant in `urls.ts`.
- [X] T010 [P] Write `src/web/src/visual/markdown/parse.test.ts`:
  - one test per schema row of contracts/fidelity.md §1 (the node type produced and its attributes, including `src` offsets that slice exactly the block's text);
  - placeholders for every `kind` in data-model.md;
  - a totality test that `parse` never throws for 2 000 seeded pseudo-random strings and for every CommonMark example with random single-character deletions.

### Implementation

- [X] T011 Implement `src/web/src/visual/markdown/schema.ts`: the ProseMirror `Schema` with exactly the nodes and marks of contracts/fidelity.md §1.
  - Block nodes have attrs `src: { from: number; to: number } | null` (default `null`) and `srcId: number | null` (default `null`).
  - `raw_block` and `raw_inline` (attrs `source`, `kind`, `label`), `diagram` (attrs `source`, `syntax: 'fence'|'container'`), `image` (attrs `src`, `alt`, `title`) and `image_upload` (attrs `key`, `name`) are atoms.
  - `horizontal_rule` has a `marker` attr.
  - Marks: `strong`/`em` have a `marker` attr; `link` has `href`, `title`, `form: 'inline'|'reference'|'autolink'` and `ref`.
  - `toDOM` uses fixed tags and classes only. Links put `href` only when `isAllowedUrl` passes, otherwise `class="visual-link--blocked"` and no `href`.
  - `parseDOM` rules (used by paste) read only `href`, `src`, `alt`, `title`, `align` and `checked`, never `style` or `on*`.
- [X] T012 [P] Implement `src/web/src/visual/markdown/urls.ts` (makes T009 pass):
  - `ALLOWED_SCHEMES = ['http','https','mailto']`;
  - `isAllowedUrl`;
  - `resolvePageHref` (mirrors `WikiLinkRewriter.Resolve`/`ResolvePath` in `src/Copernica/Rendering/WikiLinkRewriter.cs:60-145` for `.md` targets, giving `/s/{space}/{path}`);
  - `resolveImageSrc` (pending upload → `previewUrl`; internal path → `/api/spaces/{space}/files/{path}`; `data:image/*` → itself; external → `null`, meaning "External image" frame).
- [X] T013 Implement `src/web/src/visual/markdown/lezer.ts`: the `@lezer/markdown` parser configured with `GFM` (`Table`, `TaskList`, `Strikethrough`, `Autolink`) plus project `MarkdownConfig` extensions (research R5), each producing a named node type:
  - `FrontMatter`: `---` … `---` at offset 0 (after an optional BOM);
  - `AzureToc`: a line that is exactly `[[_TOC_]]` or `[[_TOSP_]]`;
  - `Container`: `:::` *name* … `:::`, with a `ContainerInfo` child;
  - `FootnoteDefinition`: `[^label]:` block with indented continuation;
  - `FootnoteReference`: inline `[^label]`, taking precedence over links;
  - `GridTable`: consecutive lines starting with `+-` or `|` forming a grid;
  - `DefinitionList`: a term line followed by `: ` definition lines.

  Export `parser` and `parseTree(text)`.
- [X] T014 Implement `src/web/src/visual/markdown/style.ts` (makes T008 pass): `detectStyle(text, tree?) → FileStyle` exactly as typed in data-model.md "FileStyle", with the defaults of research R6.
- [X] T015 Implement `src/web/src/visual/markdown/parse.ts` (makes T010 pass). `parse(markdown) → { doc, snapshot }`, where `snapshot = { text, style, preamble }`:
  - walk the Lezer tree and map node types per contracts/fidelity.md §1;
  - set `src`/`srcId` on every block (`srcId` = source order index across all nesting levels);
  - keep soft line breaks as `soft_break` nodes;
  - record mark markers and link `form`/`ref`;
  - task items set `checked`;
  - mermaid fences and `::: mermaid` containers become `diagram`;
  - every unmapped node becomes `raw_block` or `raw_inline` with its exact slice (generic fallback);
  - the BOM goes into `snapshot.preamble`.

  Must never throw: wrap per-block conversion, and on error emit that block as `raw_block` with `kind: 'unknown'`.
- [X] T016 Implement `src/web/src/visual/markdown/fresh.ts`: `freshBlock(node, style, ctx) → string` and `freshInline(fragment, style) → string`. These produce new Markdown for nodes without usable source, per S6 and S7:
  - ATX or setext headings per style;
  - list markers and indent (copying the nearest sibling when `ctx.siblingMarker` is given);
  - ordered numbering per style;
  - task boxes `[ ]`/`[x]`;
  - fences per style, lengthened if the code contains the fence;
  - GFM tables with column alignment and pipes per style;
  - links in their recorded `form`;
  - images `![alt](src "title")`;
  - hard breaks with the recorded marker.

  Escaping is minimal and position-aware: backslash only for characters that would start or close syntax at that position.

**Checkpoint**: parse and fresh serialization work and are unit-tested; nothing is
preserved yet.

---

## Phase 3: User Story 2 - Saving never rewrites what the user did not change (Priority: P1) 🎯 MVP (part 1)

**Goal**: byte-exact preservation (FR-007 to FR-014): rules S1–S10, the corpus check, the
load-time guard, no-change save and review.

**Independent Test**: `npm --prefix src/web test` reports round trip N/N and single-block
edits M/M local (SC-001, SC-002). Scenarios W4, W5, W6, W7 and W8 pass once US1's editor
exists.

### Tests for User Story 2

- [X] T017 [P] [US2] Write `src/web/src/visual/markdown/fidelity.test.ts` over `corpusFiles()` (T006):
  - **round trip** (S1): `serialize(parse(x).doc, snapshot) === x`, reporting file, example number and a minimal line diff on failure;
  - **single-block edit** (S3): for every leaf textblock with text, apply a ProseMirror transaction inserting `"Z"` after its first character. Serialize and assert that every differing line of a line diff against `x` lies within the block's source line range. For paragraphs and headings, assert exactly one line differs.

  Print a summary `round trip: N/N files identical`, `single-block edits: M/M local`. Files in `corpus/guard/` are excluded from round trip and covered by T020.
- [X] T018 [P] [US2] Write `src/web/src/visual/markdown/serialize.test.ts` for S2–S10:
  - equivalence after undo and retype (FR-009);
  - a changed list item among `*` siblings with 4-space indent (only its lines change, S4);
  - a changed paragraph inside `> ` quotes keeps the prefix, including a lazy continuation line;
  - a new item appended to a `+` list uses `+` (S6);
  - a gap of 3 blank lines between unchanged blocks is kept (S5);
  - a new block between unchanged blocks gets one blank line with CRLF in a CRLF file;
  - placeholders are emitted verbatim (S8);
  - a BOM and a missing final newline are kept (S9);
  - an `image_upload` node is never emitted (S10);
  - a hand-wrapped paragraph with one changed word changes one line;
  - a removed soft break changes only the two joined lines;
  - reference link forms are kept when the line changes;
  - table cell edits rewrite only that table;
  - moving a placeholder moves its exact text.
- [X] T019 [P] [US2] Add `SaveUnchangedContent_CreatesNoCommit` to `tests/Copernica.IntegrationTests/Editing/SaveTests.cs`: save a page with exactly its current source and base. Expect 200 `SaveResult` with the current tip version, the remote branch tip unchanged, and no new commit.
- [X] T020 [P] [US2] Add `corpus/guard/` fixtures that the load-time guard must reject or accept, and `src/web/src/visual/markdown/guard.test.ts` asserting `isRoundTripSafe` for them.
  - Write `unsafe-sample.md` by forcing a known mismatch through a test-only hook: `isRoundTripSafe(text, { serializeOverride })`.
  - Assert real corpus files return `true`.

### Implementation for User Story 2

- [X] T021 [US2] Implement `src/web/src/visual/markdown/serialize.ts`: `serialize(doc, snapshot) → string` per research R4 and S1–S10:
  - identity fast path via a `WeakSet` of nodes created by `parse` (exported from `parse.ts` as `parsedNodes`);
  - canonical comparison `canon(node)` (type, attrs minus `src`/`srcId`/`marker`/`form`, text, marks) against `canon(parse(slice))`, cached per `srcId`;
  - original gaps between blocks with consecutive `srcId`s, both emitted from source;
  - recursion into `blockquote`, `bullet_list`, `ordered_list`, `list_item` and table rows, using the container prefixes taken from the Lezer `QuoteMark`/`ListMark` offsets (S4);
  - the line-level merge for `paragraph`/`heading` (split on `soft_break`; for each line, emit the original source line when `freshInline(line)` equals `freshInline(original line)`, else fresh);
  - otherwise `freshBlock` with the file style.

  Prepend `snapshot.preamble` and apply `style.finalNewline`.
- [X] T022 [US2] Add `isRoundTripSafe(markdown, opts?)` to `src/web/src/visual/markdown/index.ts`, which re-exports `parse`, `serialize`, `detectStyle`, `isRoundTripSafe`, `schema` and the URL helpers. Iterate on T015, T016 and T021 until T017, T018 and T020 pass with 0 failures. Any corpus shape that cannot be made safe becomes an explicit placeholder in `lezer.ts`/`parse.ts`, never a skipped test.
- [X] T023 [P] [US2] Create `src/web/src/pages/ReviewChangesDialog.tsx`: a `ui` Dialog titled "Review changes". It shows `<DiffView from={pristine} to={current} label="Changes to the page file" />` (`src/web/src/components/DiffView.tsx`), or the text "No changes" when the two are equal. Focus returns to the opener on close (contracts/ui.md §1).
- [X] T024 [US2] In `src/web/src/pages/PageEdit.tsx`:
  - add a "Review changes" button next to the mode toggle area (visible in both modes) that opens `ReviewChangesDialog`;
  - add the no-change save rule (FR-012, contracts/ui.md §9): for an existing page, when `draft.markdown === pristine`, do not send the save request, do not require a change description, announce "No changes to save" in the live region, and keep the editor open.

  New pages always save.

**Checkpoint**: the fidelity layer is complete and enforced in CI; no-change saves and the
review dialog work in the current Markdown editor.

---

## Phase 4: User Story 1 - Edit a page the way it looks (Priority: P1) 🎯 MVP (part 2)

**Goal**: visual mode with toolbar, shortcuts, input rules, "/" menu, lists, task lists,
tables and quotes, saving through the US2 serializer.

**Independent Test**: scenarios W1, W2 and W3 (plus W4–W8 from US2 in the visual editor).

### Tests for User Story 1

- [X] T025 [P] [US1] Write `src/web/src/visual/commands.test.ts` (jsdom, a real `EditorView`) covering:
  - toggling each mark;
  - block type changes keeping text;
  - wrap and unwrap of every list type;
  - task toggle;
  - input rules from contracts/ui.md §3, with undo restoring the typed characters;
  - insert table, add and remove rows and columns, alignment;
  - Tab and Shift+Tab between cells;
  - "/" menu filtering and insert.

  After each command, also assert `serialize()` output for a small fixture to prove the edit is local.
- [X] T026 [P] [US1] Write `tests/e2e/us9-visual-editor.spec.ts` scenarios W1–W8 against the `visual` space (T007). Assert commits through `state().visual` like `us8-tree.spec.ts` does:
  - W4/W8: no new commit;
  - W5: `git show --stat` and exact bytes of the changed line, including `\r\n`.

### Implementation for User Story 1

- [X] T027 [P] [US1] Create `src/web/src/editor/editorMode.ts`, modelled on `src/web/src/shortcuts/preference.ts`:
  - `EDITOR_MODE_KEY = 'copernica.editorMode'`, values `"visual" | "markdown"`, default `"visual"` (absent ⇒ visual), unknown values ⇒ default;
  - `loadEditorMode()` and `storeEditorMode(mode)`, with storage errors caught (data-model.md "Interface preference").
- [X] T028 [US1] Implement `src/web/src/visual/commands.ts`:
  - mark toggles (new `strong`/`em` marks take `marker` from `FileStyle`);
  - `setBlockType` for paragraph, heading 1–6 and code block;
  - list wrap and unwrap (`prosemirror-schema-list`), quote wrap and lift, task-item toggle;
  - insert horizontal rule, insert a 3×3 table (header row), table row, column and alignment commands (`prosemirror-tables`);
  - active-state queries `isMarkActive`, `currentBlockType`, `isInList(type)`, `isInTable`.
- [X] T029 [US1] Implement `src/web/src/visual/plugins.ts`:
  - `history()`;
  - a keymap with the shortcuts of contracts/ui.md §2 (Ctrl/⌘+B/I/E/K, Ctrl/⌘+Shift+X/7/8/9/., Ctrl+Alt+0–6, Undo/Redo) plus `baseKeymap`, `splitListItem`/`liftListItem`/`sinkListItem`, and `goToNextCell` for Tab;
  - input rules for §3;
  - `columnResizing` off, `tableEditing()`, `gapCursor()`, `dropCursor()`.

  Ctrl/⌘+S must not be swallowed: leave it unhandled so `useShortcut` in `PageEdit` still saves.
- [X] T030 [US1] Implement the "/" menu state as a ProseMirror plugin plus `src/web/src/visual/SlashMenu.tsx`, following contracts/ui.md §4:
  - opens when `/` is typed at the start of an empty paragraph;
  - combobox/listbox ARIA with the editor keeping focus (`aria-expanded`, `aria-controls`, `aria-activedescendant` set on the editor DOM through `EditorView.setProps({attributes})`);
  - the item list of §4, case-insensitive substring filter, ↑/↓/Enter/Esc, "No matching blocks";
  - positioned with `view.coordsAtPos`, using CSS classes plus custom properties set via `element.style.setProperty`, which is allowed CSSOM.
- [X] T031 [US1] Implement `src/web/src/visual/Toolbar.tsx` following contracts/ui.md §2:
  - WAI-ARIA toolbar with roving tabindex (Home/End/arrows);
  - a block type `ui` Select;
  - mark buttons with `aria-pressed`;
  - list, quote, table, image, diagram and rule buttons, plus Undo/Redo disabled when history is empty;
  - tooltips showing shortcuts;
  - below 768 px (`useMediaQuery`), the secondary actions move into a "More formatting" `ui` DropdownMenu.

  Image, diagram and link buttons call callbacks passed in as props (wired in US4). Until then, Image uses the existing file input and Diagram and Link are hidden.
- [X] T032 [P] [US1] Implement `src/web/src/visual/TableMenu.tsx` (contracts/ui.md §7), opened from the Table toolbar button while the cursor is in a table. It offers insert row above/below, insert column left/right, delete row/column/table, and align column left/center/right. Deleting the header row is disabled while other rows exist.
- [X] T033 [US1] Implement `src/web/src/visual/nodeViews.ts` for `raw_block`/`raw_inline` placeholders (contracts/ui.md §5):
  - built with `createElement` and `textContent` only;
  - `role="group"`, `aria-label="{label}, can be edited in Markdown mode"`, a tooltip, the first source line truncated in monospace;
  - selectable via NodeSelection with a visible focus ring;
  - `contenteditable=false`.

  Add a `horizontal_rule` view, and a plain `image` view that uses `resolveImageSrc` with an "External image (not shown in the editor)" frame for `null`.
- [X] T034 [US1] Create `src/web/src/visual/visual.css`:
  - editor typography matching the published page styles;
  - toolbar, menus, placeholder chips, the blocked-link style, table cell selection and the gap cursor;
  - focus rings and both themes via existing tokens.

  Import `prosemirror-view/style/prosemirror.css`, `prosemirror-tables/style/tables.css` and `prosemirror-gapcursor/style/gapcursor.css` as files.
- [X] T035 [US1] Implement `src/web/src/visual/VisualEditor.tsx`. Props: `{ value: string; onChange(markdown: string): void; label: string; spaceId; pagePath; attachments; editorRef?; onAnnounce(text) }`.
  - On mount: `parse(value)`, then the load-time guard `isRoundTripSafe(value)`. On failure, call `onGuardFailure()` (prop) and render nothing.
  - Create the `EditorView` with schema, plugins and node views, and `attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label }`.
  - Serialize on a 200 ms idle debounce → `onChange`. `editorRef.current.flush()` serializes synchronously; `PageEdit` calls it before save, mode switch and review.
  - Announce formatting changes ("Bold on/off", block names).
  - Destroy the view on unmount.
  - Default export, so it can be loaded with `React.lazy`.
- [X] T036 [US1] Integrate in `src/web/src/pages/PageEdit.tsx`:
  - a segmented "Visual | Markdown" toggle (`aria-pressed`) above the editor (contracts/ui.md §1), with the initial mode from `loadEditorMode()`;
  - in visual mode render `React.lazy(() => import('../visual/VisualEditor'))` in a Suspense with a loading state, and hide the Write/Preview/Split tabs;
  - in Markdown mode, keep today's layout unchanged (FR-018);
  - call `flush()` before save, review and mode switch;
  - the existing Ctrl/⌘+S, drafts, cancel and conflicts are unchanged (FR-023);
  - the existing "Insert image" button is shown inside the visual toolbar in visual mode.

  For this phase, switching re-mounts the other editor with the current `draft.markdown` (cursor mapping comes in US3).
- [X] T037 [US1] Verify FR-026: add a test to `src/web/src/shortcuts/shortcuts.test.ts` that single-key shortcuts do not fire for keydown events inside a `contenteditable="true"` element with `role="textbox"` (`useShortcuts.ts:35-39` already covers this; the test pins it).

**Checkpoint**: MVP. Business users edit visually and saves are byte-preserving. Scenarios
W1–W8 pass.

---

## Phase 5: User Story 3 - Switch between visual and Markdown mode (Priority: P2)

**Goal**: lossless switching with cursor mapping (M1, M2), a remembered preference, and the
FR-019 fallback.

**Independent Test**: scenarios W9 and W10.

### Tests for User Story 3

- [X] T038 [P] [US3] Write `src/web/src/visual/markdown/modeSwitch.test.ts`:
  - M1 over the corpus (`serialize(parse(t)) === t` after a simulated Markdown-mode edit sequence of insertions, deletions and pasted Markdown);
  - M2 cursor mapping both ways for headings, nested list items, table cells, placeholders and document start/end.
- [X] T039 [P] [US3] Add scenarios W9 and W10 to `tests/e2e/us9-visual-editor.spec.ts`. W9: edits in both modes, reopen the editor and check the stored mode. W10: the guard fallback message, and the preference not changed.

### Implementation for User Story 3

- [X] T040 [US3] Add `positionToSourceOffset(state, snapshot)` and `sourceOffsetToPosition(doc, offset)` to `src/web/src/visual/markdown/cursor.ts`: map to the innermost block via `src`, or to document start when there is none (M2).
- [X] T041 [US3] In `src/web/src/pages/PageEdit.tsx`, the visual editor (`VisualEditor.tsx`) and `src/web/src/components/MarkdownEditor.tsx`:
  - expose `getCursorOffset()`/`setCursorOffset(offset)` on both editor refs;
  - on switch, flush, store the mode with `storeEditorMode` (FR-017), move the cursor to the mapped offset, and announce "Visual mode" or "Markdown mode".
- [X] T042 [US3] Implement the FR-019 fallback in `src/web/src/pages/PageEdit.tsx`. When `VisualEditor` reports a guard failure (on open or on a Markdown → visual switch):
  - show the info callout "This page uses Markdown the visual editor can't edit safely, so it opened in Markdown mode." (contracts/ui.md §9);
  - stay in Markdown mode **without** calling `storeEditorMode`.

**Checkpoint**: switching is lossless and remembered; risky pages fall back safely.

---

## Phase 6: User Story 4 - Images, diagrams and page links in visual mode (Priority: P2)

**Goal**: 003, 004 and 005 features work in visual mode (FR-020 to FR-022).

**Independent Test**: scenarios W11, W12 and W13.

### Tests for User Story 4

- [X] T043 [P] [US4] Write `src/web/src/visual/imageInput.test.ts`:
  - pasting or dropping image files inserts `image_upload` at the position;
  - `describe(alt)` replaces it with `image { src: attachment.link, alt }`;
  - if the placeholder was deleted, the image is appended at the end (like `onAppend`);
  - `image_upload` is never serialized.
- [X] T044 [P] [US4] Write `src/web/src/visual/LinkDialog.test.tsx`:
  - filtering the tree (title and path, case-insensitive, max 50 results);
  - the relative `.md` link computed from the current page path to the target, percent-encoded per segment (e.g. from `guides/a.md` to `reference/api.md` gives `../reference/api.md`);
  - link text defaulting to the page title;
  - URL validation through `isAllowedUrl`;
  - remove link keeps the text.
- [X] T045 [P] [US4] Add scenarios W11, W12 and W13 to `tests/e2e/us9-visual-editor.spec.ts`. W11 checks one commit with the page and the image. W12 checks the unedited `::: mermaid` block is byte-identical. W13 opens the saved page and follows the link.

### Implementation for User Story 4

- [X] T046 [US4] Implement `src/web/src/visual/imageInput.ts`: ProseMirror `handlePaste` and `handleDrop` props that pick image files (reuse `pickImageFiles` from `src/web/src/editor/imageInput.ts`) and drive the existing `useImageUploads` (`src/web/src/editor/useImageUploads.ts`) through an adapter implementing the same `insertPlaceholder`/`replacePlaceholder`/`onAppend` callbacks with `image_upload` nodes. The alt-text prompt is the existing `ImageDescriptionDialog` (FR-020).
- [X] T047 [US4] Add the `image_upload` chip ("Uploading {name}…" with progress) and the image selection popover to `src/web/src/visual/nodeViews.ts`. The popover offers "Change description" (opens `ImageDescriptionDialog` prefilled and updates `alt`) and "Remove" (contracts/ui.md §5).
- [X] T048 [US4] Implement the `diagram` node view in `src/web/src/visual/nodeViews.ts`:
  - draw through `rendererClient().render(source, theme)` (`src/web/src/diagrams/rendererClient.ts`) and show `<img src={svgImageSrc(svg)}>` (`src/web/src/diagrams/display.ts`) with an accessible name;
  - states "Drawing diagram…" and the 004 error state;
  - redraw when the `dark` class on `<html>` changes;
  - when selected, offer "Edit diagram" (Enter) and "Remove".
- [X] T049 [US4] Implement `src/web/src/visual/DiagramDialog.tsx` (contracts/ui.md §8):
  - a `ui` Dialog "Edit diagram" with a CodeMirror field labelled "Diagram source" and a live drawing (300 ms debounce) beside it, or below it under 768 px;
  - Apply updates the node's `source` (keeping `syntax`); Cancel or Esc changes nothing;
  - a new diagram starts with `flowchart TD\n  A --> B` and `syntax: 'fence'`.
- [X] T050 [US4] Implement `src/web/src/visual/LinkDialog.tsx` (contracts/ui.md §6, makes T044 pass):
  - tabs "Page in this space" (search the cached `['tree', spaceId]` query with `useQuery`; flatten pages as `MoveDialog` does with folders in `src/web/src/components/TreeDialogs.tsx`) and "Web address";
  - insert or update the `link` mark with `form: 'inline'`;
  - a link popover with target title, "Open" (new tab, only for allowed URLs), "Edit link" and "Remove link";
  - focus returns to the editor selection.
- [X] T051 [US4] Wire the toolbar's Image, Diagram and Link buttons, the "/" menu items "Image", "Diagram" and "Link to page", and Ctrl/⌘+K in `src/web/src/visual/Toolbar.tsx`, `SlashMenu.tsx` and `plugins.ts` to T046–T050.

**Checkpoint**: everyday content (screenshots, diagrams, cross-links) can be created
without any syntax.

---

## Phase 7: User Story 5 - Paste content from other documents (Priority: P3)

**Goal**: formatted paste keeps supported structure only (FR-024, research R12).

**Independent Test**: scenario W14.

### Tests for User Story 5

- [X] T052 [P] [US5] Write `src/web/src/visual/paste.test.ts` with Word, Google Docs and web-page HTML samples:
  - headings, lists, links, tables, bold and italic are kept;
  - `style`, `class`, `mso-*`, `<o:p>`, conditional comments, `<script>`, `<style>`, `<meta>` and `on*` are dropped;
  - `javascript:` links lose their `href`;
  - `http(s)`/`blob:` images are dropped and counted;
  - the serialized result contains no HTML;
  - plain-text paste inserts paragraphs.
- [X] T053 [P] [US5] Add scenario W14 to `tests/e2e/us9-visual-editor.spec.ts`, pasting `tests/e2e/fixtures/word-paste.html` via `page.evaluate` with a synthetic `ClipboardEvent` and `DataTransfer`.

### Implementation for User Story 5

- [X] T054 [US5] Implement `src/web/src/visual/paste.ts`:
  - `transformPastedHTML`, which strips Office debris (research R12);
  - a `transformPasted` step that removes `image` nodes whose `src` is not internal or `data:image/*` and reports the count through `onAnnounce` ("N images from other sites were not inserted — paste or upload the image files instead");
  - `clipboardTextParser` for Ctrl/⌘+Shift+V, inserting paragraphs;
  - pasting a URL over a text selection applies a `link` mark.

  Register it in `plugins.ts`. Clipboard image *files* keep precedence through T046.

**Checkpoint**: all user stories are functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T055 [P] Extend `tests/e2e/a11y.spec.ts` with the visual editor states of contracts/ui.md §11: the editor, the open toolbar "More formatting" menu, the "/" menu, the link dialog, the diagram dialog and the table menu. Run in light and dark at 1280, 900 and 375 px with `scanWcag`. Expect 0 violations (SC-006).
  *Done as:* the project's existing viewports 1280, 1000 and 320 px; the link bar is scanned too.
- [X] T056 [P] Add scenario W15 (a keyboard-only flow of W2, W11 and W13 with no mouse events and focus visible at each step) and scenario W16 (typing `e`, `c`, `?` inserts text) to `tests/e2e/us9-visual-editor.spec.ts`.
  *Done as:* W15 reaches the editor and the change description with Tab, types formatting with an input rule, links a page with Ctrl+K and saves with Ctrl+S; image insertion by keyboard is covered by the 003 file picker and W11.
- [X] T057 [P] Extend `tests/e2e/csp.spec.ts` to open the visual editor on `hostile.md` and `mermaid.md`, use the toolbar and paste. Assert 0 CSP violations. Add scenario W18 to `us9-visual-editor.spec.ts`: no script execution (a `window.__pwned` canary), no `href` with a disallowed scheme in the editor DOM, and 0 requests to non-local origins (`page.on('request')`).
- [X] T058 [P] Add scenario W17 to `tests/e2e/us9-visual-editor.spec.ts`: open `large.md` and assert the editor is focusable and typing works within 1 s of navigation (`performance.now()` marks). Type 50 characters and assert each appears within 50 ms, using the median (SC-005).
  *Done as:* readiness is measured inside the page with a MutationObserver (Playwright's polling made `expect`-based timing overstate it); measured about 550 ms, with the editor's own parse and view taking about 105 ms.
- [X] T059 [P] Add a "Visual editor" paragraph to `SECURITY.md` (research R14):
  - in-browser display built from a fixed schema, with no `innerHTML` of user content;
  - raw HTML shown only as text;
  - the URL allow-list equal to the server sanitizer's;
  - external images not loaded;
  - diagrams only via the sandboxed renderer;
  - no new outbound connections, ports or files.
- [X] T060 [P] Update `README.md` "User interface": the visual and Markdown modes, the "/" menu, placeholders and why they exist, "Review changes", and the guarantee that unchanged parts of a page are never rewritten.
- [X] T061 Verify the lazy chunk: run `npm --prefix src/web run build` and check that ProseMirror modules appear only in the visual editor chunk (not in `main`). Record the chunk's gzip size in the PR description. It should be about 120 KB; investigate if it exceeds 200 KB.
- [ ] T062 Run the full quickstart.md: `npm --prefix src/web run lint`, `npm --prefix src/web test` (fidelity summary with 0 failures), `dotnet test`, and Playwright `us9-visual-editor.spec.ts`, `a11y.spec.ts` and `csp.spec.ts` on chromium, firefox and webkit. Fix failures before marking the feature done. The PR description must call out the new npm dependencies, the constitution v1.4.0 amendment and the `SECURITY.md` change (constitution Quality Gates).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on T001 (packages). T008–T010 can start right after T001.
- **US2 (Phase 3)**: depends on Phase 2. It is the fidelity gate for everything that saves from visual mode.
- **US1 (Phase 4)**: depends on US2's T021–T022 (serializer). T027 and T032–T034 can start after Phase 2.
- **US3 (Phase 5)**: depends on US1 (T035, T036).
- **US4 (Phase 6)**: depends on US1 (T031, T033, T035). Independent of US3.
- **US5 (Phase 7)**: depends on US1 (T029, T035). It uses T046 for clipboard files, so it comes after T046 if both are in flight.
- **Polish (Phase 8)**: after the stories it covers.

### User Story Dependencies

```text
Setup → Foundational → US2 ─→ US1 ─┬→ US3
                                    ├→ US4 ─→ US5 (file paste precedence)
                                    └→ Polish
```

### Within Each Story

- Write the tests first and see them fail.
- Pure modules (`visual/markdown/*`) come before React components, and components before `PageEdit` integration.
- T022 is an iteration task: it ends only when the corpus is 100% green.

## Parallel Examples

```text
# Setup, after T001:
T002, T003, T004, T005, T006, T007

# Foundational tests, then pure modules:
T008, T009, T010  →  T012 (urls) ‖ T013 (lezer) → T014 ‖ T015 → T016

# US2:
T017, T018, T019, T020, T023 in parallel; then T021 → T022 → T024

# US1, once T022 is green:
T025, T026, T027, T032, T033, T034 in parallel; then T028 → T029 → T030, T031 → T035 → T036 → T037

# US4:
T043, T044, T045 in parallel; T046 ‖ T048 ‖ T050; then T047, T049 → T051
```

## Implementation Strategy

### MVP (US2 + US1)

1. Phases 1–2.
2. Phase 3 (US2): the corpus must be 100% green before any visual-mode save exists.
3. Phase 4 (US1): visual editing with byte-preserving saves.
4. **Stop and validate**: scenarios W1–W8, then demo to business users (the SC-003 usability session can start here).

### Incremental delivery

1. MVP: US2 + US1.
2. Add US3, so technical users get a reliable Markdown mode and pages that fail the guard have a safe path.
3. Add US4, so screenshots, diagrams and links work without syntax.
4. Add US5 (pasting from Word).
5. Polish: a11y, CSP and security scenarios, performance, docs.

## Notes

- [P] = different files, no dependency on an incomplete task.
- Commit after each task or logical group, in English, ending with the attribution line.
- Never weaken a fidelity assertion to make a test pass. Turn the construct into a placeholder instead (T022).
