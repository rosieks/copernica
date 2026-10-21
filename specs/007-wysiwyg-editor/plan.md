# Implementation Plan: Visual Page Editor

**Branch**: `007-wysiwyg-editor` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-wysiwyg-editor/spec.md`

## Summary

The editor gets a visual mode built on **ProseMirror**, with **`@lezer/markdown`** (already
in the lockfile) as its parser. A pure TypeScript fidelity layer converts between Markdown
and the editor document:
- Every block remembers the exact offsets of its source text.
- On save, a block whose content is still equivalent to its source is written back byte
  for byte. Only new or changed blocks are serialized, in the file's detected style.
- The comparison recurses into quotes and list items, and works line by line inside
  paragraphs.
- Anything the schema does not cover becomes a read-only placeholder that holds its
  verbatim text.
- When a page is opened, a load-time guard checks `serialize(parse(x)) === x`. If the
  check fails, the page opens in Markdown mode.
- A Vitest corpus check over CommonMark, GFM, Azure DevOps-style and repository Markdown
  enforces round trip and edit locality in CI.

Existing behaviour is reused:
- images through `useImageUploads` (003);
- diagrams through the sandboxed `rendererClient` (004), edited in a dialog;
- page links through a picker over the cached space tree that writes relative `.md` links
  (005);
- drafts, save and conflicts unchanged (001).

**Server-side changes**: none apart from tests (a missing integration test for "save
unchanged → no commit") and the `SECURITY.md` text. Display in the browser follows the
constitution v1.4.0 visual-editor exception.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), React 19; C# 14 / .NET 10 (tests only)

**Primary Dependencies**:
- new, shipped, all MIT: `prosemirror-model` 1.25.12, `-state` 1.4.4, `-view` 1.42.6,
  `-transform` 1.12.2, `-commands` 1.7.2, `-keymap` 1.2.3, `-history` 1.5.1,
  `-inputrules` 1.5.1, `-schema-list` 1.5.1, `-tables` 1.8.5, `-gapcursor` 1.4.1,
  `-dropcursor` 1.8.4 (plus their MIT transitive deps `orderedmap`, `rope-sequence`,
  `w3c-keyname`);
- promoted to direct (already present): `@lezer/markdown` 1.8.0, `@lezer/common` 1.5.3;
- reused: CodeMirror (diagram dialog, Markdown mode, DiffView), Radix UI.

**Storage**: none new. Browser `localStorage` key `copernica.editorMode` (data-model).

**Testing**:
- Vitest: fidelity corpus, serializer, style, mode switch, URL allow-list, parse totality,
  editor commands;
- xUnit: no-change save;
- Playwright: W1–W18 in `us9-visual-editor.spec.ts`, IBM WCAG scan, CSP suite.

**Target Platform**: unchanged; browsers per the constitution

**Project Type**: web application (server + embedded SPA), one artifact

**Performance Goals**:
- editor ready ≤ 1 s for 100 KB pages (SC-005);
- serializing an unchanged page is linear in the number of blocks (identity fast path);
- reading pages unaffected (the visual editor is a lazy chunk of about 120 KB min+gz).

**Constraints**:
- byte-exact preservation (FR-007);
- CSP unchanged (no `<style>` injection, no eval);
- no `innerHTML` of user-derived content;
- no new endpoints;
- no outbound requests (external images are not loaded in the editor).

**Scale/Scope**: 5 user stories, 27 FRs; 1 fidelity module, 1 editor component with
toolbar, menus and 3 dialogs, 1 adapter each for images, diagrams and links; 0 server
features.

No open unknowns (research R1–R14).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / rule | Status | Evidence |
|---|------------------|--------|----------|
| I | English artifacts | ✅ | All artifacts and UI strings in English |
| II | No new egress; assets bundled; single artifact | ✅ | Bundled lazy chunk. External images are never loaded in the editor (R9) and the CSP `img-src 'self' data:` is unchanged. The e2e security scenario W18 asserts 0 external requests |
| III | Safe content; nothing forbidden; transparency | ✅ | The schema is an allow-list. `toDOM` uses fixed tags and classes. Raw HTML only as placeholder text. URL allow-list equals the sanitizer's, pinned by a test. Paste is parsed in a detached document and filtered by the schema (R12). No user code executed. `SECURITY.md` gets a "Visual editor" paragraph |
| IV | Dependencies justified, permissive, pinned | ✅ | ProseMirror: 12 MIT packages + 3 MIT transitive, pinned exactly with the lockfile. Justified in R1: a structured, schema-limited editing model is not feasible with the standard DOM APIs. `contenteditable` alone gives no document model, undo or schema. Lezer is already shipped (via CodeMirror) and is only promoted to direct. Rejected: TipTap, Milkdown, BlockNote (MPL-2.0), Lexical, Toast UI (R1). `check-licenses.ps1` needs no new exceptions |
| V | Git source of truth; one commit per save; conflicts; YAGNI | ✅ | Markdown in git stays the only content. Byte-exact preservation protects history (FR-007). No-change saves create no commit. Save and conflict paths are unchanged. No collaborative editing, no stored editor state |
| Sec | Strict CSP; no inline scripts or eval | ✅ | The policy is unchanged. ProseMirror injects no styles. The CSP e2e suite covers the visual editor |
| Sec | Server-side rendering rule + v1.4.0 visual-editor exception | ✅ | Each condition of the exception is met: schema-built display without `innerHTML` (contract fidelity §1); user HTML only as placeholders (R5); URL schemes as the server (fidelity §5); diagrams only through the isolated renderer (R9); published pages, versions and the Markdown-mode preview still server-rendered |
| Stack | React + TS + Vite; WCAG 2.1 AA | ✅ | React component around the ProseMirror view. Toolbar, combobox and dialog patterns (R13). IBM WCAG scan in both themes and at 3 widths |
| QG | Tests for rendering, auth on write paths, conflicts, storage; security call-outs | ✅ | The fidelity corpus covers storage-format integrity. Write paths are unchanged, existing tests remain, plus the no-change save test. PR calls out: new dependencies and the constitution v1.4.0 amendment (already merged on this branch) |

**Post-design re-check (after Phase 1)**: ✅. No violations.
- The design adds no endpoint, storage or CSP change.
- The only new trust boundary is the in-browser display, and it is bounded exactly by the
  amendment's conditions.
- Complexity is limited to the fidelity layer, which the spec's hard requirement demands
  (see Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/007-wysiwyg-editor/
├── plan.md
├── research.md          # R1–R14
├── data-model.md        # preference, draft, editor document entities
├── quickstart.md        # W1–W18
├── contracts/
│   ├── fidelity.md      # schema, serialize rules S1–S10, URL allow-list, tests
│   └── ui.md            # layout, toolbar, "/" menu, dialogs, tables, a11y
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/web/
├── package.json                      # + prosemirror-* (pinned), @lezer/markdown + @lezer/common direct
└── src/
    ├── visual/
    │   ├── markdown/                 # pure, no DOM — contracts/fidelity.md
    │   │   ├── schema.ts             # node/mark types, toDOM/parseDOM (allow-list)
    │   │   ├── lezer.ts              # parser config: GFM + project extensions (front matter, [[_TOC_]], :::, footnotes, grid tables, definition lists)
    │   │   ├── parse.ts              # Lezer tree → PM doc with src/srcId, placeholders
    │   │   ├── serialize.ts          # preserving serializer (R4), containers, line merge
    │   │   ├── fresh.ts              # fresh Markdown for new/changed nodes, escaping (S7)
    │   │   ├── style.ts              # detectStyle (R6)
    │   │   ├── urls.ts               # isAllowedUrl, resolveImageSrc, resolvePageHref
    │   │   ├── *.test.ts             # fidelity, serialize, style, modeSwitch, urls, parse
    │   │   └── corpus/               # commonmark/ (CC-BY-SA, attributed), gfm/, azure-devops/, guard/
    │   ├── VisualEditor.tsx          # React wrapper: EditorView lifecycle, onChange debounce, guard, cursor mapping
    │   ├── plugins.ts                # keymap, input rules, history, tables, gap/drop cursor, paste rules
    │   ├── commands.ts               # toolbar/menu commands + active-state queries
    │   ├── Toolbar.tsx               # ARIA toolbar, responsive "More formatting"
    │   ├── SlashMenu.tsx             # combobox/listbox "/" menu
    │   ├── LinkDialog.tsx            # page picker (tree filter) + web address
    │   ├── DiagramDialog.tsx         # CodeMirror source + live drawing via rendererClient
    │   ├── TableMenu.tsx
    │   ├── nodeViews.ts              # placeholder, image, diagram, upload chip views
    │   ├── imageInput.ts             # paste/drop → useImageUploads adapter
    │   └── visual.css                # editor, toolbar, node views (both themes)
    ├── pages/PageEdit.tsx            # mode toggle, preference, lazy VisualEditor, Review changes, no-change save
    ├── pages/ReviewChangesDialog.tsx # DiffView pristine → current
    └── editor/editorMode.ts          # copernica.editorMode preference (like shortcuts/preference.ts)
tests/
├── Copernica.IntegrationTests/Editing/SaveTests.cs   # + unchanged content → no commit, 200 with tip
└── e2e/
    ├── us9-visual-editor.spec.ts     # W1–W18
    ├── fixtures/word-paste.html
    ├── a11y.spec.ts                  # + visual editor states
    └── csp.spec.ts                   # + visual editor
SECURITY.md                           # + Visual editor paragraph
```

**Structure Decision**: all new code is frontend, under `src/web/src/visual/`. The pure
`markdown/` submodule holds every fidelity guarantee and is tested without a browser.
React and ProseMirror glue sits beside it. `PageEdit` only gains the mode switch. No new
projects and no server code.

## Delivery increments

1. **Fidelity core** (blocks everything; story US2):
   - schema, Lezer config and extensions, parse, serialize, style, URLs;
   - corpus and `fidelity.test.ts` green (SC-001, SC-002).
2. **US1 MVP**:
   - `VisualEditor` with toolbar, input rules, history, lists, tables, "/" menu;
   - mode toggle with preference; load-time guard; no-change save; Review changes.
3. **US3**: mode switching with cursor mapping and FR-019 fallback; e2e W9, W10.
4. **US4**: image adapter, diagram node view and dialog, link dialog with page picker;
   e2e W11–W13.
5. **US5**: paste rules and Word cleanup; e2e W14.
6. **Polish**:
   - a11y scan, keyboard flow, CSP and security scenarios (W15–W18);
   - 100 KB performance check;
   - `SECURITY.md`, README editor section, third-party notices regenerated.

## Complexity Tracking

| Added complexity | Why needed | Simpler alternative rejected because |
|------------------|------------|--------------------------------------|
| A custom preserving serializer with source offsets, recursive container handling and line-level merge | FR-007/FR-008 demand byte-exact output for unchanged content. No library provides it (R1) | A standard Markdown serializer rewrites the whole file. Whole-document diff and patch cannot map normalized text back reliably (R4). Tracking edit ranges fails FR-009 |
| Project Lezer extensions for Markdig-only constructs (front matter, `[[_TOC_]]`, `:::`, footnotes, grid tables, definition lists) | Without them those constructs parse as paragraphs and could be mangled when nearby text is edited | Leaving them to the generic fallback works for HTML but not for constructs that look like ordinary text to a CommonMark parser |
| A load-time round-trip guard | A runtime safety net so an unforeseen page shape can never be silently rewritten | Relying on the corpus alone leaves real pages unprotected |
