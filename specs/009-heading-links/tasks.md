---

description: "Task list for 009 Links to Headings"
---

# Tasks: Links to Headings

**Input**: Design documents from `specs/009-heading-links/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included.
- The constitution's Quality Gates require automated tests for rendering and
  sanitization, and this feature changes the sanitizer (id prefix).
- SC-002, SC-003, SC-005 and SC-006 need automated checks.
- Server: xUnit in `tests/Copernica.Tests` and `tests/Copernica.IntegrationTests`.
- Browser logic: Vitest next to the code in `src/web/src`.
- End to end: Playwright in `tests/e2e/heading-links.spec.ts`.

**Organization**: Tasks are grouped by user story in spec priority order: US1, US2 (P1),
US3 (P2).
- The id prefix, the `sections` data and the fragment resolver are foundational, because
  every story depends on them.
- After Phase 2, native same-page jumps (`#x`) stop matching the prefixed ids until US2
  routes them. Phase 2 and US2 should therefore ship together; US1 alone is not a release.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to

Conventions: `web/` means `src/web/src/`. UI strings are English (Constitution I).

---

## Phase 1: Setup

**Purpose**: Shared test data and the seeded e2e pages.

- [X] T001 [P] Create the golden slug list `tests/fixtures/sections/slugs.json`:
  - format: an array of `{ "text": string, "id": string }`;
  - one entry per row of the research.md R1 table (`Setup`→`setup`, `Zażółć gęślą jaźń`→`zażółć-gęślą-jaźń`, `Setup & config (v2.0)!`→`setup--config-v20`, `C# / .NET: why?`→`c--net-why`, `🚀 Launch`→`-launch`, `!!!`→`section`, `main`→`main`), plus `Interface Version 1.0`→`interface-version-10` and `Design & Process`→`design--process`;
  - only non-duplicate cases: de-duplication is checked separately.
- [X] T002 [P] Seed the e2e pages in `tests/e2e/server.mjs` (`handbook` files map):
  - `guides/sections.md` as described in quickstart.md: `# Sections`; three `## Setup`; `## Zażółć gęślą jaźń`; `## Interface Version 1.0`; `## Design & Process`; `### main`; a tall image (an existing seeded image) and a Mermaid diagram above `## Late layout`; a footnote; a table of contents of `#…` links; `#### Detail`; enough body text that every section starts below the first viewport;
  - in `guides/setup.md`, add links to `sections.md#late-layout`, `sections.md#interface-version-1.0` and `sections.md#gone`.

  Keep existing page content and tests intact (append, do not rewrite).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Prefixed ids, server-side sections, the API fields and the browser resolver.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests

- [X] T003 [P] Extend `tests/Copernica.Tests/Rendering/SanitizationTests.cs`:
  - `Headings_get_ids_for_anchors` now expects `id="user-content-getting-started"`;
  - new cases:
    - raw HTML `<h2 id="main">` and `<div id="root">` become `user-content-main` / `user-content-root`;
    - an id already starting with `user-content-` is not doubled;
    - footnote ids are prefixed and `href="#fn…"` is unchanged;
    - `[x](#setup)` keeps `href="#setup"`.
- [X] T004 [P] Add `tests/Copernica.Tests/Rendering/SectionExtractorTests.cs`:
  - every entry of `tests/fixtures/sections/slugs.json` renders as `## {text}` with that id (SC-006 guard);
  - three `## Setup` give `setup`, `setup-1`, `setup-2`, then `## Setup-1` gives `setup-1-1`;
  - only levels 1–3 are listed, in document order; `####` is not listed but keeps its id in the HTML;
  - headings in a quote and in a list item are listed, a heading inside a fenced code block is not, and raw HTML `<h2>` is not;
  - `text` is the visible text (``## `code` and **bold** [link](x)`` → `code and bold link`), and section ids carry no prefix.

  Copy the fixture to the test output the same way `tests/fixtures/anchoring` is used, if the project already does that; otherwise read it relative to the repository root.
- [X] T005 [P] Add integration tests in `tests/Copernica.IntegrationTests/Spaces/` (follow the existing page-API test style there):
  - `GET /api/spaces/{id}/pages/{path}` returns `sections` (level, id, text) for the current version and for `?version={older commit}` (a version with a different heading set);
  - `sections` is empty for a too-large page;
  - `POST /api/render` returns `sections` for the posted Markdown;
  - no `sections` are returned without read access (existing 403/404 path unchanged).
- [X] T006 [P] Add `web/sections/resolveSection.test.ts`:
  - `gfmSlug` equals the `id` of every entry in `../../../../tests/fixtures/sections/slugs.json` (same import style as the anchoring fixtures);
  - with an article built in jsdom (prefixed ids), `resolveSection(article, hash)` returns:
    - the exact match for `#setup-1`;
    - the decoded match for `#za%C5%BC%C3%B3%C5%82%C4%87-g%C4%99%C5%9Bl%C4%85-ja%C5%BA%C5%84`;
    - the gfm fallback for the Azure DevOps forms `#interface-version-1.0` → `interface-version-10` and `#design-%26-process` → `design--process`;
    - the exact match wins over the fallback;
    - a raw malformed `%E0%A4%A` is used as typed;
    - `null` for `#gone` and for an empty hash;
    - no match on elements outside the article (a comment with `user-content-setup`).

### Implementation

- [X] T007 Prefix ids in `src/Copernica/Rendering/HtmlSanitizerFactory.cs`:
  - in the existing `PostProcessNode` handler, every element with a non-empty `id` that does not start with `user-content-` gets `id = "user-content-" + id`;
  - nothing else changes (allowed attributes, schemes);
  - add a doc comment citing research R2. Makes T003 pass.
- [X] T008 Add `src/Copernica/Rendering/SectionExtractor.cs`:
  - `public sealed record Section(int Level, string Id, string Text)` and `static IReadOnlyList<Section> Extract(MarkdownDocument document)`;
  - it walks `document.Descendants<HeadingBlock>()` with `Level is >= 1 and <= 3` and a non-empty `GetAttributes().Id`, in document order;
  - `Text` is the inline plain text: concatenate `LiteralInline`/`CodeInline` content and the text of the children of `LinkInline` and `EmphasisInline`, collapse whitespace, trim;
  - code blocks are naturally excluded (no `HeadingBlock`), and raw HTML headings are `HtmlBlock`s.
- [X] T009 Change `src/Copernica/Rendering/MarkdownRenderer.cs` to add `RenderedMarkdown RenderWithSections(string markdown, ILinkRewriter? links = null, bool diagrams = false)`:
  - `record RenderedMarkdown(string Html, IReadOnlyList<Section> Sections)`;
  - it parses once, extracts sections (after parsing, before rendering) and renders and sanitizes as `Render` does;
  - keep `Render` as a wrapper returning `.Html`, so comment rendering and other callers are unchanged. Makes T004 pass.
- [X] T010 Wire sections into `src/Copernica/Spaces/PageService.cs`:
  - add `IReadOnlyList<Section> Sections` to `PageDto`;
  - the cached `Render` stores `RenderedMarkdown`, under the same cache key;
  - when `tooLarge`, return an empty list;
  - `RenderPreview` returns `RenderedMarkdown`;
  - in `src/Copernica/Api/PageWriteEndpoints.cs` `RenderAsync`, return `new { html, sections }`.

  Ensure JSON names are `sections`, `level`, `id` and `text` (camelCase, as the existing records). Makes T005 pass.
- [X] T011 Update `specs/001-git-backed-team-wiki/contracts/openapi.yaml`:
  - add the `Section` schema (`level` integer 1–3, `id`, `text`, all required);
  - add `sections` (required array of `Section`) to `Page` and to the `/render` 200 response;
  - regenerate `src/web/src/api/schema.d.ts` with `npm --prefix src/web run gen:api`, and fix TypeScript errors in test doubles that build `Page` objects (add `sections: []`).
- [X] T012 [P] Add `web/sections/resolveSection.ts`:
  - `export const CONTENT_ID_PREFIX = 'user-content-'`;
  - `gfmSlug(text)`, a port of Markdig `UrilizeAsGfm` per research R1: for each UTF-16 code unit, keep `\p{L}`/`\p{Nd}`-class letters and digits (use `/[\p{L}\p{N}]/u` on the code unit, so surrogate halves are dropped, as in Markdig), `-` and `_`, lowercased with `toLowerCase()`; a space becomes `-`; all else is dropped; empty → `section`;
  - `decodeFragment(hash)`: strip the leading `#`, `decodeURIComponent`, and on error return the raw value;
  - `resolveSection(article: Element, hash: string): HTMLElement | null`: exact `user-content-{f}`, then `user-content-{gfmSlug(f)}`, using `article.querySelector('[id="…"]')` with `CSS.escape`;
  - `sectionHash(id) = '#' + encodeURIComponent(id)`. Makes T006 pass.
- [X] T013 [P] Add one sentence under "Safe content" (or the rendering section) in `SECURITY.md`: element ids from user content are prefixed with `user-content-`, so pages cannot take over application element ids or clobber DOM globals.

**Checkpoint**: The server returns prefixed HTML plus `sections`, and the browser can map any fragment to a heading. `dotnet test` and `npm test` pass.

---

## Phase 3: User Story 1 - Share a link to a section (Priority: P1) 🎯 MVP

**Goal**: Every H1–H3 in the page view has a keyboard-accessible "copy link to this
section" button that copies `canonical URL + #id`.

**Independent Test**: Open `guides/sections.md`, copy the link of the second `## Setup`, open it in a new tab: the URL ends in `#setup-1` (landing on the heading needs US2).

### Tests for User Story 1

- [X] T014 [P] [US1] Add `web/sections/useSections.test.tsx` (decoration part):
  - render a component that uses the hook on an article with prefixed `h1`, `h2`, `h3` and `h4` ids;
  - assert:
    - exactly one `span.section-link[data-anchor-skip] > button` right after each H1–H3 and none after `h4`;
    - `aria-label` "Copy link to section: {heading text}";
    - the heading's `textContent` and accessible name are unchanged;
    - the article's `textContent` with `[data-anchor-skip]` removed is unchanged (discussion offsets);
    - re-running with the same HTML does not duplicate buttons;
    - no decoration when `tooLarge`.
  - Activating the button calls `copyText` with `{canonicalUrl}#setup-1`, then `notify` "Link copied"; on `false` it opens the copy dialog with the section link (stub `navigator.clipboard` as `PageActions.test.tsx` does).
- [X] T015 [P] [US1] Add `tests/e2e/heading-links.spec.ts`, US1 part, quickstart scenario 1 steps 1, 2, 4 and 6:
  - hover and Tab reveal the button; H4 has none;
  - Enter copies (read with `page.evaluate(() => navigator.clipboard.readText())`, granting clipboard permissions in chromium; in firefox and webkit assert the toast and the address bar instead);
  - the address bar ends with the encoded Polish fragment and the scroll position is unchanged;
  - the second Setup gives `#setup-1`;
  - `getByRole('heading', { name: 'Setup' })` still matches exactly.

### Implementation for User Story 1

- [X] T016 [US1] Add `web/sections/useSections.ts`, the decoration part: `useSections({ article, html, tooLarge, spaceId, path, commitId, isCurrent })`.
  - After `html` is committed (layout effect keyed on `html`), for each `h1, h2, h3` with an id starting with `CONTENT_ID_PREFIX`:
    - add the class `section-heading`;
    - wrap the heading and a new `<span class="section-link" data-anchor-skip>` in a `<div class="section-heading-row">`;
    - put a `<button type="button" class="section-link__button" aria-label="Copy link to section: {text}">` containing the `Link2Icon` SVG (render with `react-dom` `createRoot` per button, or build the static SVG markup from the icon's path data with `document.createElementNS`; no `innerHTML` of user data).
  - The heading text is the heading's `textContent`, trimmed.
  - Clean up on change or unmount (unwrap and remove).
  - The click handler:
    - computes `canonicalUrl(spaceId, path, commitId, isCurrent) + sectionHash(id without prefix)`;
    - calls `navigate({ hash }, { replace: true, state: { sectionCopy: true } })`;
    - calls `copyText`, then shows the toast "Link copied" or opens the copy dialog.
  - The hook returns `{ dialogUrl, closeDialog }` for the fallback dialog.
- [X] T017 [P] [US1] Make `canonicalUrl` and `copyText` in `web/pages/PageActions.tsx` exportable for reuse (move them to `web/pages/pageLinks.ts` if exporting from a component file trips the React fast-refresh lint), and give `web/pages/CopyLinkDialog.tsx` an optional `label` prop, defaulting to "Link to this page", so it can show "Link to this section".
- [X] T018 [P] [US1] Add `web/sections/sections.css` and import it in `web/main.tsx` next to `prose.css`:
  - `.section-heading-row`: `display: grid`, `grid-template-columns: minmax(0, auto) auto`, `align-items: baseline`, `column-gap: var(--space-2)`. Keep the heading's own margins: move the margin to the row if needed so vertical rhythm matches `prose.css`.
  - `.section-link__button`: the existing icon-button look (reuse the tokens of `ui/` icon buttons), `user-select: none`, `opacity: 0`;
  - visible (`opacity: 1`) on `.section-heading-row:hover`, on `:focus-visible`, and under `@media (hover: none)`;
  - `@media print { .section-link { display: none } }`;
  - forced-colors: `ButtonText` and `Highlight`;
  - highlight classes for US2: `.section-target` fades its background over `2s` from an accent token; under `prefers-reduced-motion: reduce` there is no animation and a static `outline` instead.
- [X] T019 [US1] Use the hook in `web/pages/PageView.tsx`:
  - pass the article ref, `loaded.html`, `loaded.tooLarge`, `spaceId`, `path`, `loaded.version.commitId` and `isCurrent`;
  - render `CopyLinkDialog` with `label="Link to this section"` when the hook reports a fallback URL;
  - make sure the decoration does not run on the editor preview (`PageEdit.tsx`) or comments.

**Checkpoint**: Copy buttons work on current and earlier versions; T014 and T015 pass.

---

## Phase 4: User Story 2 - Section links inside the wiki work (Priority: P1)

**Goal**: Any section link, whether first load, in-wiki, another page, Back/Forward,
earlier version, comment, footnote or Azure DevOps form, lands on the heading below the
sticky header, with focus and a highlight. A missing section tells the reader.

**Independent Test**: quickstart scenario 2 (TOC clicks plus Back, links from `guides/setup.md`, `#gone`).

### Tests for User Story 2

- [X] T020 [P] [US2] Extend `web/sections/useSections.test.tsx` (navigation part), using a `MemoryRouter` with an initial hash:
  - `scrollIntoView` (stubbed) is called with `{ block: 'start' }` on the resolved heading;
  - focus moves to it with `tabindex="-1"`;
  - `section-target` is added, then removed after 2 s (fake timers);
  - `state.sectionCopy` suppresses all of this;
  - a missing section calls `notify({ tone: 'info', title: 'Section not found' })` once per location key;
  - a `ResizeObserver` callback re-scrolls until a `keydown` or `wheel` or 3 s pass (stub `ResizeObserver`).
- [X] T021 [P] [US2] Extend `tests/e2e/heading-links.spec.ts` with quickstart scenario 2, steps 1–6:
  - TOC clicks plus Back/Forward restore sections (compare `scrollY` and heading position);
  - a direct load of `#late-layout`: after images and diagrams load, the heading's top is ≥ the header height and within the top quarter of the viewport (SC-004);
  - the Azure DevOps-form link lands on `Interface Version 1.0` (SC-003);
  - `#gone` shows the toast and keeps `scrollY` 0;
  - an earlier version with `#setup-2`;
  - `#main` lands on `### main` while the skip link still focuses `main#main`;
  - footnote round trip;
  - a comment containing `[see](#setup)` scrolls the article.

  Also add a reduced-motion case in `tests/e2e/reduced-motion.spec.ts`: `section-target` has no running animation.

### Implementation for User Story 2

- [X] T022 [US2] Add hash handling to `web/sections/useSections.ts`, per contracts/ui.md "Opening a section":
  - effect on `[html, location.key, location.hash]`, skipped when `tooLarge`, there is no hash, or `location.state?.sectionCopy`;
  - `resolveSection(article, location.hash)`; when found:
    - `scrollIntoView({ block: 'start' })`;
    - set `tabindex="-1"` if the element is not focusable, then `focus({ preventScroll: true })`;
    - add `section-target` and remove it after 2000 ms;
    - start a `ResizeObserver` on the article that re-calls `scrollIntoView` until the first `wheel`/`touchstart`/`keydown`/`pointerdown` on `window`, or 3000 ms;
  - when not found: an info toast "Section not found", description `The page has no section "{decoded}"; it may have been renamed.`, deduplicated by `location.key`;
  - clean up observers, timers and listeners on change.
- [X] T023 [US2] Route same-page links in `web/pages/PageView.tsx` `onClick`:
  - before the `/s/` check, an unmodified left-click on an `<a>` whose `href` starts with `#` calls `event.preventDefault()` and `navigate({ hash: href })` (push), so FR-013 history works and the hook resolves it;
  - extract this click logic into a small helper `web/sections/sectionLinkClick.ts` (`handleContentLinkClick(event, navigate, options)`) so T025 and T026 reuse it.
- [X] T024 [US2] Update `web/layout/RouteAnnouncer.tsx`: when `location.hash` is non-empty, keep the title announcement but skip focusing `main h1` (the section hook owns focus). Add or adjust its unit test if one exists.
- [X] T025 [P] [US2] In `web/discussions/DiscussionPanel.tsx`, attach the click helper from T023 to the comment body container:
  - `#…` links navigate by hash (resolved in the page article only);
  - `/s/…` links route with `navigate` instead of a full reload.
- [X] T026 [P] [US2] In `web/pages/PageEdit.tsx` `PreviewPane`, handle `#…` clicks in the preview by scrolling to the resolved element inside the preview pane (`resolveSection(previewElement, href)`, then `scrollIntoView`), without changing the editor URL.

**Checkpoint**: With Phase 2 + US1 + US2, the feature is releasable; T020 and T021 pass.

---

## Phase 5: User Story 3 - Link to a section while editing (Priority: P2)

**Goal**: The visual editor's link dialog can target a section of another page or of the
page being edited.

**Independent Test**: quickstart scenario 3: insert a link to "Interface Version 1.0", save, follow it.

### Tests for User Story 3

- [X] T027 [P] [US3] Extend `web/visual/LinkDialog.test.tsx`:
  - the page list includes "This page";
  - after choosing a page, a "Section (optional)" listbox shows "Whole page" and then the sections from a mocked page response, with indentation classes per level and "Heading level N" in the accessible description;
  - typing filters the list;
  - confirming with a section inserts `../guides/sections.md#interface-version-10` (relative, fragment encoded with `encodeURIComponent`) and defaults the link text to the section text;
  - "Whole page" inserts the plain page link (unchanged behaviour);
  - "This page" uses sections from a mocked `POST /api/render` and inserts `#id`;
  - loading and error states show "Loading sections…" and "Sections are not available", and the page can still be linked.
- [X] T028 [P] [US3] Extend `tests/e2e/us9-visual-editor.spec.ts`, or add a case in `heading-links.spec.ts` if the visual-editor spec is organized by scenario IDs only:
  - quickstart scenario 3 steps 1–3: Mod-K, choose Sections, choose the section, save;
  - the remote file (`remoteFile`) contains `sections.md#interface-version-10`;
  - clicking the link in the page view lands on the heading.

### Implementation for User Story 3

- [X] T029 [US3] Extend `web/visual/LinkDialog.tsx` per contracts/ui.md "Editor section picker":
  - add a "This page" entry (`pagePath`) at the top of the page list;
  - after a page is chosen, show a second combobox and listbox, "Section (optional)", with the same pattern and keyboard handling as the page list;
  - for another page, load sections with the shared page query (`['page', spaceId, path, 'head']`, same fetcher as `PageView`, so the cache is shared);
  - for "This page", load them with `POST /api/render` of the current editor Markdown, passed in as a new `getMarkdown()` prop from `VisualEditor.tsx`;
  - build the href with `relativeLink(pagePath, page.path) + sectionHash(id)`, or `sectionHash(id)` for this page;
  - default the link text to the section text.
- [X] T030 [US3] Pass `getMarkdown` (the current serialized Markdown) from `web/visual/VisualEditor.tsx` to `LinkDialog`, and check that `isAllowedUrl` in `web/visual/markdown/urls.ts` accepts `relative.md#encoded-fragment` and `#encoded-fragment`. Add a case to `urls.test.ts` if it is missing.

**Checkpoint**: All three stories work; T027 and T028 pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T031 [P] Add the copy button and a highlighted target to the a11y scan in `tests/e2e/a11y.spec.ts` (the sections page in light and dark themes, no violations; SC-005), and check that `tests/e2e/csp.spec.ts` reports no violations on the sections page.
- [X] T032 [P] Update `README.md`'s feature list (links to headings: copy, navigation, Azure DevOps links, editor picker) and `docs/roadmap.md` (mark 009 implemented, with a short note as for 008).
- [X] T033 [P] Update `specs/001-git-backed-team-wiki/contracts/` prose that describes rendered HTML or heading ids, if any (grep for `id=` or "anchor"), so it mentions the `user-content-` prefix.
- [ ] T034 Run the full checks:
  - `dotnet test`;
  - `npm --prefix src/web run lint`, `npm --prefix src/web test`, `npm --prefix src/web run build`;
  - Playwright `heading-links`, `a11y`, `csp`, `reduced-motion`, `us9-visual-editor`, `us4-discussions` and `us1-reading` in chromium, firefox and webkit.

  Fix regressions, notably discussion anchoring and highlights after the DOM wrapping.
- [ ] T035 Walk through quickstart.md scenarios 1–4 by hand, including a screen reader spot check and print preview. Record the results (and anything not met) in the Notes of `specs/009-heading-links/checklists/requirements.md`.

---

## Dependencies & Execution Order

- **Setup (T001–T002)**: no dependencies.
- **Foundational (T003–T013)**: depends on T001. Tests T003–T006 come before T007–T012.
  - T009 depends on T008;
  - T010 depends on T009;
  - T011 depends on T010;
  - T012 is independent of the server tasks.
- **US1 (T014–T019)**: depends on Phase 2.
- **US2 (T020–T026)**: depends on Phase 2.
  - T022 extends the hook from T016, so do US1 first, or create the hook file in whichever story starts first;
  - T025 and T026 depend on T023.
- **US3 (T027–T030)**: depends on Phase 2 (T010, T011, T012) only, so it can run in parallel with US1 and US2.
- **Polish (T031–T035)**: after the stories it covers.

### Parallel Opportunities

- T001 ∥ T002.
- T003 ∥ T004 ∥ T005 ∥ T006; then T012 ∥ T013 alongside the server chain T007 → T008 → T009 → T010 → T011.
- US1: T014 ∥ T015 ∥ T017 ∥ T018, then T016 → T019.
- US2: T020 ∥ T021; T025 ∥ T026 after T023.
- US3 as a whole ∥ US1/US2 (different files: `visual/`).
- T031 ∥ T032 ∥ T033.

### Parallel Example: User Story 1

```text
Task: "T014 [US1] decoration tests in web/sections/useSections.test.tsx"
Task: "T015 [US1] e2e copy scenarios in tests/e2e/heading-links.spec.ts"
Task: "T017 [US1] export canonicalUrl/copyText, CopyLinkDialog label"
Task: "T018 [US1] web/sections/sections.css"
```

## Implementation Strategy

### MVP

Phase 1 → Phase 2 → US1 → US2, released together. The id prefix (Phase 2) needs US2's
hash handling to keep same-page links and footnotes working, and copied links (US1) are
only useful once they land on the section (US2). Validate with quickstart scenarios 1–2.

### Incremental Delivery

1. Phase 2 can be merged on its own only together with T023 (same-page routing), so
   footnotes keep working.
2. US1 + US2 make the user-visible release.
3. US3 follows as a separate increment if needed; it is independent of the page view.

## Implementation Notes

Differences from the task descriptions:
- **T002**: the cross-page links are on a new page, `guides/section-links.md`, so that
  `guides/setup.md`, which other suites use, stays unchanged. A second commit adds
  `## Appendix` to `guides/sections.md`, so the earlier version differs in its headings.
  The `visual` space also gets `guides/sections.md` for W19.
- **T005**: access rules are covered by the existing page and render API tests. `sections`
  comes with the same response, so no separate no-access test was added.
- **T014–T016, T022**: the browser code is split into `SectionLinks.tsx` (buttons, rendered
  through portals), `useSectionNavigation.ts` (hash handling) and `contentLinks.ts`
  (click routing), with tests in `sections.test.tsx`.
  - The button is the heading's last child, and the heading gets an `aria-label` with its
    own text (research R3, "changed during implementation").
  - The plan's wrapper after the heading broke margin collapsing and the H2 rule.
- **T017**: `canonicalUrl` and `copyText` were already exported from `PageActions.tsx`, so
  only the `label` prop was added to `CopyLinkDialog`.
- **Added**: "Skip to content" now focuses `<main>` itself (`layout/SkipLink.tsx`). As a
  native `#main` jump, the router would have treated it as a section link (e2e N7).
- **T021**: the comment scenario (quickstart 2.6) is covered by `contentLinks.ts`, shared
  with the page article and tested there. There is no separate e2e case.
- **T028**: W19 is in `us9-visual-editor.spec.ts`. W13 now presses Enter twice, because
  choosing a page leads to the section step, with "Whole page" selected.
- **T033**: the 001 contract prose does not describe heading ids. Only `openapi.yaml`
  changed (T011).
