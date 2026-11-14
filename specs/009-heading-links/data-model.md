# Data Model: Links to Headings

Nothing is stored. Every item below is derived from a page version's Markdown when it is
rendered, or from the browser address.

## Section

A heading of a page version that the wiki offers as a link target.

| Field | Type | Rule |
|-------|------|------|
| `level` | integer 1–3 | Markdown ATX or Setext heading level. Levels 4–6 are not listed (FR-001), but keep their ids. |
| `id` | string | The Markdig GitHub-style auto identifier, unchanged from today (FR-004): lowercase; spaces become `-`; letters and digits of any script are kept (FR-006); other punctuation is dropped; duplicates on one page get `-1`, `-2`, … in page order (FR-005); empty → `section`. Unique within the page version. |
| `text` | string | Visible plain text of the heading (inline code, emphasis and link text included, markup dropped), trimmed. Used for the button's accessible name, the editor list and the Azure DevOps match. |

- **Source**: Markdown headings in the document, including those inside quotes and list
  items. Not included: headings in code blocks (they are code), raw HTML `<h1>`–`<h6>` (no
  auto id; an author-written `id` is kept, prefixed, and resolvable by exact match but is
  not listed), and the wiki's fallback page title.
- **Order**: document order.
- **Scope**: page version (commit + path). The same text in a different version can get a
  different id when duplicates are added or removed above it.

## Section address (fragment)

The part of a page URL after `#`.

- **Written** (copy control, editor): `encodeURIComponent(id)`, for example
  `#za%C5%BC%C3%B3%C5%82%C4%87`. Readers and chat tools keep it intact.
- **Read**: percent-decoded (malformed sequences are used as typed), then resolved by
  [resolution](#resolution).
- **Never in the DOM as is**: elements carry `id="user-content-{id}"` (contracts/ui.md).

## Section link

`{page URL}#{section address}`, where the page URL is what `canonicalUrl` already produces:
- current version: `{origin}/s/{spaceId}/{path}`;
- earlier version: `{origin}/s/{spaceId}/-/version/{commitId}/{path}`.

In Markdown written by the editor: `{relative path}.md#{id}` for another page, `#{id}`
for the page being edited (the form `relativeLink` already writes, plus the fragment).

## Resolution

Input: decoded fragment `f`, the article element. Output: target element or *not found*.

1. Element in the article with `id === "user-content-" + f`.
2. Otherwise apply the server's slug rule (`gfmSlug`, research R4) to `f` and look for
   `id === "user-content-" + gfmSlug(f)`. This catches Azure DevOps links: Azure DevOps
   lowercases and turns spaces into `-` but keeps punctuation (`interface-version-1.0`,
   `design-&-process`). The GitHub rule drops that punctuation, so it yields the wiki's own
   id (`interface-version-10`, `design--process`). Azure DevOps gives duplicates no suffix
   and means the first one, and the base id is also the first heading here.
3. Otherwise *not found*: the page stays at the top and an informational toast "Section
   not found" is shown (FR-011).

Only the page article is searched. Headings inside discussion comments are never targets.

## State transitions (browser)

```text
location changes (pathname, hash or history key)
  └─ hash empty → nothing (current behaviour)
  └─ hash present → wait for article HTML
        └─ resolve → found → scroll (instant), focus (preventScroll), highlight
                     │       └─ follow layout changes until the user scrolls, keys or 3 s pass
                     └─ not found → toast once per location
copy control activated
  └─ copyText(sectionLink) → ok → toast "Link copied"
                           └─ refused → CopyLinkDialog with the section link
  └─ history.replace(hash) without scrolling (flagged state)
```
