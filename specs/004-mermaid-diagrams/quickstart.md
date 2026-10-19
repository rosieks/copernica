# Quickstart & Validation: Diagrams in Markdown Pages

Contracts: [rendering](contracts/rendering.md), [renderer](contracts/renderer.md) and
[ui](contracts/ui.md). Decisions: [research.md](research.md).

## Setup

Use the [001 quickstart section A](../001-git-backed-team-wiki/quickstart.md#a-local-evaluation-no-external-services)
setup. Push these pages to `handbook` with plain git:

- `visuals/all-types.md`: one block each of flowchart, sequence, class, state, ER, gantt,
  pie and gitGraph. The flowchart has `accTitle: Order flow` and
  `accDescr: From cart to delivery`, and `click A "../guides/setup.md" "Setup"`.
- `visuals/ado.md`: the same flowchart as `::: mermaid` … `:::`.
- `visuals/broken.md`: a syntax error in one diagram and a valid one after it.
- `visuals/huge.md`: a 25 000-character flowchart.
- `visuals/wide.md`: a flowchart with 40 nodes in one row.
- `visuals/evil.md`, each in its own block:
  - `<script>` in a label;
  - `click A call alert(1)`;
  - `click B "javascript:alert(1)"`;
  - `%%{init: {"securityLevel": "loose"}}%%` with an HTML label `<img src=x onerror=alert(1)>`;
  - a label referencing `https://example.com/x.png`;
  - a `classDef` with `font-family: url(https://example.com/f)`.

## Scenarios

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| D1 | Open `all-types.md` | 8 drawn diagrams; page text visible before they finish; all drawn within 3 s | US1-1/3, FR-001, FR-003, SC-001/002 |
| D2 | Inspect the flowchart | `img` alt "Order flow. From cart to delivery"; "Links in this diagram" lists "Setup" → `/s/handbook/guides/setup.md` | FR-007, FR-012 |
| D3 | Open `ado.md` | Diagram drawn | US1-2, FR-002, SC-006 |
| D4 | Open `broken.md` | First figure: callout "could not be drawn" plus source; second drawn; rest of page normal | US1-4, FR-004 |
| D5 | Open `huge.md` | Callout "too large to draw" plus source; no renderer message sent | FR-006 |
| D6 | Open an old version of `all-types.md` after changing a diagram | The old diagram is drawn | US1-5 |
| D7 | Edit a page; add a flowchart; then introduce a typo; then fix it | Preview draws it ≤ 2 s after typing stops; typo → error only for that diagram; fixed → drawn | US2, SC-003 |
| D8 | Switch the OS theme with diagrams visible | Diagrams redraw in dark colours; WCAG scan 0 violations in both themes | US3-1, FR-010, SC-005 |
| D9 | 320 px width on `wide.md`; then "Show full size" and "Fit to width" | Fits the column with no scrolling; at full size only the diagram scrolls; no page reflow in either. A diagram that fits (`ado.md`) has no size button | US3-2, FR-011 |
| D10 | Keyboard: Tab to "Show diagram source", Enter, Enter | Source shown, then diagram again; focus stays on the button; `aria-expanded` toggles | US3-4, FR-013 |
| D11 | Open `evil.md` with all requests logged and a dialog handler | 0 dialogs; `window.__xss` unset; 0 requests to hosts other than the wiki; no `javascript:` link in the links list | FR-007, FR-008, SC-004 |
| D12 | `curl -I /diagram-renderer.html` and `/` | Renderer CSP as in [renderer.md](contracts/renderer.md); SPA shell CSP unchanged (002) | R4 |
| D13 | Start a discussion on a sentence after a diagram; reload | Still anchored to the same sentence | R6 |
| D14 | Repeat 001 A1–A15, 002 V1–V29 and 003 P1–P15 | All pass | Regression |

## Automated checks

```bash
dotnet test                             # rendering: blocks, names, links, limits, sanitizer, plain text; renderer CSP
npm --prefix src/web test               # renderer protocol, queue/cache/timeout, figure states
npx --prefix tests/e2e playwright test --project=chromium   # D1–D14 (+ firefox/webkit in separate runs)
pwsh scripts/check-licenses.ps1         # mermaid 11.17.2 tree: permissive only (dompurify under Apache-2.0, khroma MIT)
```
