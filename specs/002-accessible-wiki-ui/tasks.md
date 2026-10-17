---

description: "Task list for 002 Consistent, Accessible Wiki Interface"
---

# Tasks: Consistent, Accessible Wiki Interface

**Input**: Design documents from `specs/002-accessible-wiki-ui/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md),
[contracts/api-changes.md](contracts/api-changes.md), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution's Quality Gates require tests for security-relevant
and write-path changes. Spec SC-001–SC-003 require automated accessibility, keyboard and
reflow checks. Scenario IDs (V1–V29) refer to [quickstart.md](quickstart.md).

**Organization**: tasks are grouped by user story (US1–US6 from spec.md), so each story
can be implemented, tested and shipped on its own after Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to
- Paths are repository-relative. Frontend lives in `src/web/src`, server in
  `src/Copernica`, and tests in `tests/`.

**Conventions for every UI task**:

- Screens import UI building blocks only from `src/web/src/ui/index.ts`. Only files in
  `src/web/src/ui/` may import `radix-ui`.
- Styling uses only the semantic tokens of `contracts/ui.md` → *Design tokens*. There are
  no inline `style` props written by us and no `<style>` elements.
- Never use Radix `Select` or `ScrollArea` (research R3).
- All UI strings are in English.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies, tooling and build placeholders.

- [X] T001 Add the shipped frontend dependencies with exact versions to `src/web/package.json`: `radix-ui@1.8.1`, `@radix-ui/colors@3.0.0`, `@radix-ui/react-icons@1.3.2`, `get-nonce@1.0.1`. Then run `npm --prefix src/web install` and commit `src/web/package-lock.json`.
- [X] T002 [P] Add `accessibility-checker-engine` (Apache-2.0, exact latest version, devDependency) to `tests/e2e/package.json`, run `npm --prefix tests/e2e install`, and commit `tests/e2e/package-lock.json`.
- [X] T003 [P] Run `pwsh scripts/check-licenses.ps1` and confirm that all new npm production packages (including transitive `react-remove-scroll`, `react-style-singleton`, `aria-hidden`, `use-sidecar`, `use-callback-ref`, `detect-node-es`, `tslib` 0BSD) pass. Regenerate `THIRD-PARTY-NOTICES.md`.
- [X] T004 [P] Add `<meta name="csp-nonce" content="__CSP_NONCE__" />` to `<head>` in `src/web/index.html`. Run `npm --prefix src/web run build` and verify that the placeholder survives unchanged in `src/web/dist/index.html`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: CSP nonce, tokens, themes, the `ui/` wrapper layer, the app shell skeleton
and the e2e harness. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Server: per-request style nonce (research R3, contracts/api-changes.md §3)

- [X] T005 Refactor `src/Copernica/Web/SecurityHeadersMiddleware.cs`:
  - expose `public static string BuildPolicy(string? styleNonce)`, which returns today's policy and, when a nonce is given, replaces `style-src 'self'` with `style-src 'self' 'nonce-<nonce>'`;
  - keep `ContentSecurityPolicy` = `BuildPolicy(null)`;
  - keep every other directive byte-identical.
- [X] T006 Change the `MapFallback` handler in `src/Copernica/Web/SpaHosting.cs`:
  - read `index.html` once into a cached string at startup;
  - per response, generate a 128-bit nonce with `RandomNumberGenerator.GetBytes(16)` → base64, and replace `__CSP_NONCE__`;
  - set `Content-Security-Policy` to `SecurityHeadersMiddleware.BuildPolicy(nonce)` before writing, so the middleware keeps it;
  - keep `Cache-Control: no-cache`;
  - make the `UseStaticFiles` provider skip `index.html`, so `/index.html` also goes through the fallback.
- [X] T007 [P] Add `tests/Copernica.IntegrationTests/Web/ShellNonceTests.cs`:
  - two GETs of `/` have different nonces;
  - the header nonce equals the `<meta name="csp-nonce">` value;
  - `/index.html` is nonce-templated too;
  - `__CSP_NONCE__` never appears in a response;
  - `/api/spaces` (authenticated) and `/assets/*` carry the static policy without `nonce-`;
  - `script-src 'self'` is unchanged.
  
  Update `tests/Copernica.IntegrationTests/Web/SecurityHeadersTests.cs` if it asserts the exact shell CSP.
- [X] T008 [P] Update the CSP section of `SECURITY.md` (around line 79): the SPA shell response adds a per-request `style-src` nonce, used only for library-injected `<style>` (the scroll lock); `script-src 'self'` is unchanged; API and asset responses keep the static policy. Note that the test-only accessibility engine is never shipped.

### Client bootstrap and tokens (research R2, R3; contracts/ui.md → Design tokens)

- [X] T009 Create `src/web/src/theme.ts`:
  - `applyNonce()` reads `document.querySelector('meta[name="csp-nonce"]')?.content` and, if it is present and not `__CSP_NONCE__`, calls `setNonce()` from `get-nonce`;
  - `startTheme()` toggles the class `dark` on `document.documentElement` from `matchMedia('(prefers-color-scheme: dark)')` and listens for `change` (FR-025: no reload, input untouched).

  Call both in `src/web/src/main.tsx` before `createRoot`.
- [X] T010 [P] Create `src/web/src/styles/tokens.css`:
  - import the light and dark Radix Colors files for `slate`, `indigo`, `red`, `amber`, `green` and `slateA` (`@radix-ui/colors/slate.css`, `slate-dark.css`, …). The dark files apply under `.dark`;
  - define every semantic token from `contracts/ui.md` → *Colour*, *Typography*, *Space, radius, elevation, motion*, with the exact step mapping given there;
  - under `@media (prefers-reduced-motion: reduce)` set `--duration-fast` and `--duration-normal` to `0ms` (FR-028).
- [X] T011 [P] Create `src/web/src/styles/base.css`:
  - box-sizing reset; `body` on `--color-bg`/`--color-text`/`--font-sans`/`--leading-normal`;
  - links in `--color-accent-text`;
  - a global `:focus-visible { outline: none; box-shadow: var(--focus-ring); }` with an outline fallback under `@media (forced-colors: active)`;
  - a `.visually-hidden` utility.
- [X] T012 [P] Create `src/web/src/styles/prose.css` for `.prose`:
  - `max-width: var(--prose-width)`; headings `--text-2xl`…`--text-md`, with `scroll-margin-top: calc(var(--header-height) + var(--space-4))`;
  - `pre` and `table` with `display:block; overflow-x:auto; max-width:100%` (FR-009); zebra rows; disabled task-list checkboxes;
  - broken wiki links in `--color-danger-text` with a dashed underline (use the class the server already emits; check `src/Copernica/Rendering/WikiLinkRewriter.cs`).
- [X] T013 [P] Create `src/web/src/styles/layout.css` with the CSS Grid shell from `contracts/ui.md` → *App shell and regions*:
  - areas `header / nav / main / aside`;
  - `--sidebar-width` and `--aside-width`;
  - breakpoints `≥1200px` (three columns), `768–1199px` (no aside column), `<768px` (main only).

  The grid only. The sheets come in US2.
- [X] T014 In `src/web/src/main.tsx`, replace `import './styles.css'` with imports of `styles/tokens.css`, `styles/base.css`, `styles/prose.css` and `styles/layout.css`. Keep the old `src/web/src/styles.css` imported after them until T090, so screens not yet migrated stay styled.

### `ui/` wrapper layer (research R1; contracts/ui.md → Component inventory)

Each wrapper is `src/web/src/ui/<Name>.tsx` plus `src/web/src/ui/<Name>.css`. It uses
BEM-style classes `ui-<name>__<part>`, styles Radix `data-state`/`data-side`, and has
open/close motion driven only by the duration tokens.

- [X] T015 [P] `src/web/src/ui/Button.tsx`:
  - props `variant: 'primary'|'secondary'|'ghost'|'danger'` (default `secondary`), `size: 'sm'|'md'`, optional `icon`;
  - `asChild` via Radix `Slot`, for router `Link`s;
  - minimum target 32×32 (`sm`) / 36×36 (`md`).
- [X] T016 [P] `src/web/src/ui/IconButton.tsx`: a `Button` plus `Tooltip`. The `label` prop is required and becomes both `aria-label` and the tooltip text; optional `shortcut` is rendered with `Kbd` in the tooltip. The icon is `aria-hidden`.
- [X] T017 [P] `src/web/src/ui/Dialog.tsx` (Radix Dialog): required `title` (→ `Dialog.Title`), optional `description`, `size`, `footer`, a close `IconButton` labelled "Close"; content `max-width: 32rem`; overlay on `--color-overlay`.
- [X] T018 [P] `src/web/src/ui/AlertDialog.tsx` (Radix AlertDialog): `title`, `description`, `confirmLabel`, `cancelLabel` (default "Cancel"), `tone="danger"`, `onConfirm`. Initial focus on *Cancel* (`onOpenAutoFocus` focuses the cancel ref, FR-003).
- [X] T019 [P] `src/web/src/ui/Sheet.tsx` (Radix Dialog): `side: 'left'|'right'`, `modal` (default true), required `title`; slide-in from the side using `--duration-normal`; full width below 768px.
- [X] T020 [P] `src/web/src/ui/Menu.tsx` (Radix DropdownMenu, `modal={false}` default): `Menu.Root`, `Menu.Trigger`, `Menu.Content`, `Menu.Item` (`tone?: 'danger'`, optional icon), `Menu.Separator`, `Menu.Label`.
- [X] T021 [P] `src/web/src/ui/Popover.tsx` (Radix Popover): accepts `anchor` as an element ref or `{ getBoundingClientRect(): DOMRect }`. A virtual anchor maps to `Popover.Anchor virtualRef`. Pass-through props `side`, `onOpenAutoFocus`.
- [X] T022 [P] `src/web/src/ui/Tooltip.tsx` (Radix Tooltip) with `content`, `side`. Export `TooltipProvider`, configured with `delayDuration={400}`.
- [X] T023 [P] `src/web/src/ui/Toast.tsx` (Radix Toast):
  - `ToastProvider` and a viewport at the bottom right, focusable with the `F8` hotkey;
  - a `useToast()` hook returning `notify({ tone: 'success'|'info'|'danger', title, description?, action?, duration? })`;
  - durations: success `6000`, info `8000`; `duration` is clamped to ≥ `5000` (data-model *Notification*, FR-006);
  - the queue lives in a provider at the app root.
- [X] T024 [P] `src/web/src/ui/Tabs.tsx` (Radix Tabs, pass-through `activationMode`) and `src/web/src/ui/ToggleGroup.tsx` (Radix ToggleGroup `type="single"`, `items: {value,label}[]`, never empty: ignore deselect).
- [X] T025 [P] `src/web/src/ui/Toolbar.tsx` (Radix Toolbar: `Toolbar.Root` with `aria-label`, `Toolbar.Button`, `Toolbar.Link`, `Toolbar.Separator`), `src/web/src/ui/Collapsible.tsx`, and `src/web/src/ui/Separator.tsx`.
- [X] T026 [P] `src/web/src/ui/Field.tsx`: Radix `Label` plus a native `input`/`textarea`/`select` (via `as`), with `label`, `hint`, `error`. It wires `id`, `aria-describedby` (hint and error) and `aria-invalid`. The error is shown with a `CrossCircledIcon`.
- [X] T027 [P] `src/web/src/ui/Callout.tsx`:
  - `tone: 'info'|'warning'|'danger'|'success'`, `title`, children, optional `actions` and `onDismiss` (renders a dismiss `IconButton` labelled "Dismiss");
  - `role` defaults to `status`, and to `alert` for `danger`;
  - the tone icon (`InfoCircledIcon`/`ExclamationTriangleIcon`/`CrossCircledIcon`/`CheckIcon`) is always rendered, so colour is never the only signal (FR-005).
- [X] T028 [P] Create these small components:
  - `src/web/src/ui/Badge.tsx` (`tone`);
  - `src/web/src/ui/Avatar.tsx`: initials from `name`, background from a deterministic hash over the non-accent scales;
  - `src/web/src/ui/EmptyState.tsx` (`title`, `description`, `action`);
  - `src/web/src/ui/Skeleton.tsx` and `src/web/src/ui/Spinner.tsx` (CSS only, `aria-hidden`);
  - `src/web/src/ui/Kbd.tsx`;
  - `src/web/src/ui/VisuallyHidden.tsx` (Radix).
- [X] T029 Create `src/web/src/ui/index.ts`, re-exporting T015–T028.
- [X] T030 [P] Add Vitest tests in `src/web/src/ui/ui.test.tsx`:
  - Dialog and AlertDialog return focus to the trigger on `Escape`;
  - AlertDialog focuses *Cancel* first;
  - IconButton exposes `label` as its accessible name;
  - Field links `aria-describedby` to the error and sets `aria-invalid`;
  - Callout `danger` has `role="alert"`;
  - `useToast` clamps a duration of `1000` to `5000`.

### App shell skeleton and e2e harness

- [X] T031 In `src/web/src/main.tsx`, wrap `<App />` in `TooltipProvider` and `ToastProvider` (from `ui/index.ts`). Keep `SaveNoticeProvider` until T037 replaces it.
- [X] T032 [P] Add `tests/e2e/ui-helpers.ts`:
  - `withTheme(page, 'light'|'dark')` via `page.emulateMedia({ colorScheme })`;
  - `viewports = { wide: 1280, medium: 1000, narrow: 320 }`;
  - `collectCspViolations(page)`, which registers an init script that pushes `securitypolicyviolation` events to `window.__csp` and returns a getter;
  - `expectNoReflow(page)`, asserting `document.documentElement.scrollWidth <= window.innerWidth`.
- [X] T033 [P] Add `tests/e2e/a11y.ts`:
  - `scanWcag(browser, url, { theme, width })` opens a **separate** context with `bypassCSP: true`, signs in, navigates, and injects `require.resolve('accessibility-checker-engine/ace.js')` with `page.addScriptTag({ path })`;
  - it runs the engine with the WCAG 2.1 policy and fails on any AA violation, listing rule id, element and message;
  - before writing it, confirm the policy identifier and report API in the engine's README (research R10 follow-up), and record them in a comment.
- [X] T034 Extend `tests/e2e/server.mjs` with fixtures for later stories:
  - in `handbook`: `guides/wide.md` (a 12-column table and one 300-character code line);
  - `guides/history.md`, with three commits by authors "Ada", "Grace" and "Linus" (use `-c user.name=…`);
  - `guides/huge.md`, larger than the configured render size limit (check `Copernica:Rendering` / the 001 size-limit option name in `src/Copernica/Configuration/CopernicaOptions.cs`).

  Write the new paths to `.e2e-state.json`.

**Checkpoint**: The app runs exactly as before, now with tokens, themes and nonce-enabled
CSP; `ui/` is unit-tested; the e2e harness is ready.

---

## Phase 3: User Story 1 - Always know the state of the page and of my changes (Priority: P1) 🎯 MVP

**Goal**: text-labelled state indicators (old version, out of sync, read-only), save
confirmations, merge notices naming the other authors, and sticky inline errors next to
preserved input.

**Independent Test**: V1–V6 in quickstart.md.

### Tests for User Story 1

- [X] T035 [P] [US1] Add `tests/Copernica.IntegrationTests/Editing/MergedAuthorsTests.cs` (use the existing `ConcurrencyTests` setup in `tests/Copernica.IntegrationTests/Editing/ConcurrencyTests.cs`):
  - a non-overlapping save after commits by two different authors returns `merged: true` and `mergedAuthors` with both names, distinct, in commit order;
  - a non-merged save returns `mergedAuthors: []`.
- [X] T036 [P] [US1] Add `tests/e2e/us1-state.spec.ts` covering V1–V6:
  - V3 (read-only): intercept `GET /api/spaces` with `page.route` and set `canWrite: false` for `handbook`. Local `Git` spaces are writable by every user (001 FR-009c);
  - V2: rename the `service` bare repository and wait for the "could not be synchronized" indicator;
  - V6: intercept `PUT …/pages/…` and return a `403 push-rejected` problem.

  Assert text, roles (`status`/`alert`) and that the edited text is preserved.

### Implementation for User Story 1

- [X] T037 [US1] Replace `SaveNotice`:
  - change every `useSaveNotice()` caller (`src/web/src/pages/PageEdit.tsx` and any others found by grep) to `useToast().notify(...)`;
  - remove `SaveNoticeProvider` from `src/web/src/main.tsx`;
  - delete `src/web/src/components/SaveNotice.tsx`.
- [X] T038 [US1] Server: add `IReadOnlyList<string> MergedAuthors` to `SaveOutcome.Saved` in `src/Copernica/Git/PageWriter.cs`:
  - when the plan merges, collect the distinct `Author.Name` values (in commit order, with the configured fallback for empty names, as for `TheirsAuthors`) of commits reachable from the tip but not from the edit's base commit;
  - add it to `SaveResult` in `src/Copernica/Api/PageWriteEndpoints.cs:158` and return it at line 200.
- [X] T039 [US1] Update `specs/001-git-backed-team-wiki/contracts/openapi.yaml` `SaveResult` per `contracts/api-changes.md` §2 (`required: [version, merged, mergedAuthors]`). Run `npm --prefix src/web run gen:api` to regenerate `src/web/src/api/schema.d.ts`.
- [X] T040 [P] [US1] Create `src/web/src/pages/StateIndicators.tsx`. Given `space` and `page`, it renders `Callout`s in this fixed order (data-model *State indicator*, US1-7):
  - out of sync, when `space.state ∈ {outOfSync, unavailable}`: tone warning, "This space could not be synchronized since <formatted lastSyncAt>. Content may be outdated." plus `space.message`;
  - older version, when `page.isCurrent === false`: tone warning, "You are viewing an older version." with a *Go to current version* `Button asChild` link. The author and date are added in US5 (T079);
  - read only, when `space.canWrite === false`: tone info, "Read only — you can view this space but not change it. Access follows your repository permissions."
- [X] T041 [US1] Use `StateIndicators` at the top of the page view:
  - in `src/web/src/pages/PageView.tsx`, remove the old inline "You are viewing an older version" banner;
  - in `src/web/src/pages/SpaceLayout.tsx`, remove the `banner warning` block and pass `space` down. Keep `SpaceStateBadge` in the sidebar.
- [X] T042 [US1] Rework the save outcomes in `src/web/src/pages/PageEdit.tsx` per `contracts/ui.md` S4 step 5:
  - success → `notify({tone:'success', title:'Saved', description:<short commit id>})`, then navigate to the read view;
  - merged → `notify({tone:'info', title:'Saved — merged with changes by ' + join(mergedAuthors)})`, joining as "A", "A and B" or "A, B and C";
  - rejection → a `Callout tone="danger"` with `onDismiss`, placed above the footer, showing `problem.title` and `problem.detail`. It stays until dismissed or a new save starts, and the text is untouched (FR-008).
- [X] T043 [P] [US1] Convert the session-expired handling in `src/web/src/pages/PageEdit.tsx` (find where `isUnauthenticated` is handled on save) to a `Dialog` titled "Sign in again to save":
  - a *Sign in* button opens `/signin?returnUrl=…` in a new tab;
  - the draft stays in `sessionStorage` (`src/web/src/drafts.ts`).
- [X] T044 [P] [US1] Migrate `src/web/src/components/PageDialogs.tsx`:
  - `NewPageDialog` → `Dialog` + `Field`;
  - `DeletePageDialog` → `AlertDialog tone="danger"` with `Field` for the change description and an inline danger `Callout` for errors that stays until retried;
  - remove the `useDialog`/`<dialog>` code.
- [X] T045 [P] [US1] In `src/web/src/discussions/DiscussionPanel.tsx`, show failures of create, reply, edit, delete, resolve and reopen as an inline `Callout tone="danger"` inside the affected form or thread, keeping the typed text. Remove the generic `<p className="error">` usage.

**Checkpoint**: US1 is fully functional. V1–V6 pass. This is the MVP.

---

## Phase 4: User Story 2 - Use the wiki on any screen size (Priority: P2)

**Goal**: a three-region responsive shell. Tree and discussions collapse into sheets, and
every screen is usable at 320 px.

**Independent Test**: V7–V9 in quickstart.md.

### Tests for User Story 2

- [X] T046 [P] [US2] Add `tests/e2e/us2-responsive.spec.ts` covering V7–V9 at `viewports` from `tests/e2e/ui-helpers.ts`:
  - visible regions per width;
  - the *Discussions (n)* toggle shows the open count;
  - closing each sheet returns focus to its trigger;
  - `expectNoReflow` on page view, editor, history, conflict (reuse the 001 A10 setup from `tests/e2e/us3-conflicts.spec.ts`), space list, profile and sign-in at 320 px;
  - inside `.prose`, only `table` and `pre` have `scrollWidth > clientWidth`.

### Implementation for User Story 2

- [X] T047 [US2] Create `src/web/src/layout/AppShell.tsx`, `src/web/src/layout/Header.tsx` and `src/web/src/layout/UserMenu.tsx`:
  - the header holds a `[≡]` `IconButton` "Open navigation" (shown `<768px`), the brand link to `/`, and `UserMenu` (a `Menu` with *Profile* and *Sign out*; the sign-out logic moves from `src/web/src/App.tsx`);
  - `AppShell` renders `<header>`, an optional `nav` slot, `<main id="main">` and an optional `aside` slot with the grid classes from T013;
  - `src/web/src/App.tsx` uses `AppShell`;
  - the PAT banner becomes a `Callout tone="warning"`.
- [X] T048 [P] [US2] Create `src/web/src/layout/SpaceSwitcher.tsx`: a `Menu` with `CaretSortIcon` in the header, listing `useSpaces()` (from `src/web/src/pages/SpaceList.tsx`) and linking to `/s/<id>/`. It shows the current space name.
- [X] T049 [US2] Restructure `src/web/src/pages/SpaceLayout.tsx` into AppShell regions:
  - nav: space title, `SpaceStateBadge`, *New page* `Button icon={PlusIcon}`, `PageTree`;
  - main: the view;
  - aside: `DiscussionPanel`, read view of the current version only.
  
  Below 768px render nav inside a modal left `Sheet` titled "Space navigation", opened by the header `[≡]` (lift its open state into `AppShell` context). Navigating to a page closes it.
- [X] T050 [US2] Discussions sheet in `src/web/src/pages/SpaceLayout.tsx` / `src/web/src/pages/PageView.tsx`:
  - below 1200px, render `DiscussionPanel` in a right `Sheet` titled "Discussions" (`modal={false}` at 768–1199px, modal below);
  - add a toolbar `Button` "Discussions (n)", with `n` = open, anchored discussions from the discussions query (FR-011), that toggles it;
  - use a `useMediaQuery` hook in `src/web/src/layout/useMediaQuery.ts` with the breakpoints `(min-width: 1200px)` and `(min-width: 768px)`.
- [X] T051 [P] [US2] Restyle `src/web/src/components/PageTree.tsx` (markup and keyboard logic unchanged):
  - folder rows with `ChevronRightIcon`/`ChevronDownIcon`, page rows with `FileTextIcon`;
  - `aria-current="page"` and an accent left border on the current page;
  - `--space-4` indentation per level, rows at least 32px high, long names wrapping (edge case: long titles).
  
  Put the styles in `src/web/src/components/PageTree.css`.
- [X] T052 [P] [US2] Add `src/web/src/pages/Breadcrumbs.tsx` (folder segments of the path, last segment not a link, wrapping on narrow screens). Render it above the title in `src/web/src/pages/PageView.tsx`.
- [X] T053 [US2] Editor layout in `src/web/src/pages/PageEdit.tsx`:
  - replace the side-by-side `editor-layout` with `Tabs` *Write* | *Preview* | *Split* (`activationMode="manual"`). *Split* exists only at ≥1200px;
  - persist the tab in `localStorage` key `copernica.editorTab`, values `"write" | "preview" | "split"`, default `"split"` ≥ 1200 px, else `"write"`. Treat `split` as `write` below 1200 px; unknown or corrupt values fall back to the default; wrap storage access in try/catch (data-model *Interface preference*);
  - make the footer sticky: `Field` "Change description" (required, `maxlength=500`), `Button variant="primary"` *Save*, and *Cancel*. *Cancel* opens an `AlertDialog` "Discard your changes?" (*Keep editing* / *Discard*) when the text differs from the base.
- [X] T054 [P] [US2] Migrate `src/web/src/pages/History.tsx` to `contracts/ui.md` S5:
  - a `<table>` with *From*/*To* radio columns, *Version* (link), *Author*, *Date* (relative, absolute in `Tooltip`) and *Description*;
  - the table scrolls inside a wrapper on narrow screens;
  - a *Compare selected* primary `Button`;
  - a *Load more* secondary `Button`.
  
  In `src/web/src/components/DiffView.tsx`, use the unified view (no side-by-side) below 1200px.
- [X] T055 [P] [US2] Migrate `src/web/src/pages/ConflictView.tsx` to `contracts/ui.md` S6:
  - a danger `Callout` naming `theirsAuthors`;
  - `Tabs` *Resolve* | *Their version* | *Your version*;
  - a footer with *Save resolution* (primary), *Use their version* (behind an `AlertDialog`) and *Abandon edit…* (`AlertDialog`), leading to the read-only "Your unsaved text" panel with *Copy to clipboard* (Toast on success).
- [X] T056 [P] [US2] Migrate `src/web/src/pages/SpaceList.tsx` (a card grid `repeat(auto-fill, minmax(16rem, 1fr))`, whole-card link, id in mono, `Badge` for non-ready states, `EmptyState` when there are none) and `src/web/src/pages/SignIn.tsx` (a centred card of `max-width: 24rem`, `Field`s, a primary `Button`, an inline danger `Callout`) to `contracts/ui.md` S1/S2. Use co-located `.css` files.

**Checkpoint**: US1 and US2 work independently. V7–V9 pass.

---

## Phase 5: User Story 3 - Operate everything with the keyboard (Priority: P3)

**Goal**: full keyboard operation, a skip link, route focus, shortcuts (`e`, `c`, `?`,
`Ctrl/⌘+S`, `Ctrl/⌘+Enter`, `Esc`) with a turn-off preference, help, and focusable
highlights.

**Independent Test**: V10–V13 in quickstart.md.

### Tests for User Story 3

- [X] T057 [P] [US3] Add `src/web/src/shortcuts/shortcuts.test.ts` (Vitest):
  - a single-key handler is ignored when the event target is `input`, `textarea`, `select`, `[contenteditable]` or inside `.cm-editor`, with any of `ctrl`/`meta`/`alt` held, or when `isComposing`;
  - `Shift+/` triggers `?`;
  - with the preference `"off"`, single-key handlers do not fire but modifier handlers do;
  - a corrupt stored value counts as `"on"`;
  - a `storage` event updates the preference live.
- [X] T058 [P] [US3] Add `tests/e2e/us3-keyboard.spec.ts` covering V10–V13 using only `page.keyboard`:
  - assert the skip link is the first Tab stop;
  - after every step `document.activeElement` is not `body`;
  - focus returns to the trigger after `Esc`;
  - the help lists the shortcuts of the current screen;
  - the preference persists across reload and a second page in the same context;
  - typing `e` in a textarea inserts text.

### Implementation for User Story 3

- [X] T059 [US3] Create `src/web/src/shortcuts/preference.ts`:
  - `localStorage` key `copernica.singleKeyShortcuts`, values `"on" | "off"`, default `"on"` (absent ⇒ on). Unknown or corrupt values ⇒ `"on"`; wrap access in try/catch;
  - `useSingleKeyShortcuts(): [enabled, setEnabled]`, which re-renders on change, including from other tabs via the `storage` event (data-model *Interface preference*).
- [X] T060 [US3] Create `src/web/src/shortcuts/useShortcuts.ts` (research R7):
  - a single `document` `keydown` listener and a registry where `useShortcut({ key, single: boolean, description, group: 'Global'|'Page'|'Editor'|'Discussions', handler, enabled? })` registers while mounted;
  - apply the guards from T057;
  - `useRegisteredShortcuts()` lists the active ones for the help dialog.
  
  Export from `src/web/src/shortcuts/index.ts`.
- [X] T061 [US3] Create `src/web/src/shortcuts/ShortcutHelp.tsx`:
  - a `Dialog` titled "Keyboard shortcuts" listing `useRegisteredShortcuts()` grouped by `group`, with `Kbd`;
  - a checkbox "Enable single-key shortcuts (e, c, ?)" bound to the preference; while it is off, single-key rows are shown as "off";
  - register `?` (single) in `src/web/src/layout/AppShell.tsx`, and add a *Keyboard shortcuts* item to `src/web/src/layout/UserMenu.tsx`.
- [X] T062 [P] [US3] Create `src/web/src/layout/SkipLink.tsx` ("Skip to content" → `#main`, visible on focus; first child of `AppShell`) and `src/web/src/layout/RouteAnnouncer.tsx`. On `location` change, the announcer:
  - focuses the view's `h1` (every screen's `<h1>` gets `tabIndex={-1}`);
  - sets `document.title` to `<page title> · <space> · Copernica`;
  - announces that title in a polite visually-hidden live region (FR-013).
- [X] T063 [US3] Page shortcuts in `src/web/src/pages/PageView.tsx`:
  - build the toolbar as a `Toolbar` (`aria-label="Page actions"`): *Edit* (primary, `Pencil1Icon`, tooltip `Kbd e`), *History* (`CounterClockwiseClockIcon`), the *Discussions (n)* toggle from T050, and a `⋯` `Menu` (items filled in T080; *Delete page…* opens the `DeletePageDialog`);
  - register `e` (single, group Page; only when `canWrite && page.isCurrent && !tooLarge`) to navigate to the editor.
- [X] T064 [US3] Editor shortcut in `src/web/src/pages/PageEdit.tsx`: `Ctrl/⌘+S` (modifier, group Editor) calls `preventDefault()`. With an empty description it focuses the *Change description* `Field` and sets the error "Describe your change." (US3-4); otherwise it submits.
- [X] T065 [P] [US3] Profile in `src/web/src/pages/Profile.tsx`, per `contracts/ui.md` S7:
  - sections *Account* (read-only name, email, sign-in mode), *Azure DevOps personal access token* (`Badge` status, `Field type="password"`, *Save token*, *Remove token…* `AlertDialog`) and *Keyboard shortcuts* (the same checkbox as T061, with the hint "Shortcuts with Ctrl/⌘ always work.");
  - `Separator` between sections.
- [X] T066 [US3] *(Adapted during implementation: highlights are painted with the CSS Custom Highlight API and have no DOM elements, so focusable transparent buttons are positioned over each fragment instead, in `src/web/src/discussions/HighlightMarkers.tsx`; same names, keys and behaviour as below.)* Make discussion highlights focusable in `src/web/src/discussions/useHighlights.ts`: each `<mark class="anchor-mark">` gets `tabindex="0"`, `role="button"` and `aria-label="Discussion: <first 8 words of the quote>"`. `Enter` and `Space` call the existing activate callback (FR-018). Style focus and the active state with `--color-highlight-active` in `src/web/src/discussions/discussions.css`.
- [X] T067 [US3] Focus after removal in `src/web/src/discussions/DiscussionPanel.tsx`: after deleting a comment, focus the next comment, else the previous one, else the thread's reply box. After a page delete (`src/web/src/components/PageDialogs.tsx`), navigate to the space home; `RouteAnnouncer` focuses its `h1` (FR-014).

**Checkpoint**: US1–US3 work. V10–V13 pass.

---

## Phase 6: User Story 4 - Comment on a text selection with little effort (Priority: P4)

**Goal**: a *Comment* popover next to the selection, the `c` shortcut, a composer
submitted with `Ctrl/⌘+Enter`, and a restyled discussions panel.

**Independent Test**: V14–V18 in quickstart.md.

### Tests for User Story 4

- [X] T068 [P] [US4] Add `src/web/src/discussions/SelectionPopover.test.tsx` (Vitest + jsdom):
  - visible only when `anchorFromSelection` (`src/web/src/discussions/textAnchor.ts`) returns an anchor;
  - hidden for a selection crossing the article boundary;
  - closes on `selectionchange` to an empty selection and on `Escape`;
  - does not move `document.activeElement` when opening.
- [X] T069 [P] [US4] Add `tests/e2e/us4-selection.spec.ts` covering V14–V17, plus V18 in a project using Playwright's `devices['Pixel 7']` (`hasTouch`):
  - measure the interactions from selection to posted comment (≤ 2 after selecting, SC-005);
  - assert that the popover sits below the selection on the coarse pointer.

### Implementation for User Story 4

- [X] T070 [US4] Create `src/web/src/discussions/SelectionPopover.tsx` (research R9):
  - uses `ui/Popover` with a virtual anchor built from `window.getSelection().getRangeAt(0).getBoundingClientRect()`, open while `anchorFromSelection(article, selection)` is defined;
  - `onOpenAutoFocus={e => e.preventDefault()}`;
  - `side="top"`, or `"bottom"` when `matchMedia('(pointer: coarse)')` matches;
  - closes on `selectionchange`, `Escape`, and when an `IntersectionObserver` on the range's start container reports it out of view;
  - one `Button` *Comment* (`ChatBubbleIcon`), calling `onComment(anchor)`.
- [X] T071 [US4] Wire the selection flow in `src/web/src/pages/PageView.tsx` and `src/web/src/discussions/DiscussionPanel.tsx`:
  - lift `draftAnchor` so that `SelectionPopover` (rendered by `PageView` over the article) and the panel share it;
  - activating *Comment* sets the draft and opens the discussions sheet when it is collapsed (T050);
  - register `c` (single, group Discussions) to do the same for the current selection;
  - keep the panel's *Comment on selection* button.
- [X] T072 [US4] Restyle the composer and threads in `src/web/src/discussions/DiscussionPanel.tsx` per `contracts/ui.md` → *Discussions UI*:
  - a `ToggleGroup` *Open*/*Resolved*/*All* replaces the `<select>`;
  - the `DiscussionComposer` card shows the quote in a blockquote on `--color-warning-subtle`, a `Field as="textarea"`, *Comment* (primary) and *Cancel*, with `Ctrl/⌘+Enter` (modifier) to submit;
  - threads are `Collapsible` (collapsed: first comment plus "n replies") with `Avatar`, author, relative time (absolute in `Tooltip`), and "(edited)";
  - own comments get a `⋯` `Menu` with *Edit* and *Delete…* (`AlertDialog`);
  - the reply box submits with `Ctrl/⌘+Enter`;
  - the header has *Resolve*/*Reopen*;
  - outdated threads show a warning `Badge` "Outdated", a struck-through quote and "The text this discussion referred to has changed";
  - empty states as in the contract.
  
  Put the styles in `src/web/src/discussions/discussions.css`.

**Checkpoint**: US1–US4 work. V14–V18 pass.

---

## Phase 7: User Story 5 - See who changed a page and share or download it (Priority: P5)

**Goal**: a PageInfo line for the shown version, *Copy link* with a fallback, and
*Download Markdown*.

**Independent Test**: V19–V23 in quickstart.md.

### Tests for User Story 5

- [X] T073 [P] [US5] Add `tests/Copernica.IntegrationTests/Editing/HistoryVersionTests.cs`:
  - `?version=<older commit>&limit=1` returns the change that produced that commit's state of the page;
  - `cursor` paging works relative to `version`;
  - a malformed id → `400`;
  - a commit not reachable from the space branch → `404`;
  - an unknown page → `404`;
  - no read access → `404`, indistinguishable from the other `404`s (use `FakeHostingProvider`).
- [X] T074 [P] [US5] Add `src/web/src/pages/PageInfo.test.tsx` and `src/web/src/pages/PageActions.test.tsx` (Vitest):
  - PageInfo renders author, relative time and description, with `<time dateTime>`, and renders nothing on query error;
  - *Copy link* calls `navigator.clipboard.writeText` with the canonical URL (the version URL for an old version) and notifies;
  - when `writeText` is undefined or rejects, `CopyLinkDialog` opens with the URL pre-selected.
- [X] T075 [P] [US5] Add `tests/e2e/us5-page-info.spec.ts` covering V19–V21 and V23:
  - compare with `git log -1 --format=%an%n%s -- <file>` on the bare remote (helpers `git()`);
  - V20: delay `**/history/**` with `page.route` and assert that the article is visible before the PageInfo line;
  - grant `clipboard-read`/`clipboard-write` permissions for V21;
  - for V23, use `page.waitForEvent('download')` and check `suggestedFilename()` and the content for a normal page, an old version and `guides/huge.md`;
  - V22 stays manual; simulate it instead by overriding `navigator.clipboard` to undefined via `addInitScript`.

### Implementation for User Story 5

- [X] T076 [US5] Server: add the `version` parameter to `HistoryService.GetHistory` in `src/Copernica/Git/HistoryService.cs`:
  - when it is non-null, use it instead of `head` for `IncludeReachableFrom`, after verifying it matches `^[0-9a-f]{40}$`, exists, and is reachable from `head` (`repo.ObjectDatabase.FindMergeBase` or `repo.Commits.QueryBy(new CommitFilter{IncludeReachableFrom=head})` containment);
  - return a result type that lets the endpoint map "malformed" → 400 and "unknown/unreachable" → 404.
  
  In `src/Copernica/Api/PageWriteEndpoints.cs` `HistoryAsync` (line 97), add the `string? version` query parameter and pass it through. The existing read check stays first.
- [X] T077 [US5] Update `specs/001-git-backed-team-wiki/contracts/openapi.yaml` `/spaces/{spaceId}/history/{path}` with the `version` parameter per `contracts/api-changes.md` §1. Run `npm --prefix src/web run gen:api`.
- [X] T078 [P] [US5] Create `src/web/src/pages/PageInfo.tsx`:
  - `useQuery({ queryKey: ['pageInfo', spaceId, path, commitId], queryFn: GET history?version=<commitId>&limit=1, enabled: pageLoaded, staleTime: Infinity })`;
  - renders "Last changed by <authorName> <relative time> — <message>" in `--text-sm` muted, with `<time dateTime={authoredAt} tabIndex={0}>` wrapped in a `Tooltip` showing the absolute date (keyboard focus opens it, FR-021);
  - shows a one-line `Skeleton` while loading and nothing on error (FR-024);
  - put the relative-time formatting in `src/web/src/format.ts` (`Intl.RelativeTimeFormat`, English) and reuse it in History and Discussions.
- [X] T079 [US5] Render `PageInfo` under the title in `src/web/src/pages/PageView.tsx`, also for too-large pages and old versions (US5-2). Extend the older-version indicator in `src/web/src/pages/StateIndicators.tsx` to "You are viewing an older version from <date> by <author>.", using the same `pageInfo` query (the shown commit).
- [X] T080 [US5] Create `src/web/src/pages/PageActions.tsx` and use it as the `⋯` `Menu` content from T063:
  - *Copy link* (`Link2Icon`): the canonical URL is `location.origin + spaceRoute(spaceId, path)` for the current page and `/s/<space>/-/version/<commit>/<path>` for an old version. `navigator.clipboard.writeText` → `notify({tone:'success', title:'Link copied'})`; if the clipboard is unavailable or rejects, open `CopyLinkDialog`;
  - *Download Markdown* (`DownloadIcon`): a `Menu.Item asChild` `<a href={fileApi(spaceId, path, commitId)} download>` (`src/web/src/routes.ts`);
  - `Menu.Separator`;
  - *Delete page…* (danger, write and current only).
  
  `CopyLinkDialog` (`src/web/src/pages/CopyLinkDialog.tsx`) is a `Dialog` "Copy link" with a read-only `Field` that is selected on open and the hint "Press Ctrl+C (⌘C) to copy". In the too-large `EmptyState`, keep a direct *Download the Markdown file* `Button asChild`.

**Checkpoint**: US1–US5 work. V19–V23 pass (V22 manual).

---

## Phase 8: User Story 6 - Dark theme that follows the operating system (Priority: P6)

**Goal**: every surface is themed (editor, diff, prose, highlights), switches live within
1 s, and reaches AA in both themes.

**Independent Test**: V24, plus V25 in dark.

### Tests for User Story 6

- [X] T081 [P] [US6] Add `tests/e2e/us6-theme.spec.ts` (V24):
  - open the editor with unsaved text, then switch `emulateMedia({ colorScheme })` light → dark → light;
  - within 1 s `html` has or lacks `.dark`, the editor text and focus are unchanged, and no navigation happened;
  - sample the computed `background-color` of `body`, `.cm-editor`, `.prose pre` and a `mark.anchor-mark` in both themes and assert they differ between themes.

### Implementation for User Story 6

- [X] T082 [US6] Create `src/web/src/components/codemirrorTheme.ts`: an `EditorView.theme({...})` whose colours all reference CSS variables (`var(--color-bg)`, `var(--color-text)`, `var(--color-bg-subtle)`, `var(--color-accent-subtle)` for the selection, `var(--color-focus)` for the cursor, `var(--color-danger-subtle)`/`var(--color-success-subtle)` for merge-view deletions and insertions), plus a `HighlightStyle` for Markdown tokens using `--color-accent-text` and `--color-text-muted`. CSS variables re-resolve on theme change without reconfiguring. Add the theme to the extensions in `src/web/src/components/MarkdownEditor.tsx` and `src/web/src/components/DiffView.tsx`.
- [X] T083 [P] [US6] Check every remaining surface in dark mode and fix any colour that is not tokenized:
  - `src/web/src/discussions/discussions.css` (`--color-highlight`, `--color-highlight-active` with an `amber-9` underline);
  - `src/web/src/styles/prose.css` (code, tables, blockquote);
  - SVG images in pages, which keep their own colours on a `--color-bg` card.
  
  Run `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(" src/web/src --include=*.css`. The only allowed hits are in `styles/tokens.css` and shadow tokens.

**Checkpoint**: All six stories work independently.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: remove the legacy UI, run the cross-cutting checks (V25–V29), and update the
docs.

- [X] T084 [P] Add `tests/e2e/a11y.spec.ts` (V25): for S1–S7, an open `Dialog`, the shortcut help, the discussions sheet and the nav sheet, run `scanWcag` (T033) in `light` and `dark` at widths 1280 and 320. 0 WCAG 2.1 AA violations.
- [X] T085 [P] Add `tests/e2e/csp.spec.ts` (V26):
  - in a normal context (no `bypassCSP`), using `collectCspViolations`, visit every screen and open New page, Delete page, a comment `⋯` menu, the user menu, a tooltip, both sheets and a Toast;
  - assert `window.__csp` is empty;
  - assert that the `document` response CSP contains `'nonce-` equal to `<meta name="csp-nonce">`;
  - assert that `body` has `data-scroll-locked` while a modal is open (the scroll lock works).
- [X] T086 [P] Add `tests/e2e/reduced-motion.spec.ts` (V27): with `emulateMedia({ reducedMotion: 'reduce' })`, open a Dialog, a Sheet and a Toast, and assert that `getComputedStyle(el).animationDuration` and `transitionDuration` are `0s`.
- [X] T087 Run 001's e2e suites `tests/e2e/us1-reading.spec.ts`, `us2-editing.spec.ts`, `us3-conflicts.spec.ts` and `us4-discussions.spec.ts` (V29). Update only the selectors that changed because of the migration (prefer `getByRole`/`getByLabel`). Behavioural assertions must not change.
- [X] T088 Bundle check:
  - compare the gzip size of `src/web/dist/assets/*.js` before (`git stash` / the 001 build) and after;
  - if the increase exceeds ~60 KB gzip (plan *Performance Goals*), find the cause with `npx vite-bundle-visualizer` or the Rollup output and fix it (e.g. a non-tree-shaken `radix-ui` import);
  - record the numbers in the PR description.
- [X] T089 [P] V28: build, run `pwsh scripts/check-licenses.ps1`, and run `grep -rhoE "https?://[^\"' )]+" src/web/dist | sort -u`. Only `http://www.w3.org/...` namespaces are allowed. Fix any other hit.
- [X] T090 Remove the legacy styles:
  - delete `src/web/src/styles.css` and its import in `src/web/src/main.tsx`;
  - delete the now-unused class names (`banner`, `link-button`, `button primary`, `status`, `toast`, `dialog-actions`, `editor-layout`, …) from the components;
  - check with `grep -rn "className=\"\(banner\|link-button\|status\)" src/web/src`.
- [X] T091 [P] Mark 001 task T103 as resolved by this feature in `specs/001-git-backed-team-wiki/tasks.md` (change `- [ ]` to `- [X]` and append "— resolved by 002 research R10 (IBM Equal Access engine, Apache-2.0)"). Add a "User interface" section to `README.md` covering themes, keyboard shortcuts and the single-key toggle.
- [ ] T092 Run the full validation in `specs/002-accessible-wiki-ui/quickstart.md`:
  - `dotnet test`, `npm --prefix src/web test`, `npx --prefix tests/e2e playwright test` and the license check;
  - the manual checks V4 (screen reader), V18 (real touch device) and V22 (plain-HTTP host);
  - record the results in the PR, including the CSP change callout required by the constitution's Quality Gates.

---

### Review follow-ups (added during implementation, 2026-10-17)

- [X] T093 [P] Widen the reading width in `src/web/src/styles/tokens.css` (`--prose-width: 60rem`). The editor preview fills its box (`.prose.preview-pane { max-width: none }` in `src/web/src/pages/PageEdit.css`).
- [X] T094 [P] Single scrollbar in the editor: the Split/Preview pane in `src/web/src/pages/PageEdit.css` and the diff view in `src/web/src/components/MarkdownEditor.css` grow with their content instead of scrolling on their own. e2e check in `tests/e2e/us2-responsive.spec.ts`.
- [X] T095 [US4] Margin layout for discussions on wide screens (`src/web/src/discussions/MarginLayout.tsx`, `DiscussionPanel.tsx` `layout="margin"`, non-scrolling aside in `src/web/src/styles/layout.css`): threads are placed at the height of their fragments. e2e check "V15 (margin)" in `tests/e2e/us4-selection.spec.ts`.
- [X] T096 [P] Contrast of text on solid fills in `src/web/src/styles/tokens.css`. The danger button uses `red-11`/`red-12` in light mode; dark mode hovers use `indigo-8`, and the danger button uses dark text on `red-9`/`red-10`. Before, white on `red-9` was 3.9:1 and the dark primary hover 4.28:1. The WCAG scan now includes the Delete page dialog with the button hovered.
- [X] T097 [P] Pass the CSP style nonce to CodeMirror (`EditorView.cspNonce` in `src/web/src/components/codemirrorTheme.ts`). Before, the editor's injected stylesheet was blocked by the strict CSP, already in 001. Regression check in `tests/e2e/csp.spec.ts`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup and blocks all stories.
  - T005 → T006 → T007.
  - T009–T014 can run in parallel with the server tasks.
  - T015–T028 → T029 → T030/T031.
- **User stories (Phases 3–8)**: each depends only on Phase 2, except for the cross-story
  touch points below.
- **Polish (Phase 9)**: after the stories you intend to ship. T090 runs after every
  screen has been migrated (T044, T047–T056, T063, T065, T072).

### User Story Dependencies

- **US1 (P1)**: Phase 2 only.
- **US2 (P2)**: Phase 2 only. T050's toggle count works without US1.
- **US3 (P3)**: Phase 2 only.
  - T063 builds the page `Toolbar`; if US2 is not done, the *Discussions (n)* toggle is
    simply omitted.
  - T061 hooks into `AppShell` from T047. If US2 is not done, register `?` in
    `src/web/src/App.tsx` instead.
- **US4 (P4)**: Phase 2 only. The `c` shortcut (part of T071) needs T060 from US3; without
  US3, the popover and panel button still work.
- **US5 (P5)**: Phase 2 only. T080 fills the `⋯` menu created in T063; without US3, T080
  creates the `Menu` itself in `PageView.tsx`. T079 extends T040 (US1); without US1, it
  renders PageInfo only.
- **US6 (P6)**: Phase 2 only, since the theme bootstrap and tokens are foundational.

### Within Each User Story

- Tests first, failing before implementation.
- Server → OpenAPI/regenerated types → UI.
- Components before the screens that use them.

### Parallel Opportunities

- Phase 1: T002, T003 and T004 run in parallel after T001.
- Phase 2: T007/T008 and T010–T013 run in parallel. All 14 wrapper tasks (T015–T028) are
  separate files and run in parallel.
- After Phase 2, US1–US6 can be staffed in parallel. Shared files to coordinate:
  - `PageView.tsx`: US1 T041, US2 T052, US3 T063, US4 T071, US5 T079;
  - `PageEdit.tsx`: US1 T042/T043, US2 T053, US3 T064;
  - `DiscussionPanel.tsx`: US1 T045, US3 T067, US4 T071/T072.

---

## Parallel Example: Phase 2 wrappers

```bash
# 14 independent files, one agent or developer each:
Task: "T015 Button in src/web/src/ui/Button.tsx"
Task: "T017 Dialog in src/web/src/ui/Dialog.tsx"
Task: "T020 Menu in src/web/src/ui/Menu.tsx"
Task: "T023 Toast in src/web/src/ui/Toast.tsx"
Task: "T027 Callout in src/web/src/ui/Callout.tsx"
# … T016, T018, T019, T021, T022, T024, T025, T026, T028
```

## Parallel Example: User Story 1

```bash
Task: "T035 MergedAuthorsTests in tests/Copernica.IntegrationTests/Editing/MergedAuthorsTests.cs"
Task: "T036 e2e V1–V6 in tests/e2e/us1-state.spec.ts"
Task: "T040 StateIndicators in src/web/src/pages/StateIndicators.tsx"
Task: "T044 Dialog migration in src/web/src/components/PageDialogs.tsx"
Task: "T045 inline errors in src/web/src/discussions/DiscussionPanel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (nonce, tokens, dark theme bootstrap, `ui/`,
   harness).
2. Phase 3 US1: indicators, toasts, merge authors, inline errors.
3. **Stop and validate**: V1–V6, plus 001 A1–A15 (T087 subset). Ship: users see
   page/space state and save outcomes clearly, in both themes.

### Incremental Delivery

1. Foundation + US1 → ship (MVP).
2. US2 (responsive) → ship.
3. US3 (keyboard) → ship.
4. US4 (selection commenting) → ship.
5. US5 (page info and actions) → ship.
6. US6 (theme completeness) → ship.
7. Polish (V25–V29, legacy removal) → final.

Each step keeps routes and data unchanged, so it can be released on its own.

### Parallel Team Strategy

After Phase 2, the work can be split as follows:

- **A**: US1 → US3 (state, then keyboard; they share `PageEdit.tsx`).
- **B**: US2 (shell, screens).
- **C**: US5 server work (T073, T076, T077), then US4.
- **D**: US6, then the Polish e2e suites (T084–T086).

---

## Notes

- `[P]` means different files with no dependency on an incomplete task.
- Commit after each task or logical group, and keep the app working after every commit
  (plan *Delivery increments*).
- Any change to CSP, auth, dependencies or storage must be called out in the PR (the
  constitution's Quality Gates). In this feature that means T005–T008 (CSP) and T001
  (dependencies).
