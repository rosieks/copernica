# UI Contract: Links to Headings

## Copy-link control (US1, FR-001–FR-003)

**Where**: on every `h1`, `h2` and `h3` with an id inside the page article
(`article.prose` in `PageView`), for current and earlier versions. Not in the editor
preview, comments, the fallback `page__title` or `h4`–`h6`.

**DOM** (added by the browser after the server HTML is inserted):

```html
<h2 id="user-content-setup" aria-label="Setup">Setup<span class="section-link" data-anchor-skip>
  <button type="button" class="ui-button … section-link__button"
          aria-label="Copy link to section: Setup">
    <span aria-hidden="true"><svg>…Link2Icon…</svg></span>
  </button>
</span></h2>
```

- The control is the heading's last child, so it sits on the heading's line, at the end of
  its text. It is not placed after the heading, because a wrapper around the heading
  would stop its margins collapsing and cut the H2 rule short.
- The heading gets `aria-label` with its own text, unless it already has one. Its
  accessible name therefore stays the heading text.
- The button has no text node, so `textContent` is unchanged and selecting and copying the
  page text copies no label. `data-anchor-skip` keeps discussion anchors unchanged, and
  the button has `user-select: none`.
- The control is rendered with a React portal into the span. The span and the
  `aria-label` are removed when the HTML changes or the view unmounts.
- **Visibility**:
  - visible on hover of the heading or button, on `:focus-visible`, and always when
    `(hover: none)`;
  - otherwise `opacity: 0`, but it stays in the tab order and in the accessibility tree.
- **Look**: contrast, focus ring and theme come from existing tokens. It is hidden under
  `@media print` and drawn with the system colors under `forced-colors`.
- **Keyboard**: one Tab stop after the heading's content; Enter and Space activate it.

**Activation**:
1. `url = canonicalUrl(spaceId, path, commitId, isCurrent) + '#' + encodeURIComponent(id)`.
2. `navigate({ hash }, { replace: true, state: { sectionCopy: true } })`. The address bar
   shows the section, and no scroll or focus move follows (the flag).
3. `copyText(url)`:
   - success → toast `success`, title "Link copied" (announced by the toast region);
   - refused → `CopyLinkDialog` opens with the section link, labelled "Link to this
     section".

## Opening a section (US2, FR-009–FR-013)

**Trigger**: a change of `location` (pathname, search, hash or history `key`) while
`PageView` shows a page with non-empty `location.hash`, once the article HTML for that
location is in the DOM. It is skipped when `state.sectionCopy` is set.

**Resolution**: data-model.md. Only the page article is searched.

**Found**:
- `element.scrollIntoView({ block: 'start' })`, instant. The existing
  `scroll-margin-top: calc(var(--header-height) + var(--space-4))` keeps the heading below
  the sticky header (SC-004).
- `tabindex="-1"` is added if needed, then `element.focus({ preventScroll: true })`.
- The class `section-target` is added. It is a background fade of about 2 s; under
  `prefers-reduced-motion` it is a static outline for 2 s. It is removed afterwards.
- **Follow layout**: a `ResizeObserver` on the article re-applies `scrollIntoView` when
  the article's size changes (images, diagrams). This stops at the first user `wheel`,
  `touchstart`, `keydown` or `pointerdown`, or after 3 s.

**Not found**: the page stays where the navigation put it, and an `info` toast says
"Section not found" with the description "The page has no section "{fragment}"; it may
have been renamed." It is shown once per location key.

**`RouteAnnouncer`**: when the new location has a hash, it still announces the title but
does not focus `main h1` (the section hook owns focus).

**Skip link**: "Skip to content" focuses `<main id="main">` itself, without changing the
address. As a native `#main` jump, the router would treat it as a section link and could
land on a page heading named "main".

**Editor preview**: `#…` links scroll inside the preview pane and leave the editor's
address unchanged.

**Same-page links** (`href` starting with `#`):
- in the page article and comment bodies, a plain left-click calls
  `navigate({ hash })` (push) instead of the native jump;
- resolution then always targets the page article;
- links with modifier keys keep the browser's default behavior.

**Links to other pages** (`/s/…#frag`): unchanged routing (`navigate(href)`). The hash
handling above runs when the new page loads. Comment bodies route `/s/` links through
`navigate` in the same way as the page article.

**Too large pages** (`tooLarge`): no decoration and no resolution, so no toast.

## Editor section picker (US3, FR-014–FR-015)

In `LinkDialog`, tab "Page in this space":

- The page list adds a first entry, "This page", for the page being edited. It was
  previously excluded.
- After a page is chosen, a second listbox labelled "Section (optional)" appears:
  - the first option is "Whole page" (the default);
  - then the page's `sections`, each with an indent per level and its text. Levels are
    also given to screen readers ("Heading level 2").
  - Typing filters the options by text.
  - It uses the same combobox/listbox pattern and keyboard behaviour as the page list.
- **Data source**:
  - another page: `GET` page (current version, query key `['page', spaceId, path, 'head']`,
    so the result is shared with the page view);
  - this page: the last `POST /api/render` of the current editor text, requested when the
    picker opens.
- While loading, the list shows "Loading sections…". On error or a too-large page it shows
  "Sections are not available", and the whole page can still be linked.
- **Result**:
  - `href = relativeLink(pagePath, chosen.path) + (section ? '#' + encodeURIComponent(id) : '')`;
  - for "This page": `'#' + encodeURIComponent(id)`;
  - the link text defaults to the section text if a section is chosen, else the page title.

## Ids

- User-content ids are `user-content-*` (contracts/api.md). Application ids (`main`,
  `root`, …) are unchanged.
- No application code may query user content by unprefixed id.
