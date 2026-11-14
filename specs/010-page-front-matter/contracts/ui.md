# UI Contract: Front Matter

Covers the page view, earlier versions, the Markdown editor preview and the visual
editor. All values come from `frontMatter` (contracts/api.md) and are rendered **as text
only**: no `dangerouslySetInnerHTML`, no `innerHTML`. The only links are property values
that carry an `href` from the server.

## Page metadata (page view, earlier versions, Markdown preview)

Placement: below the page header (title and actions) and page info, above the article,
outside the `<article>` element. Shown only when `frontMatter` is not null.

Order, each part only when it has content:

1. **Status banner** (`status`):

   | status | Callout tone | Title | Text |
   |--------|--------------|-------|------|
   | `draft` | info | Draft | This page is a draft and may be incomplete. |
   | `deprecated` | warning | Deprecated | This page is deprecated. Its content may be out of date. |
   | `archived` | warning | Archived | This page is archived and kept for reference. |

   The state is in the title text, not only the color or icon.

2. **Description**: one paragraph, lead style.
3. **People**: a definition list with "Owner"/"Owners" and "Author"/"Authors", names
   joined as a list.
4. **Tags**: `<ul aria-label="Tags">`, each tag an `<li>` chip. Not links, not focusable.
5. **Properties**: `<details>` (closed by default) with `<summary>Properties</summary>`,
   shown only when `aliases` or `properties` is non-empty:
   - "Also known as": aliases, first entry when present;
   - each property: `<dt>` name as written, `<dd>` value; `text` as text (empty value
     shown as an em dash with the accessible text "empty"), or as
     `<a href={href} rel="noopener noreferrer">` with the text when `href` is set; `list`
     as `<ul>`, `map` as a nested `<dl>`.

Unreadable block (`readable: false`): instead of the parts above, a warning Callout
"This page's metadata could not be read." and a closed `<details>` "Show metadata source"
containing `raw` in `<pre>`.

Layout and accessibility (FR-010):
- Long values wrap (`overflow-wrap: anywhere`); no horizontal page scroll at 320 px.
- Light and dark themes through existing tokens; AA contrast for chips and banner.
- No inline styles (CSP).
- The section is wrapped in `<section aria-label="Page metadata">`.

## Page title

- Tree, page picker, breadcrumbs, browser tab: `Page.title` / `TreeNode.title` (server
  rule).
- Page header: unchanged rule. `<h1 class="page__title">` with `Page.title` only when the
  rendered HTML has no level-1 heading.

## Markdown editor

- The raw block stays visible and editable in the source.
- Preview shows the page metadata above the preview HTML, from the render response's
  `frontMatter`, with the same component as the page view.

## Visual editor card

Replaces the generic placeholder for `raw_block` with `kind: 'front-matter'`.

- `contentEditable=false`, `role="group"`, `aria-label="Page metadata, can be edited in
  Markdown mode"`.
- Content (text nodes only): title, status label, description, tags (comma-separated),
  owners/authors, "N more properties" when `properties`/`aliases` is non-empty.
- While loading: "Loading page metadata…". Unreadable: "This page's metadata could not
  be read." Request failed: the generic placeholder (label + first line), as today.
- Button **Edit in Markdown mode**: switches the editor to Markdown mode with the caret at
  the start of the block. Keyboard reachable; the editor's selection is not moved by
  clicking it.
- Saving never changes the block (007 byte fidelity).

## Strings

All UI strings above are in English (Constitution I) and live with the component.
