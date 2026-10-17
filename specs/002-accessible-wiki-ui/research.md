# Research: Consistent, Accessible Wiki Interface

Decisions behind [plan.md](plan.md). The stack is fixed by the constitution and by feature
001 (React 19 + TypeScript + Vite SPA embedded in the ASP.NET Core server; see
[001 research R9](../001-git-backed-team-wiki/research.md#r9-frontend)). R1–R5 come from
the UI design draft made earlier on 2026-10-17; R6–R10 cover requirements added by the 002
spec.

## R1. UI component library

- **Decision**: **Radix Primitives** via the single `radix-ui` package (MIT, pinned
  `1.8.1`), used *unstyled*. Only the primitives listed in
  [contracts/ui.md](contracts/ui.md#component-inventory) are imported (Dialog,
  AlertDialog, DropdownMenu, Popover, Tooltip, Toast, Tabs, ToggleGroup, Toolbar,
  Collapsible, Separator, Label, VisuallyHidden, Slot); the rest is tree-shaken by Vite.
  Every primitive is wrapped once in `src/web/src/ui/`; screens never import `radix-ui`
  directly, so styling lives in one place and the library stays replaceable.
- **Rationale**:
  - Accessibility (WCAG 2.1 AA, constitution). Focus trapping and return, `Esc`
    handling, roving tab index, menu typeahead, `aria-*` wiring and portal layering are
    the most expensive parts to hand-write. They are also where the current hand-written
    `<dialog>`/`<select>`/button UI falls short: no menus, no tooltips on icon buttons, no
    accessible toasts.
  - Unstyled, so the look is entirely our CSS: nothing to override and no second styling
    system shipped.
  - Supply chain (Principle IV): a probe install of `radix-ui@1.8.1` resolves 77 packages
    besides React. 72 are MIT and `tslib` is 0BSD. None is copyleft, none has install
    scripts, none touches the network at runtime. The non-trivial transitive packages
    (`react-remove-scroll`, `react-style-singleton`, `aria-hidden`, `get-nonce`) are small
    and MIT.
  - Supports React 19 with no CSS-in-JS runtime and no `eval`.
- **Alternatives considered**:
  - *Radix Themes* (MIT; styled layer over Primitives). Rejected: a large global stylesheet
    we would mostly override, a second token system and more inline styles.
  - *React Aria Components* (Apache-2.0). Strongest accessibility story and it includes a
    Tree. Rejected narrowly: much larger dependency graph (`@react-aria/*`,
    `@react-stately/*`, `@internationalized/*`) and a steeper API. It is the fallback if
    Radix blocks us.
  - *Ariakit* (MIT). Pre-1.0 (`0.4.x`).
  - *Headless UI* (MIT). Too few primitives: no toast, tooltip or toolbar.
  - *shadcn/ui* (copy-paste over Radix + Tailwind). Rejected because it brings Tailwind
    plus the `class-variance-authority`/`tailwind-merge` runtime helpers. Its *pattern* of
    owning thin wrappers in `src/ui/` is adopted.
- **Not covered by Radix**: the page tree (Radix has no Tree), so the existing WAI-ARIA
  tree in `PageTree.tsx` stays and is restyled with the tokens. The Markdown editor and
  diff stay on CodeMirror (001 R9).

## R2. Styling, design tokens and theming

- **Decision**: plain CSS: no preprocessor, no CSS-in-JS. Files:
  - `styles/tokens.css`: custom properties;
  - `styles/base.css`: reset, typography, and `.prose` for rendered Markdown;
  - one co-located stylesheet per `ui/` wrapper.

  Components are styled through namespaced classes (`.ui-dialog__content`) and Radix
  state attributes (`data-state`, `data-side`, `data-highlighted`), never through inline
  styles written by us.
- **Palette**: **Radix Colors** (`@radix-ui/colors`, MIT, `3.0.0`), using `slate`
  (neutral), `indigo` (accent), `red` (danger), `amber` (warning, discussion highlights)
  and `green` (success). Each scale has 12 steps with defined roles:
  - 1–2: app backgrounds;
  - 3–5: component backgrounds;
  - 6–8: borders;
  - 9–10: solid fills;
  - 11–12: text.

  Light and dark scales are imported as bundled CSS files, which replace today's
  hand-picked hex values. Semantic tokens (`--color-bg`, `--color-text-muted`,
  `--color-accent-solid`, …) map onto scale steps, and components use only semantic
  tokens.
- **Theme**: follows `prefers-color-scheme`. The dark scale files are selected by a `dark`
  class on `<html>`, set from `matchMedia` in `main.tsx` before the first render (no
  inline script). A manual theme switch is out of scope (YAGNI).
- **Typography**: system UI and monospace font stacks only, so there is no web font to
  fetch or license-review. Rendered pages are capped at a `60rem` reading width (first `72ch`; widened after review because it looked too narrow). The editor preview is not capped and fills its box. The type
  scale is in [contracts/ui.md](contracts/ui.md#design-tokens).
- **Contrast**: text uses steps 11–12 on backgrounds 1–3, the pairing Radix Colors designs
  for AA contrast. The automated accessibility scan (R10) runs in both themes.
- **Alternatives**:
  - Tailwind (build-only, MIT). Rejected: a second styling vocabulary in markup.
  - Open Props (MIT). Viable, but Radix Colors pairs with the chosen primitives and
    documents what each step is for.
  - CSS Modules. Unnecessary given namespaced wrapper classes; Vite supports them if
    collisions appear.

## R3. Radix under the strict Content Security Policy

- **Findings** (probe install of `radix-ui@1.8.1`):
  1. Positioned primitives (Popover, Tooltip, DropdownMenu) place content with React
     `style` props, i.e. style *attributes*. Already allowed by
     `style-src-attr 'unsafe-inline'` (001 R9 amendment).
  2. Modal primitives (Dialog, AlertDialog, modal DropdownMenu) lock page scroll through
     `react-remove-scroll-bar`, which injects a `<style>` **element** via
     `react-style-singleton`. `style-src 'self'` blocks it. The element gets a `nonce`
     attribute only if one is registered with `get-nonce`'s `setNonce()`.
  3. `Select` and `ScrollArea` inject `<style>` elements through
     `dangerouslySetInnerHTML`, with no nonce support.
- **Decision**:
  - Do **not** use Radix `Select` or `ScrollArea`. Use a styled native `<select>` or a
    ToggleGroup, and native overflow scrolling.
  - Allow nonce-tagged `<style>` elements in the SPA shell only. For every response of the
    `index.html` fallback (`Web/SpaHosting.cs`), the server:
    1. generates a 128-bit random nonce;
    2. substitutes it into `<meta name="csp-nonce" content="__CSP_NONCE__">`;
    3. sends that response with `style-src 'self' 'nonce-<value>'`.

    `main.tsx` reads the meta tag and calls `setNonce()` before the first render.
    `get-nonce` becomes a direct, pinned dependency (MIT, `1.0.1`, the version Radix
    resolves). `script-src 'self'` and every other directive are unchanged. Every
    response other than the shell keeps the static policy. `index.html` is excluded from
    the static-file middleware so every load gets a fresh nonce.
- **Rationale**: scroll locking keeps working, normal use raises no CSP violations, and
  the constitution rule (`script-src 'self'`, no inline scripts, no `eval`) is untouched.
  The risk added is negligible:
  - user HTML is sanitized on the server and can contain neither `<style>` nor a nonce;
  - code able to read the nonce is already running as a `'self'` script.
- **Alternatives**:
  - *Accept the blocked `<style>` and replicate `body[data-scroll-locked]{overflow:hidden}`
    in our CSS.* Visually equivalent, but every dialog open logs a CSP violation. That
    hides real violations and breaks the "no CSP violations" check (001 quickstart A4, here D2).
  - *`style-src 'unsafe-inline'`.* Rejected: weakens the policy for all style elements.
  - *Hash sources.* Impossible: the injected CSS embeds the measured scrollbar width.
- **Verification**:
  - an integration test asserts that the nonce is fresh per request and identical in the
    header and the document;
  - an e2e test opens every modal surface and asserts zero `securitypolicyviolation`
    events.

  `SECURITY.md` documents the CSP change (Quality Gates: security-relevant change).

## R4. Icons

- **Decision**: `@radix-ui/react-icons` (MIT, `1.3.2`). It provides about 300 icons on a
  15×15 grid as inline SVG components, tree-shaken per named import, with no sprite or
  icon font. Icons are `aria-hidden`. Every icon-only button has an `aria-label` and a
  Tooltip with the same text.
- **Alternatives**: Lucide (`lucide-react`, ISC). Larger set, but a second visual language
  next to Radix. Hand-drawn SVGs: maintenance with no benefit.

## R5. Layout and responsive behaviour

- **Decision**: a CSS Grid shell with a header, a navigation region, content, and an
  optional discussion aside. Three breakpoints:
  - `≥ 1200px`: tree | page | discussions side by side;
  - `768–1199px`: tree | page, with discussions in a right-hand non-modal sheet;
  - `< 768px`: page only. The tree opens in a left-hand modal sheet from a header button,
    and discussions in a bottom/right sheet.

  The sidebar is fixed at `18rem`. Resizable panes are out of scope (YAGNI).
- **Rationale**: WCAG 2.1 AA 1.4.10 (Reflow) requires usable content at 320 CSS px. On
  laptop widths, the discussion panel already competes with the page for space.
- **Spec mapping**: FR-009, FR-010, FR-011 (the toggle shows the open-discussion count).

## R6. Data for page information and merge notices (FR-007, FR-021, FR-024)

- **Findings** (feature 001 API):
  - `Page` carries only `PageVersionRef`, with no author, date or message.
  - `GET /history/{path}` always starts at the branch head, so it cannot describe an older
    version.
  - `SaveResult` reports `merged: true` but not with whose change. The conflict response
    already computes `theirsAuthors`.
- **Decision**: two **additive, backward-compatible** API changes. No new stored data, no
  new endpoint.
  1. `GET /spaces/{id}/history/{path}` accepts an optional `version` query parameter, a
     commit id: history starts at that commit instead of the branch head. The UI asks for
     `?version=<shown commit>&limit=1` after the page has rendered (separate query, so it
     never delays content, FR-024). The same call serves current and older versions.
  2. `SaveResult` gains `mergedAuthors: string[]`. It holds the distinct author names of
     the commits between the edit's base and the tip that the save was merged with, and is
     empty when `merged` is false. The UI shows "Saved — merged with changes by Alice and
     Bob".
- **Rationale**: the server already walks exactly these commits (history listing; merge
  base → tip for conflicts). Exposing them costs one parameter and one field. Deriving the
  same data in the browser would need the full history list.
- **Alternatives**:
  - *Add `lastChange: PageVersion` to `Page`.* Rejected: the path-filtered log walk would
    run on every page load. On deep histories that risks the 2 s display target (001
    SC-002, 002 SC-008), and FR-024 forbids delaying content.
  - *Generic "merged with someone else's change" text.* Rejected: FR-007 requires names.
- **Access**: both changes run behind the existing read and write checks of their
  endpoints. `version` must be a commit reachable from the space's branch, or the response
  is `404` (no probing of arbitrary objects).

## R7. Keyboard shortcuts and the shortcut preference (FR-015–FR-018)

- **Decision**: one small in-house `useShortcuts` hook. A single `keydown` listener on
  `document` dispatches against a registry that each screen fills while it is mounted.
  No hotkey library.

  | Shortcut | Action | Kind |
  |----------|--------|------|
  | `e` | Edit current page (write, current version) | single-key |
  | `c` | Comment on the current selection | single-key |
  | `?` (`Shift+/`) | Open shortcut help | single-key |
  | `Ctrl/⌘+S` | Save in the editor (prevents the browser's "save page") | modifier |
  | `Ctrl/⌘+Enter` | Submit comment / reply | modifier |
  | `Esc` | Close the topmost overlay (Radix built-in) | modifier-free, but not a character key |

- **Rules**:
  - single-key shortcuts are ignored when the event target is editable (`input`,
    `textarea`, `select`, `[contenteditable]`, the CodeMirror editor), when any modifier
    is pressed, or during IME composition (`event.isComposing`), per FR-016;
  - modifier shortcuts are registered only by the field or form they belong to.
- **Preference** (FR-017):
  - stored as "single-key shortcuts: on/off" in `localStorage`
    (`copernica.singleKeyShortcuts`, default on), as defined in [data-model.md](data-model.md);
  - toggled in the Profile screen and in the shortcut help dialog;
  - with the preference off, single-key shortcuts are not registered and are not listed
    as available, while modifier shortcuts still work. This is the WCAG 2.1.4 "turn off"
    option.
- **Discoverability**: shortcut hints appear in tooltips (`Kbd`) and in the help dialog
  (FR-015 "open the shortcut help").
- **Alternatives**: `react-hotkeys-hook` (MIT). Unnecessary for six bindings and adds a
  shipped dependency (Principle IV). Remappable shortcuts are out of scope (spec
  Assumptions).

## R8. Notifications, state indicators and focus (FR-004–FR-008, FR-013, FR-014)

- **Decision**:
  - **Transient outcomes** (save, merge, copy) use a Radix **Toast**:
    - one viewport mounted at the app root, so toasts survive route changes (edge case
      "leaving after a notification");
    - `duration` 6000 ms for success and 8000 ms for merge, both at least the 5 s
      FR-006 requires;
    - Radix pauses the timer on hover, focus and window blur, and toasts can be dismissed;
    - the viewport is a polite live region (`F8` focuses it).

    This replaces `SaveNotice`.
  - **Failures** are never toasts. They are inline `Callout role="alert"` placed next to
    the preserved input (editor footer, comment form, delete dialog), and they stay until
    dismissed or retried (FR-008).
  - **State indicators** (old version, out of sync with `lastSyncAt`, read-only) are
    `Callout role="status"` at the top of the content. They have an icon, a text label and
    a tone, so they never rely on colour alone (FR-005). The read-only indicator is shown
    proactively whenever `canWrite` is false (002 US1-3), not only after a rejected
    attempt.
  - **Route focus** (FR-013): after navigation, focus moves to the view's
    `<h1 tabindex="-1">`, and a visually hidden live region announces
    "`<title>` · `<space>`". The skip link targets `#main`.
  - **Focus after removal** (FR-014): deleting a comment moves focus to the next comment,
    or to the previous one, or to the thread's reply box. Deleting a page navigates to the
    space home and focuses its `<h1>`.
- **Alternatives**: a hand-written live region (today's `SaveNotice`). It has no pause on
  hover or focus, no dismiss, and no queue.

## R9. Copy link, download and selection action (FR-019, FR-020, FR-022, FR-023)

- **Copy link**:
  - `navigator.clipboard.writeText(url)` copies the canonical URL of what is shown:
    `/s/<space>/<path>`, or `/s/<space>/-/version/<commit>/<path>` for an older version;
  - success → Toast "Link copied";
  - the Clipboard API needs a secure context. Plain-HTTP intranet hosts are not secure
    contexts (only `localhost`/`127.0.0.1` are), and permission can also be refused. In
    those cases a Dialog shows the link in a read-only, pre-selected text field with
    "Press Ctrl/⌘+C to copy" (FR-022 fallback). No `document.execCommand('copy')`
    (deprecated).
- **Download**: a plain link to the existing files endpoint
  `/api/spaces/<space>/files/<path>?version=<commit>`, which already serves non-image
  files as `Content-Disposition: attachment` with the file name (001 contract). It works
  for pages too large to display (FR-023). No API change.
- **Selection action**:
  - a Radix Popover with `Popover.Anchor virtualRef` pointing at the selection's bounding
    rectangle. Verified: `@radix-ui/react-popper` 1.4 supports `virtualRef`;
  - it opens with `onOpenAutoFocus` prevented, so focus stays in the page (FR-019);
  - it is shown only when `anchorFromSelection` (existing, 001) returns an anchor, i.e.
    the selection lies entirely inside the article (FR-020);
  - it closes on `selectionchange`, `Esc`, or the anchor leaving the viewport;
  - on touch devices (`pointer: coarse`) it is placed *below* the selection, so it does
    not cover the OS selection menu, which appears above.

## R10. Testing and automated accessibility checks (SC-001–SC-003)

- **Decision**:
  - **Vitest + Testing Library** for `ui/` wrappers and hooks:
    - accessible names; focus returning to the trigger;
    - `useShortcuts` (editable-target guard, preference off);
    - selection-popover visibility rules.
  - **Playwright** (001) for the scenarios in [quickstart.md](quickstart.md):
    - `colorScheme: 'dark' | 'light'` and `reducedMotion: 'reduce'` emulation;
    - viewports of 1280, 1000 and 320 px;
    - a reflow assertion
      (`document.documentElement.scrollWidth <= innerWidth`);
    - a listener collecting `securitypolicyviolation` events.
  - **WCAG scan**: **IBM Equal Access `accessibility-checker-engine`** (Apache-2.0, zero
    dependencies, build/test only, pinned). Its `ace.js` is injected into the page by
    Playwright and run with the WCAG 2.1 policy, and AA violations fail the test.
    Injection needs `bypassCSP: true`, so the scan runs in its *own* browser context. The
    CSP-violation checks run in normal contexts, so bypassing never hides a CSP problem.
- **Rationale**: this resolves 001 task T103 without a constitution amendment. The
  build-tooling rule requires permissive licenses, and the engine is Apache-2.0 with no
  dependencies, network access or telemetry.
- **Alternatives**:
  - *axe-core / @axe-core/playwright* (MPL-2.0). Not on the allowed-license list, so it
    needs an amendment.
  - *Lighthouse* (Apache-2.0). Bundles axe-core, so the same issue.
  - *`accessibility-checker`* (IBM's wrapper package). Rejected: depends on
    `@ibm/telemetry-js` (sends usage data), `puppeteer` and `chromedriver` (download
    browsers at install), which conflicts with Principles II and IV and with air-gapped
    builds.
  - *Pa11y*. LGPL-3.0.
- **Follow-up for tasks**: confirm the engine's WCAG 2.1 policy identifier and report API
  in the first a11y task. Also add the engine to `scripts/check-licenses.ps1`'s build-only
  list.
