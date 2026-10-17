# UI Contract: Consistent, Accessible Wiki Interface

The user-facing interface of the wiki: screens, regions, components, design tokens and
interaction rules. The data each screen loads is defined by
[001 openapi.yaml](../../001-git-backed-team-wiki/contracts/openapi.yaml) plus the two
additive changes in [api-changes.md](api-changes.md). Decisions and rationale are in
[research.md](../research.md) R1–R10; requirement IDs (FR-xxx, US-x) refer to
[spec.md](../spec.md).

Conformance target: WCAG 2.1 AA in light and dark themes, from 320 CSS px wide, in the
browsers listed in the constitution.

---

## Design principles

1. **Content first.** The rendered page is the widest region and uses a calm, readable
   `.prose` style. Tool chrome is quiet: neutral colours, with the accent used only for
   the primary action and for focus.
2. **One primary action per view.** Read view: *Edit*. Editor: *Save*. Conflict:
   *Save resolution*. Everything else is secondary, ghost, or inside a menu.
3. **Never lose text.** Destructive or abandoning actions confirm with an AlertDialog.
   Errors are shown next to the user's preserved input (FR-008; 001 FR-013, 001 US3-4).
4. **State is visible.** Space sync state, old-version view, outdated discussions,
   read-only access and save outcomes always have a visible, text-labelled indicator.
   Colour is never the only signal.
5. **Keyboard complete.** Every action is reachable and operable by keyboard with a
   visible focus ring, and every overlay returns focus to its trigger.

---

## Design tokens

Defined in `src/web/src/styles/tokens.css`. Components use only the **semantic** tokens.
Raw Radix Colors scale steps (`--slate-1` … `--slate-12` etc.) appear only in
`tokens.css`.

### Colour (semantic → Radix Colors step)

| Token | Light / dark source | Use |
|-------|---------------------|-----|
| `--color-bg` | `slate-1` | App background |
| `--color-bg-subtle` | `slate-2` | Sidebar, header, panels |
| `--color-bg-element` | `slate-3` | Inputs, secondary buttons |
| `--color-bg-hover` | `slate-4` | Hovered item / button |
| `--color-bg-active` | `slate-5` | Pressed / selected tree item |
| `--color-border-subtle` | `slate-6` | Separators, card borders |
| `--color-border` | `slate-7` | Input and button borders |
| `--color-border-strong` | `slate-8` | Hovered input border |
| `--color-text` | `slate-12` | Body text |
| `--color-text-muted` | `slate-11` | Secondary text, metadata |
| `--color-accent-solid` | `indigo-9` | Primary button background, current-page marker |
| `--color-accent-solid-hover` | `indigo-10` | Primary button hover |
| `--color-accent-on-solid` | white | Text on accent solid |
| `--color-accent-text` | `indigo-11` | Links |
| `--color-accent-subtle` | `indigo-3` | Selected tree item, active tab underline background |
| `--color-focus` | `indigo-8` | Focus ring |
| `--color-danger-solid` / `-text` / `-subtle` | `red-9` / `red-11` / `red-3` | Delete, errors |
| `--color-warning-text` / `-subtle` / `-border` | `amber-11` / `amber-3` / `amber-7` | Out-of-sync, old version, outdated |
| `--color-success-text` / `-subtle` | `green-11` / `green-3` | Saved, merged |
| `--color-highlight` | `amber-4` | Discussion fragment mark |
| `--color-highlight-active` | `amber-6` (+ `amber-9` underline) | Active / hovered fragment |
| `--color-overlay` | black at 40 % (light) / 60 % (dark) | Modal backdrop (the slate alpha scale is light in dark mode, so it is not used here) |

The dark theme swaps scale files (`slate-dark.css` etc.) under `html.dark`. Semantic
tokens stay unchanged.

### Typography

| Token | Value |
|-------|-------|
| `--font-sans` | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--font-mono` | `ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace` |
| `--text-xs` / `-sm` / `-md` / `-lg` / `-xl` / `-2xl` | `0.75` / `0.875` / `1` / `1.125` / `1.375` / `1.75 rem` |
| `--leading-tight` / `-normal` / `-prose` | `1.25` / `1.5` / `1.65` |
| `--weight-regular` / `-medium` / `-bold` | `400` / `500` / `650` |
| `--prose-width` | `60rem` (widened from `72ch` after review: too narrow next to the full-width toolbar; the editor preview is not capped) |

Rendered Markdown (`.prose`) has the following styles:

- **Headings** use `--text-2xl` down to `--text-md`, with anchor offsets for the sticky
  header.
- **Code blocks** use `--color-bg-subtle` with a `--color-border-subtle` border and
  horizontal scroll.
- **Tables** are zebra-striped with `--color-bg-subtle` and scroll horizontally inside a
  wrapper.
- **Task-list checkboxes** are shown disabled.
- **Broken wiki links** use `--color-danger-text` with a dashed underline and a
  "(missing)" visually hidden suffix.

### Space, radius, elevation, motion

| Token | Value |
|-------|-------|
| `--space-1` … `--space-8` | `0.25 · 0.5 · 0.75 · 1 · 1.5 · 2 · 3 · 4 rem` |
| `--radius-sm` / `-md` / `-lg` / `-full` | `4px` / `6px` / `10px` / `9999px` |
| `--shadow-popover` | `0 8px 24px -4px rgb(0 0 0 / .16), 0 0 0 1px var(--color-border-subtle)` |
| `--shadow-dialog` | `0 16px 48px -8px rgb(0 0 0 / .28)` |
| `--focus-ring` | `0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-focus)` |
| `--duration-fast` / `-normal` | `120ms` / `200ms` |
| `--header-height` | `3.25rem` |
| `--sidebar-width` | `18rem` |
| `--aside-width` | `22rem` |

Motion is limited to opacity/transform fades and slides on overlays (`data-state="open|closed"`).
Under `prefers-reduced-motion: reduce`, durations are `0ms`.

---

## App shell and regions

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ [≡] Copernica  ▸ Handbook ▾                          (?)   [AL ▾]          │  <header> banner, sticky
├───────────────┬──────────────────────────────────────────┬─────────────────┤
│ HANDBOOK      │ guides / onboarding.md                   │ Discussions  ✕  │
│ [+ New page]  │ ┌──────────────────────────────────────┐ │ [Open|Resolved| │
│               │ │ ⚠ Out of sync since 10:42 — showing  │ │  All]           │
│ ▾ guides      │ │   last known content                 │ │ ┌─────────────┐ │
│   • onboarding│ └──────────────────────────────────────┘ │ │ "quoted…"   │ │
│   • setup     │ Onboarding            [History] [Edit] ⋯ │ │ AL · 2h     │ │
│ ▸ services    │ ──────────────────────────────────────── │ │ text…       │ │
│ • index       │ Lorem ipsum ▒▒▒highlighted▒▒▒ dolor …    │ │ 2 replies   │ │
│               │                                          │ └─────────────┘ │
│  <nav>        │  <main>                                  │  <aside>        │
└───────────────┴──────────────────────────────────────────┴─────────────────┘
```

| Region | Element / landmark | Contents |
|--------|--------------------|----------|
| Header | `<header>` (banner) | Sidebar toggle (`< 1200px` only), brand link → `/`, **SpaceSwitcher**, **UserMenu** |
| Navigation | `<nav aria-label="Space navigation">` | Space title, space state badge, *New page* (write only), **PageTree** |
| Content | `<main id="main">` | Banners, breadcrumbs, page title + **PageToolbar**, view body |
| Discussions | `<aside aria-label="Discussions">` | **DiscussionPanel** (read view of the current version only) |

- **Skip link**: the first focusable element is "Skip to content" → `#main`, visible on
  focus.
- **Responsive** (R5):
  - `≥ 1200px`: three columns.
  - `768–1199px`: the aside becomes a right **Sheet**, non-modal, toggled by a
    *Discussions (n)* button in the PageToolbar.
  - `< 768px`: the nav becomes a left modal **Sheet** opened by the header's `[≡]`
    button. The aside sheet becomes modal and full width.
- **Document title**: `<page title> · <space> · Copernica`. Route changes move focus to
  the view's `<h1>`, and a polite live region announces the new title.

---

## Screens

Routes are unchanged from the current implementation (`/`, `/signin`, `/profile`,
`/s/:space/<path>`, `/s/:space/-/{edit|new|history|version}/…`).

### S1 Sign in (`/signin`)

A centred card (`max-width: 24rem`) on `--color-bg-subtle` containing the product name,
a one-line purpose, and:

- **Entra ID / OIDC**: one primary button, *Sign in with your organization account*.
- **Local**: a form with a Label + input pair for user name and password, and a primary
  *Sign in* button.

Errors appear in an inline `role="alert"` Callout above the button. The returned URL is
preserved.

### S2 Space list (`/`)

`<h1>Spaces</h1>` above a responsive card grid (`repeat(auto-fill, minmax(16rem, 1fr))`).
Each **SpaceCard** is a single link target (the whole card is clickable, with the link on
the title) and shows:

- the display name;
- the identifier in mono `--text-xs` (it disambiguates duplicate names);
- a **Badge** when the state is not `ready`;
- the state message, if any.

Cards for unavailable spaces are not links. Their message is shown and explained by a
Tooltip. The empty state reads "No spaces are available to you." with a muted
explanation that access mirrors repository permissions.

### S3 Page view (`/s/:space/<path>`, `/s/:space/-/version/<id>/<path>`)

From top to bottom:

1. State indicators (Callout `role="status"`, FR-004/FR-005). All that apply are
   stacked in this order (US1-7):
   - space out of sync (warning): "This space could not be synchronized since
     `<lastSyncAt>`. Content may be outdated.";
   - viewing an older version (warning): "You are viewing an older version from
     `<date>` by `<author>`.", with *Go to current version*;
   - read-only (info, shown whenever `canWrite` is false): "Read only — you can view
     this space but not change it. Access follows your repository permissions."
2. **Breadcrumbs**: folder segments of the path, last segment not a link.
3. Title row: `<h1>` page title, then the **PageToolbar** (Radix Toolbar, right-aligned):
   - *Edit* (primary, write + current only);
   - *History* (secondary);
   - *Discussions (n)* toggle (`< 1200px`);
   - `⋯` **DropdownMenu**: *Copy link*, *Download Markdown*, separator, *Delete page…*
     (danger, write only).
4. **PageInfo** line (muted `--text-sm`, FR-021): "Last changed by `<author>`
   `<relative time>` — `<description>`". It describes the *shown* version (US5-2).
   - The time is a `<time datetime>` element with a Tooltip giving the absolute date. It
     is focusable, so the Tooltip also opens on keyboard focus.
   - Source: `history?version=<shown commit>&limit=1` ([api-changes.md](api-changes.md)),
     fetched after the article renders. While loading, a one-line Skeleton keeps the
     layout stable. On failure the line is omitted silently (FR-024).
5. The `<article class="prose">` holding server-rendered HTML.

Page actions (FR-022, FR-023):

- *Copy link* copies the canonical URL of what is shown: the page, or
  `/-/version/<commit>/…` for an older version. On success a Toast "Link copied" appears.
  If the clipboard is unavailable (non-secure context or permission denied), a
  **CopyLinkDialog** shows the URL in a read-only, pre-selected field with the hint
  "Press Ctrl+C (⌘C) to copy" and a *Close* button.
- *Download Markdown* is a link to `files/<path>?version=<shown commit>`, which the server
  sends as an attachment named after the page file. It is available for every page,
  including too-large ones.

Other states:

- **Not found**: an EmptyState with *Create this page* (write only).
- **Too large**: an EmptyState with *Download the Markdown file*. The PageInfo line is
  still shown.
- **Selection** (US4, FR-019/FR-020): when the reader selects text entirely inside the
  article, a **SelectionPopover** shows one button, *Comment*. It is a Radix Popover
  anchored to the selection rectangle through `Popover.Anchor virtualRef`.
  - It does not take focus.
  - It is placed above the selection, or below it on coarse pointers so it stays clear of
    the OS selection menu.
  - It closes on selection change or clear, when the selection leaves the viewport, and on
    `Esc`.
  - Keyboard users press `c` (single-key shortcut) to open the composer for the current
    selection. This works whether or not the popover is visible.
  - Activating it opens the DiscussionComposer with the quote, in the aside or in the
    sheet on narrower screens.

### S4 Editor (`/s/:space/-/edit/<path>`, `/-/new/<path>`)

Full content width. The aside is hidden.

1. `<h1>`: *Editing "Title"* or *New page*, with the path in mono below it.
2. A draft-restored Callout (info) with *Discard draft*, when applicable.
3. **Tabs** (Radix Tabs): *Write* | *Preview* | *Split*. *Split* is the default at
   `≥ 1200px` and hidden below it. In Split mode CodeMirror and the preview sit side by
   side with independent scroll. Tabs are activated manually (`activationMode="manual"`)
   so arrow keys do not trigger preview requests.
4. A sticky **EditorFooter** (bottom of the viewport), left to right:
   - *Change description* (required, Label visible, `maxlength=500`);
   - *Save* (primary, `Ctrl/⌘+S`);
   - *Cancel*. With unsaved changes it opens an AlertDialog: "Discard your changes?"
     with *Keep editing* and *Discard*.
5. **Save outcomes**:
   - success: navigate to the read view and show a **Toast**, "Saved", with the commit
     short id, for 6 s (FR-006);
   - merged: Toast, "Saved — merged with changes by `<A>`" or "… by `<A>` and `<B>`",
     taken from `SaveResult.mergedAuthors`, for 8 s (FR-007);
   - rejected: an inline danger Callout `role="alert"` above the footer with the server
     reason. The text is kept, and the Callout stays until it is dismissed or the user
     retries (FR-008, 001 FR-013);
   - empty description on save: focus moves to *Change description*, which shows a field
     error "Describe your change." (US3-4);
   - session expired: a Dialog, "Sign in again to save". It opens sign-in in a new tab,
     and the draft is kept (edge case).

### S5 History (`/s/:space/-/history/<path>`)

`<h1>History</h1>` with the path in mono below it. A table (`<table>`, not a grid) has
these columns:

- *Compare*: two radio columns, `From` and `To`, like a classic wiki. This makes "select
  two" keyboard-friendly without custom widgets;
- *Version*: short id, linking to the version view;
- *Author*;
- *Date*: relative, with the absolute date in a Tooltip;
- *Description*.

Below the table:

- *Load more* (secondary);
- a *Compare selected* primary button, which reveals the **DiffView** (CodeMirror merge,
  read-only, unified on `< 1200px`) under an `<h2>Differences</h2>`.

### S6 Conflict (inside S4 when the save returns `409`)

The editor content area is replaced:

1. A danger-tinted Callout titled "This page was changed while you were editing", naming
   the other author and time.
2. **Tabs**: *Resolve* (default) | *Their version* | *Your version*. The *Resolve* tab
   shows a CodeMirror merge view of current ⇄ yours, with an editable resolution.
3. A footer:
   - *Save resolution* (primary);
   - *Use their version* (secondary; replaces the resolution and requires confirmation);
   - *Abandon edit…*, which opens an AlertDialog. Confirming leads to the
     read-only "Your unsaved text" panel with a *Copy to clipboard* button (001 US3-4).

### S7 Profile (`/profile`)

`<h1>Profile</h1>`, then sections separated by Separator:

- **Account**: name and email, read-only. The sign-in mode is not exposed by `/api/me`, so it is not shown.
- **Azure DevOps personal access token** (only when required). It shows:
  - the registration status as a Badge;
  - the expiry, if known;
  - a password-type field plus *Save token*;
  - *Remove token…* (AlertDialog).

  Help text explains the minimum scopes.
- **Keyboard shortcuts** (FR-017): a checkbox, "Enable single-key shortcuts (e, c, ?)",
  with the hint "Shortcuts with Ctrl/⌘ always work." It is stored in this browser only
  ([data-model.md](../data-model.md)), and changing it takes effect immediately.

### Shortcut help (`?`, FR-015)

A Dialog titled *Keyboard shortcuts* lists the shortcuts available on the current screen,
grouped as *Global*, *Page*, *Editor* and *Discussions*, each with a `Kbd` rendering. It
contains the same single-key shortcuts checkbox as Profile. When single-key shortcuts are
off, the help is still reachable from the user menu (*Keyboard shortcuts*), and the
single-key rows are shown as "off".

### Global overlays

| Overlay | Primitive | Trigger |
|---------|-----------|---------|
| New page | Dialog | *New page* in nav |
| Delete page | AlertDialog | Page `⋯` menu |
| Discard changes / abandon edit / remove token / delete comment | AlertDialog | Respective actions |
| Space switcher | DropdownMenu (`modal={false}`) | Header |
| User menu | DropdownMenu (`modal={false}`) | Header avatar button |
| Save / merge / copy results | Toast (viewport bottom-right, `F8` hotkey) | After actions |
| Copy link fallback | Dialog | *Copy link* when the clipboard is unavailable |
| Keyboard shortcuts | Dialog | `?`, or the user menu |
| Nav sheet (`< 768px`) | Dialog styled as Sheet (left) | Header `[≡]` |
| Discussions sheet (`< 1200px`) | Dialog styled as Sheet (right), `modal={false}` at `≥ 768px` | Toolbar toggle |

---

## Discussions UI (001 US4; 002 US4)

- **Wide screens (≥ 1200 px): margin layout** *(changed after review)*. The discussions
  column has no scrollbar of its own and scrolls with the page.
  - Each anchored thread, and the draft composer, is placed at the height of its fragment.
  - Overlapping threads are pushed down. The active thread is aligned with its fragment
    and the threads above it move up.
  - Threads without a fragment ("Outdated") are listed below, under "Not attached to the
    text".
  - The column header is kept short so that threads can line up with the first paragraphs.
  - Implementation: `discussions/MarginLayout.tsx`.
- **Narrower screens:** the same panel as a plain list inside the discussions sheet.

- **Panel header**: the title *Discussions*, a count, and a **ToggleGroup** (single,
  required) with *Open* | *Resolved* | *All*. It replaces the native `<select>`, and the
  arrow keys move between items.
- **New discussion**: started from the SelectionPopover or from a *Comment on selection*
  button in the panel. A **DiscussionComposer** card opens at the top of the panel with:
  - the quoted fragment, in a blockquote with the warning-subtle background;
  - a textarea;
  - *Comment* (primary, `Ctrl/⌘+Enter`) and *Cancel*.
- **Thread card** (Collapsible; collapsed shows the first comment plus "n replies"):
  - the quote, in a blockquote. Outdated threads add an "Outdated" warning Badge and show
    the original quote struck through, with the hint "The text this discussion referred
    to has changed";
  - comments in chronological order. Each shows an Avatar (initials, with a deterministic
    colour taken from the accent-free palette), the author, a relative time (absolute in
    a Tooltip) and an "(edited)" muted marker. Own comments have a `⋯` DropdownMenu with
    *Edit* and *Delete…* (AlertDialog);
  - a reply box (textarea + *Reply*);
  - a header action: *Resolve* (open) or *Reopen* (resolved).
- **Highlights**:
  - open, anchored fragments are painted with the CSS Custom Highlight API (001), in
    `--color-highlight`; the sanitized page DOM is not modified;
  - the active fragment uses `--color-highlight-active` and an underline;
  - *keyboard access (as implemented):* because painted highlights have no elements, a
    transparent **marker button** is positioned over the first line of each fragment, in
    document order (`HighlightMarkers`). It has `aria-label="Discussion: <first words>"`
    and shows the focus ring when focused. It ignores the pointer, since mouse clicks on
    the text keep working through 001's click handling. `Enter` or `Space` activates the
    thread and opens the discussions panel or sheet;
  - *Show in page* on a thread scrolls its fragment into view and gives it the active
    style.
- **Empty states**:
  - *Open*: "No open discussions. Select text in the page to start one.";
  - *Resolved*: "No resolved discussions.".

---

## Component inventory

Wrappers live in `src/web/src/ui/` (one `.tsx` + one `.css` each). Screens import from
`src/web/src/ui/index.ts` only.

| Wrapper | Built on | Variants / props | Notes |
|---------|----------|------------------|-------|
| `Button` | `<button>` / Radix `Slot` (`asChild` for links) | `variant`: `primary` · `secondary` · `ghost` · `danger`; `size`: `sm` · `md`; `icon` | Min target 32×32 (`sm`) / 36×36 (`md`) |
| `IconButton` | `Button` + `Tooltip` | requires `label` (→ `aria-label` + tooltip) | |
| `Dialog` | Radix Dialog | `title` (required), `description`, `size` | Title → `Dialog.Title`; content max 32rem |
| `AlertDialog` | Radix AlertDialog | `title`, `description`, `confirmLabel`, `tone="danger"` | Focus starts on *Cancel* |
| `Sheet` | Radix Dialog | `side`: `left` · `right`; `modal` | Slide-in panel |
| `Menu` | Radix DropdownMenu | `Menu.Item` (`tone`), `Menu.Separator`, `Menu.Label` | `modal={false}` by default |
| `Popover` | Radix Popover | `anchor` (element or virtual rect) | Used by SelectionPopover |
| `Tooltip` | Radix Tooltip | `content`, `side` | One `Tooltip.Provider` at root, `delayDuration=400` |
| `Toast` | Radix Toast | `tone`: `success` · `info` · `danger`; `title`, `description`, `action` | Replaces `SaveNotice`; viewport is a polite live region |
| `Tabs` | Radix Tabs | `activationMode` | |
| `ToggleGroup` | Radix ToggleGroup (`type="single"`) | `items` | Discussion filter |
| `Toolbar` | Radix Toolbar | | PageToolbar; roving focus between buttons |
| `Collapsible` | Radix Collapsible | | Thread cards |
| `Separator` | Radix Separator | `orientation` | |
| `Field` | Radix Label + native input/textarea/select | `label`, `hint`, `error` | Wires `aria-describedby` / `aria-invalid` |
| `Callout` | `<div role="status|alert">` | `tone`: `info` · `warning` · `danger` · `success`; `title`, `actions` | Icon + text, never colour alone |
| `Badge` | `<span>` | `tone` | Space state, PAT state, "Outdated" |
| `Avatar` | `<span>` (initials) | `name` | No images, so nothing to fetch |
| `EmptyState` | `<div>` | `title`, `description`, `action` | |
| `Spinner` / `Skeleton` | CSS only | | Loading states announced by text, not by the animation |
| `VisuallyHidden` | Radix VisuallyHidden | | |
| `Kbd` | `<kbd>` | | Shortcut hints in tooltips |

**Not used** (CSP; R3): Radix `Select`, `ScrollArea`. Use a native `<select>` styled
with `Field`, and native overflow scrolling.

**Stays custom**:

- `PageTree`: WAI-ARIA tree, restyled. Folder rows get chevron icons, the current page an
  accent left border and `aria-current="page"`. Indentation is `--space-4` per level.
- `MarkdownEditor` and `DiffView`: CodeMirror, themed from tokens through a CodeMirror
  `EditorView.theme` reading CSS variables.

### Icons (`@radix-ui/react-icons`)

| Use | Icon |
|-----|------|
| Sidebar toggle | `HamburgerMenuIcon` |
| New page | `PlusIcon` |
| Folder (collapsed / expanded) | `ChevronRightIcon` / `ChevronDownIcon` |
| Page | `FileTextIcon` |
| Edit | `Pencil1Icon` |
| History | `CounterClockwiseClockIcon` |
| More actions | `DotsHorizontalIcon` |
| Delete | `TrashIcon` |
| Copy link | `Link2Icon` |
| Download | `DownloadIcon` |
| Comment | `ChatBubbleIcon` |
| Resolve / reopen | `CheckCircledIcon` / `ResetIcon` |
| Warning / info / error / success | `ExclamationTriangleIcon` / `InfoCircledIcon` / `CrossCircledIcon` / `CheckIcon` |
| Close | `Cross2Icon` |
| Space switcher | `CaretSortIcon` |

---

## Keyboard map

| Context | Keys | Action |
|---------|------|--------|
| Global | `Tab` from page load | Skip link, then the header |
| Global | `F8` | Focus the toast viewport |
| Page tree | `↑ ↓ ← → Home End Enter`, typeahead | WAI-ARIA tree pattern (existing) |
| PageToolbar | `← →` | Move between toolbar buttons |
| Global | `?` *(single-key)* | Open *Keyboard shortcuts* help |
| Read view | `e` *(single-key)* | Edit (write + current version only) |
| Read view with a selection in the article | `c` *(single-key)* | Comment on selection |
| Discussion highlight (focused) | `Enter` / `Space` | Open its discussion (FR-018) |
| Editor | `Ctrl/⌘+S` | Save (focuses *Change description* if it is empty) |
| Composer / reply | `Ctrl/⌘+Enter` | Submit |
| Any overlay | `Esc` | Close and return focus to the trigger |
| Menus | `↑ ↓ Home End`, typeahead, `Enter` | Radix menu behaviour |

Rules (research R7, FR-016/FR-017):

- Single-key shortcuts fire only while focus is not in an editable field, no modifier is
  held, and no IME composition is active.
- They can be turned off (Profile or shortcut help), which satisfies WCAG 2.1.4. While
  they are off they are not registered, and tooltips stop advertising them.
- Modifier shortcuts belong to their field or form and always work.

---

## Accessibility acceptance

- **Contrast**: text ≥ 4.5:1 and UI components or focus indicators ≥ 3:1, in both
  themes. Verified by the automated WCAG scan in e2e (research R10) and by spot checks
  of the token pairs listed above.
- **Focus**:
  - the `--focus-ring` is visible on every interactive element; no `outline: none`
    without a replacement;
  - focus is never lost to `<body>` after an overlay closes or an item is deleted. After
    a deletion, focus moves to the next item, or to its container.
- **Names**:
  - every icon-only control has an accessible name;
  - every Dialog/AlertDialog has a `Title` (Radix warns in dev if one is missing; this is
    treated as a test failure);
  - form fields have visible labels.
- **Live regions**: save outcomes (Toast), route changes, and loading → loaded
  transitions for the tree and discussions.
- **Reflow**: no horizontal page scroll at 320 px, except code blocks and tables, which
  scroll inside their own container.
- **Target size**: interactive targets ≥ 24×24 CSS px (2.5.8 guidance), 32 px or more in
  toolbars.
- **Reduced motion** is respected.

## CSP and asset rules

- No inline `<style>` or `<script>` authored by us. Library `<style>` injection is
  allowed only through the per-request nonce (R3).
- All CSS, including the Radix Colors files, and all icons are bundled. There are no
  remote fonts, images or stylesheets.
- Rendered page HTML stays server-sanitized. The UI never injects HTML from any other
  source (constitution, FR-030).

## Requirement traceability

| Spec | Where in this contract |
|------|------------------------|
| FR-001, FR-002 | Design principles; Component inventory (single `ui/` layer, Button variants) |
| FR-003 | AlertDialog (`Cancel` focused); Global overlays |
| FR-004, FR-005 | S3 state indicators; Callout (icon + text) |
| FR-006–FR-008 | S4 save outcomes; Toast vs inline Callout (research R8) |
| FR-009–FR-011 | App shell → Responsive; *Discussions (n)* toggle |
| FR-012–FR-014 | Skip link, route focus, Keyboard map, Accessibility acceptance → Focus |
| FR-015–FR-018 | Keyboard map, Shortcut help, S7 shortcut preference, Discussions UI → Highlights |
| FR-019, FR-020 | S3 Selection |
| FR-021–FR-024 | S3 PageInfo and Page actions |
| FR-025, FR-026 | Design tokens → Colour (dark scales under `html.dark`); CodeMirror theme from tokens |
| FR-027, FR-028 | Accessibility acceptance; Motion tokens |
| FR-029, FR-030 | CSP and asset rules |
