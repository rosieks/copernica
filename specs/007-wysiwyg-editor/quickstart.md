# Quickstart: Visual Page Editor

**Feature**: [spec.md](spec.md) | **Contracts**: [fidelity](contracts/fidelity.md), [ui](contracts/ui.md)

## Prerequisites

```powershell
npm --prefix src/web ci
npm --prefix src/web run build
dotnet build src/Copernica
npm --prefix tests/e2e ci
```

## Automated checks

```powershell
npm --prefix src/web test                      # fidelity corpus, style, serializer, mode switch, URLs
npm --prefix src/web run lint
dotnet test                                    # incl. new no-change save integration test
cd tests/e2e; npx playwright test us9-visual-editor.spec.ts a11y.spec.ts csp.spec.ts
```

Expected: everything passes. The fidelity test prints `round trip: N/N files identical`
and `single-block edits: M/M local`, with 0 failures (SC-001, SC-002).

## Manual / e2e scenarios

Start the e2e server (`node tests/e2e/server.mjs`) and sign in as `alice` / `secret`. The
`handbook` space is seeded with the fidelity sample pages from
`src/web/src/visual/markdown/corpus/azure-devops/`.

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| W1 | Default mode | Clear site data, edit any page | Opens in visual mode, formatted (US1-1) |
| W2 | Basic formatting | Select a word → Ctrl+B. Type `## ` on a new line. Type `- ` + text | Bold, heading and list appear. Save creates 1 commit by alice (US1-2, 3, 7) |
| W3 | "/" menu | Empty line → `/tab` → Enter | 3×3 table inserted. Tab moves between cells (US1-4, 5) |
| W4 | No-op save | Open a sample page in visual mode, Save | "No changes to save". No new commit (US2-1, FR-012) |
| W5 | Locality | In `azure-devops/hand-wrapped-crlf.md`, change one word in the 2nd paragraph, Review changes, Save | The diff shows one changed line. `git diff HEAD~1` shows the same single line with CRLF intact (US2-2, 6) |
| W6 | List item | In a `*`-bullet list, edit item 3 and add a new item after it | Only item 3's lines change. The new item uses `*` (US2-3, 4) |
| W7 | Placeholders | Open `azure-devops/toc-html-frontmatter.md` | Front matter, `[[_TOC_]]` and HTML show as labelled placeholders. Edit nearby text and save: placeholders are byte-identical (US2-5) |
| W8 | Undo to original | Edit a paragraph, then undo everything, Save | "No changes to save" (US2-7) |
| W9 | Mode switch | Edit in visual, switch to Markdown, edit, switch back, edit, save | All 3 edits present. Markdown-mode text kept as typed. Reopening the editor uses the last mode (US3) |
| W10 | Guard fallback | Open `corpus/guard/unsafe-sample.md` (a shape the guard rejects, kept as a test fixture) | Opens in Markdown mode with the explanation. Preference unchanged (FR-019) |
| W11 | Image | Paste a screenshot in visual mode, enter a description, save | Image shown in place. One commit with page and image (US4-1) |
| W12 | Diagram | `/diagram` → edit the source in the dialog → Apply → save | The drawing shows in the editor and on the page. An existing `::: mermaid` block that was not edited is unchanged (US4-2) |
| W13 | Page link | Ctrl+K → "Find a page" → type part of a title → Enter | A relative `.md` link is inserted. On the saved page the link opens that page (US4-3) |
| W14 | Paste from Word | Paste the fixture `tests/e2e/fixtures/word-paste.html` via the clipboard | Headings, list, link and table kept. No `style` or HTML in the saved Markdown. The external image is reported (US5) |
| W15 | Keyboard only | Complete W2 + W11 + W13 without the mouse | Possible. Focus visible throughout (SC-006, FR-025) |
| W16 | Shortcuts | Type `e`, `c`, `?` in the editor | Text inserted. No wiki shortcut fires (FR-026) |
| W17 | Large page | Open the generated 100 KB page | Editable within 1 s. Typing has no visible lag (SC-005) |
| W18 | Security | Open `corpus/azure-devops/hostile.md` (`<script>`, `<img onerror>`, `javascript:` links, `<style>`) | Shown only as placeholders or non-clickable links. No script runs, 0 CSP violations, 0 external requests (FR-027) |
