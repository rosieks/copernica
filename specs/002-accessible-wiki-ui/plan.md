# Implementation Plan: Consistent, Accessible Wiki Interface

**Branch**: `002-accessible-wiki-ui` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-accessible-wiki-ui/spec.md`

## Summary

This feature redesigns the existing React SPA from feature 001 as one consistent,
accessible interface.

- **Behaviour** (focus, ARIA, overlays) comes from **unstyled Radix Primitives**, wrapped
  once in `src/web/src/ui/`.
- **Look** comes from project-owned CSS tokens on the **Radix Colors** palette, with light
  and dark themes that follow the OS. Icons come from **Radix Icons**.

On top of that sit:

- a responsive three-region shell, where the tree and the discussions collapse into
  sheets;
- a small in-house shortcut layer, whose single-key shortcuts can be turned off;
- Toasts for outcomes and inline Callouts for failures and state;
- a selection popover for commenting;
- a PageInfo line with copy-link and download actions.

The server changes are minimal:

- an optional `version` parameter on the history endpoint;
- a `mergedAuthors` field in `SaveResult`;
- a per-request `style-src` nonce on the SPA shell, because Radix's scroll lock injects a
  `<style>` element.

Routes, stored data and every other API stay as in 001.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), React 19.3; C# 14 / .NET 10 for the three
small server changes

**Primary Dependencies**:

- Existing (001): React, React Router, TanStack Query, CodeMirror 6.
- **New, shipped** (justified below): `radix-ui` 1.8.1, `@radix-ui/colors` 3.0.0,
  `@radix-ui/react-icons` 1.3.2, `get-nonce` 1.0.1.
- **New, test only**: `accessibility-checker-engine` (Apache-2.0).

**Storage**: none new. Two browser-only preferences in `localStorage`
([data-model.md](data-model.md)).

**Testing**:

- Vitest + Testing Library for `ui/` wrappers and hooks;
- Playwright with theme, viewport and reduced-motion emulation;
- an IBM Equal Access engine WCAG 2.1 scan;
- xUnit integration tests for the API and nonce changes.

**Target Platform**: browsers per the constitution (two latest Chrome, Edge, Firefox and
Safari), from 320 CSS px wide, including touch devices

**Project Type**: Web application (server + embedded SPA). This is a frontend-heavy
change to the existing artifact.

**Performance Goals**:

- page display < 2 s for pages up to 100 KB (001 SC-002 / 002 SC-008); PageInfo never
  delays it;
- theme switch < 1 s (SC-007);
- the shipped JS bundle grows by no more than ~60 KB gzip (Radix primitives in use +
  icons), to be checked in tasks.

**Constraints**:

- strict CSP: `script-src 'self'` unchanged; style nonce only on the shell document;
- no remote fonts or assets;
- WCAG 2.1 AA in both themes;
- no route changes.

**Scale/Scope**:

- 7 screens (S1–S7) and about 22 `ui/` wrappers;
- 2 API additions and 1 shell-serving change;
- about 30 Playwright scenarios (V1–V29).

No open unknowns. All decisions are in [research.md](research.md) R1–R10.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / rule | Status | Evidence |
|---|------------------|--------|----------|
| I | English for all artifacts | ✅ | Spec, plan, contracts and UI strings in English |
| II | No new egress; all runtime assets bundled | ✅ | Radix Colors CSS and icon SVGs bundled by Vite; system fonts only; avatars are initials; V28 greps `dist/` for external URLs |
| III | Auth, least privilege, safe content, transparency | ✅ | No auth change. History `version` is behind the existing read check and limited to commits reachable from the space branch (no probing). Rendered HTML still server-sanitized and injected only into article and preview. `SECURITY.md` updated for the CSP nonce |
| IV | Shipped deps justified, permissive, pinned; offline build | ✅ | Table below. Probe install of `radix-ui`: 77 transitive packages, 72 MIT + `tslib` 0BSD, none copyleft, no install scripts. Test-only engine: Apache-2.0, zero deps, no telemetry. All pinned in lockfiles |
| V | Git is the source of truth; YAGNI | ✅ | No new stored data. Rejected for YAGNI: theme switch, remappable shortcuts, resizable panes |
| Sec | Strict CSP: `script-src 'self'`, no inline scripts, no `eval` | ✅ (style directive changed) | Only `style-src` gains a per-request nonce, on the shell document only. Radix Select/ScrollArea excluded (R3). Security-relevant: the PR must call it out |
| Sec | Markdown rendered and sanitized on the server, in one place | ✅ | Unchanged; the UI adds no other HTML source |
| Stack | React + TS + Vite embedded; WCAG 2.1 AA; target browsers | ✅ | Same stack; accessible primitives; automated WCAG scan in both themes (R10). This also resolves 001 task T103 without an amendment |
| QG | Tests for rendering/sanitization, auth on write paths, conflicts, storage | ✅ | Unchanged suites stay green (V29). New integration tests for `version`, `mergedAuthors` and the nonce ([api-changes.md](contracts/api-changes.md#tests)) |

**Shipped dependency justification (Principle IV)**

| Dependency | License | Why needed / why not hand-written |
|------------|---------|-----------------------------------|
| `radix-ui` (Primitives, unstyled) | MIT | Focus trapping/return, roving focus, menu typeahead, ARIA wiring, layered portals and accessible toasts for about 14 widget types (R1). Hand-writing these to WCAG 2.1 AA is the costliest part of the UI |
| `@radix-ui/colors` | MIT | Light/dark 12-step scales with documented contrast roles; pure CSS (R2) |
| `@radix-ui/react-icons` | MIT | Consistent inline SVG icons, tree-shaken; no font or sprite (R4) |
| `get-nonce` | MIT | Hands the CSP nonce to Radix's scroll lock. Already transitive; made direct to pin it and call `setNonce()` (R3) |

**Post-design re-check (after Phase 1)**: ✅ No violations.

- The contracts add one query parameter and one response field. Neither fetches URLs,
  writes data or widens access.
- The shell nonce is fresh per response, never cached, and absent from API responses.
- The UI contract keeps every asset local, and every overlay has a title and focus
  return.
- Single-key shortcuts can be turned off (WCAG 2.1.4).

## Project Structure

### Documentation (this feature)

```text
specs/002-accessible-wiki-ui/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R10
├── data-model.md        # Phase 1: client-side state only
├── quickstart.md        # Phase 1: validation scenarios V1–V29
├── contracts/
│   ├── ui.md            # Tokens, shell, screens S1–S7, components, keyboard, a11y, traceability
│   └── api-changes.md   # history `version`, SaveResult.mergedAuthors, shell nonce
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── Copernica/
│   ├── Api/SpacesEndpoints.cs          # history: optional `version` (reachability check)
│   ├── Api/PageWriteEndpoints.cs       # SaveResult.mergedAuthors
│   ├── Git/HistoryService.cs           # start walk at a given commit
│   ├── Git/PageWriter.cs               # collect authors of merged-over commits
│   └── Web/SpaHosting.cs               # shell templating: nonce → <meta> + CSP header; index.html not static
│       Web/SecurityHeadersMiddleware.cs # policy builder shared with SpaHosting
└── web/
    ├── index.html                      # <meta name="csp-nonce" content="__CSP_NONCE__">
    └── src/
        ├── main.tsx                    # setNonce(), theme bootstrap, Tooltip/Toast providers
        ├── theme.ts                    # html.dark from prefers-color-scheme (+ change listener)
        ├── shortcuts/                  # useShortcuts, registry, preference, ShortcutHelp dialog
        ├── styles/                     # tokens.css, base.css, prose.css, layout.css (replaces styles.css)
        ├── ui/                         # Button, IconButton, Dialog, AlertDialog, Sheet, Menu, Popover,
        │                               # Tooltip, Toast, Tabs, ToggleGroup, Toolbar, Collapsible,
        │                               # Separator, Field, Callout, Badge, Avatar, EmptyState,
        │                               # Spinner/Skeleton, VisuallyHidden, Kbd  (+ .css each, index.ts)
        ├── layout/                     # AppShell, Header, SpaceSwitcher, UserMenu, SkipLink, RouteAnnouncer
        ├── pages/                      # existing screens migrated to ui/ (+ PageInfo, PageActions, StateIndicators)
        ├── components/                 # PageTree (restyled), MarkdownEditor/DiffView (token theme)
        └── discussions/                # DiscussionPanel → ToggleGroup, Collapsible threads,
                                        # SelectionPopover, focusable highlights
tests/
├── Copernica.IntegrationTests/         # + HistoryVersionTests, MergedAuthorsTests, ShellNonceTests
└── e2e/                                # + us1-state…us6-theme specs, a11y.spec.ts (engine, bypassCSP context),
                                        #   csp.spec.ts, reflow.spec.ts; helpers for themes/viewports
```

**Structure Decision**: same two deployables as 001 (one backend project, one frontend
package, one artifact).

- The frontend gains `ui/` as the only place that imports `radix-ui`, `styles/` for
  tokens, and small feature folders (`layout/`, `shortcuts/`).
- `components/SaveNotice.tsx` and `styles.css` are removed when migration finishes.
- No new projects or packages.

## Delivery increments

Each step leaves the app working and shippable. They map to the spec's user stories.

1. **Foundation**:
   - CSP nonce (server + `setNonce`) with tests;
   - tokens and base styles, with the dark theme following the OS (US6);
   - `ui/` wrappers with unit tests;
   - WCAG scan and CSP-violation e2e harness (R10).
2. **Shell and responsive layout (US2)**: AppShell, sheets, skip link, route focus and
   announcer, restyled PageTree.
3. **State and feedback (US1)**: state indicators, Toast provider (replaces SaveNotice),
   inline failure Callouts, `mergedAuthors`.
4. **Screens**: S1–S7 migrated to `ui/`: dialogs → Dialog/AlertDialog, menus, tabs in the
   editor and conflict view.
5. **Keyboard (US3)**: `useShortcuts`, shortcut help, preference in Profile, focusable
   highlights.
6. **Selection commenting (US4)**: SelectionPopover; discussions panel on ToggleGroup and
   Collapsible.
7. **Page information and actions (US5)**: history `version`, PageInfo, Copy link with
   fallback, Download.
8. **Clean-up**: remove the old CSS and SaveNotice; bundle-size check; `SECURITY.md`;
   run V1–V29 and 001 A1–A15.

## Complexity Tracking

| Added complexity | Why needed | Simpler alternative rejected because |
|------------------|------------|--------------------------------------|
| The SPA shell is templated per request (CSP style nonce) instead of served as a static file | Radix modal primitives inject a `<style>` element for scroll locking; the strict CSP blocks it unless it carries a nonce (R3) | Replicating the CSS statically still logs a CSP violation on every dialog open, which hides real violations; `style-src 'unsafe-inline'` weakens the policy for all style elements |
| A second browser context with `bypassCSP` in e2e, for the WCAG engine | The engine script must be injected into the page | Shipping the engine or allowing it in the production CSP is out of the question; one dedicated context keeps CSP tests honest |
