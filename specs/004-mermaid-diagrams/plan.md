# Implementation Plan: Diagrams in Markdown Pages (Mermaid)

**Branch**: `004-mermaid-diagrams` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-mermaid-diagrams/spec.md`

## Summary

The server keeps rendering all Markdown. Mermaid blocks, both ` ```mermaid ` and Azure
DevOps `::: mermaid`, become a sanitized `<figure>` that holds the escaped source and
metadata decided on the server:
- type and accessible name;
- size limit;
- click-links passed through the same link rewriter as text links.

In the browser, a hidden, sandboxed renderer frame (opaque origin, no network, its own
CSP) runs Mermaid 11 and returns SVG text. The wiki shows it only as an inert
`<img src="data:image/svg+xml…">`, so user-derived markup never enters the wiki document.
The source stays in the DOM, hidden, so discussion anchoring is unaffected.

Diagrams follow the theme, scroll inside their own box on narrow screens, and offer
"Show diagram source".

A clarifying constitution amendment (v1.3.0) states this isolated-renderer boundary
explicitly, and is to be applied before implementation.

## Technical Context

**Language/Version**: C# 14 / .NET 10; TypeScript 5.9 (strict), React 19

**Primary Dependencies**:
- new, shipped: **`mermaid` 11.17.2** (MIT). It is loaded only in the renderer page.
- server: Markdig `UseCustomContainers` (already a dependency).

**Storage**: none (derived from page Markdown).

**Testing**:
- xUnit: rendering, sanitizer, plain text, renderer CSP;
- Vitest: protocol, queue, cache, timeout, states;
- Playwright: D1–D14, including a security suite with request logging, and the WCAG scan.

**Target Platform**: unchanged; browsers per the constitution

**Project Type**: web application (server + embedded SPA), one artifact

**Performance Goals**:
- the page text is shown within the 001 target, independent of diagrams;
- ≤ 10 typical diagrams are all drawn ≤ 3 s (SC-002);
- the preview updates ≤ 2 s after typing (SC-003);
- main bundle grows by about 1 KB; Mermaid is a separate, lazily loaded entry.

**Constraints**:
- strict CSP of the SPA unchanged;
- the renderer page has its own restrictive CSP;
- no outbound requests;
- one server-side renderer and sanitizer for all page HTML;
- a diagram source is drawn only up to 20 000 characters.

**Scale/Scope**: 3 user stories, 13 FRs; 1 server extension, 1 renderer entry, 1 hook +
figure component; 1 constitution amendment.

No open unknowns. One verification spike is planned (R4: `script-src 'self'` inside a
sandboxed opaque-origin frame, with a nonce fallback).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / rule | Status | Evidence |
|---|------------------|--------|----------|
| I | English artifacts | ✅ | All artifacts and UI strings in English |
| II | No new egress; assets bundled; single artifact | ✅ | Mermaid is bundled; the renderer CSP has `connect-src`, `font-src` and external `img-src` set to none; images are inert. The security e2e suite (D11) asserts 0 external requests |
| III | Safe content; nothing forbidden; transparency | ✅ | User markup never enters the wiki DOM (image-only display). Mermaid `securityLevel: 'strict'` with locked `secure` keys. Click links go through the server link rewriter; `call` actions are ignored. Renderer frame: opaque origin, no `allow-same-origin`. `SECURITY.md` updated |
| IV | Dependencies justified, permissive, pinned | ✅ with notes | `mermaid` 11.17.2 tree (106 packages): MIT, ISC, Apache-2.0, BSD-3-Clause, Unlicense. `dompurify` is used under the Apache-2.0 option of "MPL-2.0 OR Apache-2.0". `khroma` is MIT (LICENSE file, no `license` field). Both are recorded in `check-licenses.ps1`. **Mermaid 12 rejected**: it depends on `elkjs` (EPL-2.0) |
| V | Git source of truth; no stored data; YAGNI | ✅ | Nothing stored; Mermaid only; no export or zoom |
| Sec | Strict CSP; no inline scripts or `eval` | ✅ | SPA CSP unchanged. The renderer page has `script-src 'self'` (no `unsafe-eval`; no `new Function` in Mermaid 11 chunks) and `'unsafe-inline'` **styles only**, inside the isolated frame |
| Sec | "Markdown rendered and sanitized on the server, in one place; the frontend MUST NOT render raw user HTML from any other source" | ✅ **amended (v1.3.0, 2026-10-18)** | The server still renders and sanitizes; the wiki document never renders user markup. But the renderer frame draws user content client-side, which the current wording does not foresee. The amendment from research R9 was applied as **v1.3.0**: a bounded exception for diagram blocks (isolated sandboxed renderer, image-only display), which this design follows exactly |
| Stack | React + TS + Vite; WCAG 2.1 AA | ✅ | Second Vite entry; accessible names, keyboard toggle, theme colours, WCAG scan (D8) |
| QG | Rendering/sanitization tests; security-relevant changes called out | ✅ | Sanitizer allow-list and rendering tests; the security e2e suite. PR must call out: new dependency, new served page with its own CSP, the constitution amendment |

**Post-design re-check (after Phase 1)**: ✅. No violations beyond the amendment above.
- The contracts keep every meaning-bearing decision on the server: type, name, links and
  size limit.
- The renderer protocol carries only text in and SVG text out, with source-window checks
  on both sides.
- Display is image-only.

## Project Structure

### Documentation (this feature)

```text
specs/004-mermaid-diagrams/
├── plan.md
├── research.md          # R1–R10 (R9: proposed constitution amendment text)
├── data-model.md        # derived only
├── quickstart.md        # D1–D14
├── contracts/
│   ├── rendering.md     # server HTML for diagram blocks, sanitizer allow-list, plain text
│   ├── renderer.md      # renderer page, CSP, messages, Mermaid config, display
│   └── ui.md            # figure states, layout, theme, keyboard
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/Copernica/
├── Rendering/
│   ├── MarkdownRenderer.cs          # + UseCustomContainers, diagram renderers
│   ├── DiagramBlock.cs              # type/name/description/links/limit from source (pure, unit-tested)
│   ├── DiagramHtmlRenderer.cs       # Markdig renderers for mermaid fences and ::: mermaid containers
│   ├── HtmlSanitizerFactory.cs      # allow figure + diagram classes + data-diagram* attributes
│   └── PlainTextExtractor.cs        # verify figure text matches DOM textContent
└── Web/SpaHosting.cs                # serve /diagram-renderer.html with its own CSP
src/web/
├── diagram-renderer.html            # second Vite entry (index for the frame)
├── vite.config.ts                   # rollupOptions.input: { main, diagramRenderer }
└── src/
    ├── diagrams/
    │   ├── renderer-main.ts         # frame side: mermaid.initialize, message handling
    │   ├── rendererClient.ts        # UI side: lazy frame, queue, cache, timeout, source check
    │   ├── theme.ts                 # token values → ThemeTokens
    │   ├── useDiagrams.ts           # finds figures in a container, drives states, theme redraw
    │   └── diagrams.css             # figure layout and states
    ├── pages/PageView.tsx           # useDiagrams(article)
    └── pages/PageEdit.tsx           # useDiagrams(preview containers)
scripts/check-licenses.ps1           # known-licence entries for dompurify (Apache-2.0 option) and khroma (MIT)
tests/
├── Copernica.Tests/Rendering/DiagramTests.cs
├── Copernica.IntegrationTests/Web/RendererPageTests.cs
└── e2e/us8-diagrams.spec.ts         # D1–D13 (+ a11y.spec additions)
```

**Structure Decision**: the server part stays inside `Rendering/`, the single place where
HTML is made. The browser part is an isolated `diagrams/` folder plus a second build entry,
so Mermaid never enters the main bundle. No new projects.

## Delivery increments

1. **Governance**: ✅ amendment v1.3.0 applied (research R9).
2. **Spike** (R4): a sandboxed frame with `script-src 'self'` works in Chromium, Firefox
   and WebKit; otherwise switch to the nonce fallback.
3. **Server**:
   - diagram blocks (fence + container), metadata, links, limit;
   - sanitizer, plain text;
   - renderer page CSP;
   - tests.
4. **US1**: renderer entry and client, figure states, image display; D1–D6, D11–D13.
5. **US2**: preview integration; D7.
6. **US3**: theme redraw, scroll wrapper, toggle, names; D8–D10 and the WCAG scan.
7. **Polish**: `SECURITY.md`, README, licence script, regression (D14).

## Complexity Tracking

| Added complexity | Why needed | Simpler alternative rejected because |
|------------------|------------|--------------------------------------|
| A sandboxed renderer frame with a message protocol, instead of calling Mermaid in the page | Keeps user-derived markup out of the wiki document (constitution, research R1) and confines Mermaid's inline styles and any parser bug to an opaque-origin, network-less document | Mermaid in the page would insert user-derived SVG/HTML into the wiki DOM (constitution) and need `'unsafe-inline'` or nonces for Mermaid's `<style>`s in the main document. Server-side drawing needs a headless browser in the artifact |
| A second Vite entry and served page with its own CSP | The renderer needs a document whose policy differs from the SPA's | Reusing the SPA shell would either weaken the SPA CSP or fail to run Mermaid |
