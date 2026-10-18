---

description: "Task list for 004 Diagrams in Markdown Pages (Mermaid)"
---

# Tasks: Diagrams in Markdown Pages (Mermaid)

**Input**: Design documents from `specs/004-mermaid-diagrams/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/rendering.md](contracts/rendering.md),
[contracts/renderer.md](contracts/renderer.md), [contracts/ui.md](contracts/ui.md),
[quickstart.md](quickstart.md)

**Tests**: Included. The constitution's Quality Gates require rendering and sanitization
tests. SC-004 needs a security test suite and SC-005 the WCAG scan. Scenario IDs D1–D14
refer to [quickstart.md](quickstart.md).

**Constitution**: v1.3.0 (amended 2026-10-18) permits exactly the design in research R1: an
isolated sandboxed renderer and image-only display. Do not deviate from it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US3 from spec.md

Conventions:
- server code goes in `src/Copernica`, frontend in `src/web`;
- English UI strings;
- Python edits use `encoding='utf-8'`, and `\n` in replacement strings must be written with
  the Edit tool (shell escaping corrupts them);
- build with `--artifacts-path` if `src/Copernica/bin` is locked by a running instance.

---

## Phase 1: Setup

- [X] T001 Add `"mermaid": "11.17.2"` (exact) to the dependencies in `src/web/package.json` and run `npm --prefix src/web install`. Do **not** use 12.x: it depends on `elkjs` (EPL-2.0) (research R7).
- [X] T002 [P] In `scripts/check-licenses.ps1`, add known-licence entries to the npm check:
  - `dompurify` → `Apache-2.0 (dual MPL-2.0 OR Apache-2.0; used under Apache-2.0)`;
  - `khroma` → `MIT (LICENSE file)`.

  Make the npm branch consult them like `$knownLicenses` does for NuGet. Then run the script: expect "All licenses are allowed" and no `elkjs` in the list.
- [X] T003 [P] Add the second Vite entry:
  - create `src/web/diagram-renderer.html` (`<!doctype html>`, `<meta charset>`, no visible content, `<script type="module" src="/src/diagrams/renderer-main.ts"></script>`);
  - in `src/web/vite.config.ts`, set `build.rollupOptions.input` to `{ main: 'index.html', diagramRenderer: 'diagram-renderer.html' }`;
  - verify that `npm --prefix src/web run build` emits `dist/diagram-renderer.html`, and that the main entry chunk does not contain "mermaid" (`grep -L mermaid dist/assets/index-*.js`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the spike on the renderer page CSP, the server-side diagram markup, and the
renderer protocol. All stories depend on these.

- [X] T004 Spike (research R4). Write a temporary Playwright test `tests/e2e/spike-renderer.spec.ts` that:
  - loads a page with `<iframe sandbox="allow-scripts" src="/diagram-renderer.html">`;
  - checks that a `postMessage` round-trip works in **chromium, firefox and webkit** under the CSP of contracts/renderer.md (`script-src 'self'`).

  If a browser blocks the script: switch the renderer page to a per-response script nonce (same mechanism as `SpaHosting` for the shell, 002 R3) and record it in `research.md` R4. Delete the spike test afterwards.
- [X] T005 [P] Add `tests/Copernica.Tests/Rendering/DiagramTests.cs`, per contracts/rendering.md:
  - **Recognition**:
    - ` ```mermaid ` and ` ```Mermaid ` fences produce the figure;
    - `::: mermaid` … `:::` produces the same figure;
    - other code blocks are unchanged.
  - **Type mapping**: every row of the mapping table, plus "Mermaid" for unknown types.
  - **Name**:
    - `accTitle:` wins over `title`;
    - `title` of gantt and pie;
    - fallback "Flowchart diagram";
    - ≤ 200 characters.
  - **Description**: `accDescr:` single line and `accDescr { … }` multi-line, ≤ 1000 characters.
  - **Too large**: a source over 20 000 characters gets `data-diagram-too-large="true"`.
  - **Links**:
    - `click A "../x.md" "Setup"` → `<li><a href="/s/<space>/…/x.md">Setup</a>`;
    - `click A href "https://example.com"` is kept;
    - `click B "javascript:alert(1)"` is dropped;
    - `click C call fn()` is ignored.
  - **Escaping**: the source with `<script>` is HTML-escaped inside `<code>`.
  - **Sanitizer**: the output after the sanitizer keeps `figure`, the classes and the `data-diagram*` attributes, and strips an injected `onclick`.
  - **Plain text**: `PlainTextExtractor.Extract` of the HTML equals the concatenated `textContent` (source + link labels).
- [X] T006 Create `src/Copernica/Rendering/DiagramBlock.cs`, a pure parser: `static DiagramBlock Parse(string source)` with `Type`, `Name`, `Description`, `TooLarge` (`source.Length > 20000`) and `IReadOnlyList<(string Url, string Label)> Clicks`, following the regexes and rules of contracts/rendering.md.
- [X] T007 Create `src/Copernica/Rendering/DiagramHtmlRenderer.cs`:
  - a Markdig `HtmlObjectRenderer<FencedCodeBlock>` that handles blocks whose `Info` is `mermaid` (case-insensitive, first word) and delegates others to the default `CodeBlockRenderer`;
  - a renderer for `CustomContainer` with `Info == "mermaid"`, which uses the container's raw inner text as the source;
  - both write the exact `<figure>` markup of contracts/rendering.md;
  - click URLs are resolved through the current `ILinkRewriter`: pass it via a renderer property set in `MarkdownRenderer.Render`, and call `WikiLinkRewriter.Resolve` to drop rejected targets.

  Register both in `src/Copernica/Rendering/MarkdownRenderer.cs`:
  - add the block part of custom containers to the pipeline (done as `BlockContainersExtension`: `UseCustomContainers()` would also enable inline `::text::`, which turned `std::vector::size` into spans);
  - replace the `CodeBlockRenderer` registration with the delegating one.
- [X] T008 Update `src/Copernica/Rendering/HtmlSanitizerFactory.cs`:
  - add `figure` to `AllowedTags`;
  - add `data-diagram`, `data-diagram-type`, `data-diagram-name`, `data-diagram-description` and `data-diagram-too-large` to `AllowedAttributes`;
  - keep `class` as is.

  Run T005 until it passes. Check `PlainTextExtractor` needs no change; adjust it only if the plain-text test fails.
- [X] T009 Serve the renderer page with its own CSP in `src/Copernica/Web/SpaHosting.cs`. In the static file `OnPrepareResponse`, when the path is `/diagram-renderer.html`, set:
  - `Content-Security-Policy` to `SecurityHeadersMiddleware.RendererPolicy` (a new constant with the exact value from contracts/renderer.md, or the nonce variant if T004 required it);
  - `Cache-Control: no-cache`.

  The middleware keeps an existing CSP header, so the SPA policy is unaffected.

  Add `tests/Copernica.IntegrationTests/Web/RendererPageTests.cs`, using a `SpaAssets` override as in `ShellNonceTests` with a fake `diagram-renderer.html`. It checks:
  - the renderer page's CSP and `nosniff`;
  - `/` still carries the SPA policy with the style nonce;
  - `/api/spaces` is unchanged.
- [X] T010 [P] Create `src/web/src/diagrams/protocol.ts` with the message types of contracts/renderer.md (`RenderRequest`, `Rendered`, `RenderError`, `Ready`, `ThemeTokens`) and type guards. `isRendererMessage(event, frameWindow)` checks that `event.source === frameWindow` and validates the shape.
- [X] T011 Create `src/web/src/diagrams/renderer-main.ts` (frame side):
  - `import mermaid from 'mermaid'` and `mermaid.initialize` with the exact configuration of contracts/renderer.md (`securityLevel: 'strict'`, `htmlLabels: false`, `maxTextSize: 20000`, `maxEdges: 500`, the `secure` keys, `theme: 'base'`, system fonts);
  - on `message` from `window.parent` with `type === 'render'`:
    - refuse a `source` over 20 000 characters;
    - map `ThemeTokens` to `themeVariables` (`primaryColor`, `primaryTextColor`, `primaryBorderColor`, `lineColor`, `background`, `mainBkg`, `secondaryColor`, `tertiaryColor`, `textColor`, `noteBkgColor`, `noteTextColor`), set `darkMode` from `tokens.dark`, and re-initialize when the theme changes;
    - call `mermaid.render('d' + id, source)`;
    - post `{ type: 'rendered', id, svg }`, or `{ type: 'error', id, message }` with the message trimmed to 300 characters;
  - post `{ type: 'ready' }` on load.
- [X] T012 Create `src/web/src/diagrams/rendererClient.ts` (UI side):
  - a singleton that lazily creates the hidden `<iframe class="diagram-renderer" sandbox="allow-scripts" src="/diagram-renderer.html" aria-hidden="true" tabindex="-1" title="">` and waits for `ready`;
  - `render(source, theme): Promise<string>` with a FIFO queue (one in flight), a 10 s timeout per item (rejects with "Timed out"), and a cache `Map<string, string>` keyed by `theme.dark + '\u0000' + source`;
  - only messages passing `isRendererMessage` are accepted.
- [X] T013 [P] Create `src/web/src/diagrams/theme.ts`: `currentThemeTokens()` reads the computed values of `--color-bg`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-accent-solid`, `--color-accent-subtle` and `--color-bg-subtle` from `document.documentElement`, plus `dark = classList.contains('dark')`.
- [X] T014 [P] Add `src/web/src/diagrams/diagrams.test.ts` (Vitest, jsdom):
  - `isRendererMessage` ignores wrong `source` windows and malformed data;
  - the client queue processes in order, caches by `(theme, source)`, and times out after 10 s (fake timers);
  - `svgImageSrc(svg)` produces `data:image/svg+xml;charset=utf-8,` + an encoded string;
  - alt text is "name" or "name. description".

**Checkpoint**: the server emits safe figure markup and the renderer protocol works. Nothing
is drawn on pages yet.

---

## Phase 3: User Story 1 - Diagrams written as text are shown as diagrams (Priority: P1) 🎯 MVP

**Goal**: diagrams are drawn on pages and page versions, with error and too-large states, and
the page text never waits for them.

**Independent Test**: D1–D6 and D11–D13.

- [X] T015 [US1] Extend `tests/e2e/server.mjs` with the `handbook` pages of the quickstart setup:
  - `visuals/all-types.md`;
  - `visuals/ado.md`;
  - `visuals/broken.md`;
  - `visuals/huge.md` (generated: a flowchart with 25 000+ characters);
  - `visuals/wide.md` (40 nodes in one row);
  - `visuals/evil.md`, with the six hostile blocks listed in quickstart.md.
- [X] T016 [P] [US1] Add `tests/e2e/us8-diagrams.spec.ts` with:
  - D1 (8 `figure.diagram img` loaded with `naturalWidth > 0`; page text visible before the first image);
  - D2 (alt and links list);
  - D3–D6;
  - D11: collect `page.on('request')` hosts and `page.on('dialog')`, and assert `window.__xss` is unset. Iframes count too: use `context.on('request')`;
  - D12 (fetch headers of `/diagram-renderer.html` and `/`);
  - D13 (a discussion on a sentence after a diagram stays anchored after reload, reusing the `selectText` helper from `tests/e2e/us4-discussions.spec.ts`).
- [X] T017 [US1] Create `src/web/src/diagrams/useDiagrams.ts`. `useDiagrams(container: RefObject<HTMLElement|null>, key: unknown)`, re-run when `key` (the HTML) changes, does the following for each `figure[data-diagram="mermaid"]`:
  - **Too large or no renderer:** if `data-diagram-too-large` is set, render the too-large callout and keep the source visible.
  - **Otherwise:**
    - insert a figure toolbar and a loading placeholder (`div.diagram__loading`, "Drawing diagram…");
    - hide `pre.diagram__source` with the `hidden` attribute, so the text stays in the DOM (research R6);
    - request `render(source, currentThemeTokens())`;
    - on success, insert `<img class="diagram__image" alt="…" src="data:…">`;
    - on failure, show the error callout with the message and un-hide the source.

  Build the DOM nodes with `document.createElement` and `textContent` only, never `innerHTML`. Announce "Drawing diagrams…" once per call through a polite live region when at least one diagram is requested.
- [X] T018 [P] [US1] Create `src/web/src/diagrams/diagrams.css` per contracts/ui.md:
  - figure margin, `overflow-x: auto`, `max-width: 100%`;
  - `.diagram__image` with `max-width: none` and `display: block; margin: 0 auto`;
  - toolbar aligned right;
  - loading box 8 rem high on `--color-bg-subtle`;
  - callout styles reusing the 002 Callout classes (`ui-callout ui-callout--warning`) so tokens apply.

  Import it from `useDiagrams.ts`.
- [X] T019 [US1] Call `useDiagrams(article, loaded.html)` in `src/web/src/pages/PageView.tsx` for the current and version views. Make sure `useHighlights`/`HighlightMarkers` still measure correctly: re-measure after diagram images load, by dispatching a `resize` or calling the existing measure after `img.onload`.

**Checkpoint**: US1 complete; it is the MVP.

---

## Phase 4: User Story 2 - See the diagram while editing (Priority: P2)

**Goal**: the editor preview draws diagrams as the user types; errors appear per diagram.

**Independent Test**: D7.

- [X] T020 [US2] In `src/web/src/pages/PageEdit.tsx`, attach `useDiagrams` to both preview containers: the *Preview* tab and the *Split* view. Use refs to the `.preview-pane` elements, keyed by `preview.data?.html`. Unchanged diagrams come from the cache, so retyping elsewhere does not flicker.
- [X] T021 [US2] Add D7 to `tests/e2e/us8-diagrams.spec.ts`:
  - type a flowchart in the editor (`replaceEditorText`) and expect the preview image within 2 s after typing stops;
  - introduce a typo and expect the error callout only for that figure, with the rest of the preview intact;
  - fix it and expect the image back.

---

## Phase 5: User Story 3 - Diagrams that everyone can read (Priority: P3)

**Goal**: theme colours, scrolling inside the diagram box, accessible names, a source toggle.

**Independent Test**: D8–D10 and the WCAG scan.

- [X] T022 [US3] Add the toggle to the figure toolbar in `src/web/src/diagrams/useDiagrams.ts`:
  - a `<button type="button" class="ui-button ui-button--sm ui-button--ghost">` "Show diagram source" with `aria-expanded="false"`;
  - on activation it swaps the image and the `<pre>` (`hidden`), switches the label to "Show diagram" and sets `aria-expanded`;
  - focus stays on the button.
- [X] T023 [US3] Theme redraw in `src/web/src/diagrams/useDiagrams.ts`: observe `document.documentElement` with a `MutationObserver` on the `class` attribute. When `dark` toggles, re-render every drawn figure with the new `currentThemeTokens()`, replacing `img.src` once the new SVG arrives.
- [X] T024 [US3] Add to `tests/e2e/us8-diagrams.spec.ts`:
  - D8: `emulateMedia` light → dark; the image `src` changes; within 3 s the image's decoded SVG text contains a dark token colour;
  - D9: at 320 px on `wide.md`, `expectNoReflow` passes and the figure has `scrollWidth > clientWidth`;
  - D10: keyboard toggle, `aria-expanded` and focus.

  Add the page `visuals/all-types.md` to `SCREENS` in `tests/e2e/a11y.spec.ts`, in both themes at 1280 and 320 px.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] Update `SECURITY.md`:
  - a new "Diagrams" section: an isolated renderer page `/diagram-renderer.html` with its CSP (from contracts/renderer.md); a sandboxed frame without `allow-same-origin`; image-only display; no network access;
  - Mermaid 11.17.2 in the third-party list, with dompurify used under Apache-2.0.

  Regenerate `THIRD-PARTY-NOTICES.md` with `pwsh scripts/check-licenses.ps1`.
- [X] T026 [P] Add a "Diagrams" bullet to the "User interface" section of `README.md`: Mermaid code blocks and Azure DevOps `::: mermaid` blocks are drawn; "Show diagram source" is available.
- [X] T027 Bundle check:
  - main JS gzip grows by ≤ 5 KB versus `master`;
  - Mermaid appears only in chunks reachable from `diagram-renderer.html`;
  - `grep -r "org.eclipse.elk" src/web/dist` finds nothing.
- [X] T028 Regression (D14):
  - `dotnet test`, `npm --prefix src/web test`, and the full Chromium e2e suite (001–004);
  - Firefox and WebKit in separate runs, one browser per run, because they share the server state.

  Fix regressions.
- [X] T029 Run quickstart D1–D14 and record the results in the PR description. The PR must call out (constitution Quality Gates):
  - the new dependency (`mermaid` 11.17.2);
  - the new served page with its own CSP;
  - constitution v1.3.0.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → stories.**
  - T004 (spike) must finish before T009 and T011, because it may switch the renderer CSP to a nonce.
  - T005 → T006 → T007 → T008.
  - T010 → T011/T012.
- **US1** needs Phase 2. **US2** needs `useDiagrams` (T017). **US3** extends `useDiagrams` (T022, T023), so do it after T017.
- **Polish** comes last.

### Parallel opportunities

- T002 and T003.
- T005, T010, T013 and T014 (different files).
- T016 and T018.
- T025 and T026.

```bash
Task: "T005 DiagramTests.cs"   Task: "T010 diagrams/protocol.ts"   Task: "T013 diagrams/theme.ts"
```

## Implementation Strategy

1. **MVP**: Phases 1–2 and US1. Diagrams are drawn on pages, safely; validate D1–D6 and D11–D13.
2. **US2**: diagrams in the preview.
3. **US3**: theme, reflow, toggle and WCAG.
4. **Polish**: docs, bundle check, regression.
