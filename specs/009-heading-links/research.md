# Research: Links to Headings

## R1 — Keep the current section ids (Markdig GitHub mode)

**Decision**: Keep `UseAutoIdentifiers(AutoIdentifierOptions.GitHub)` unchanged as the
wiki's own section address format.

**Evidence**: Markdig 1.4.1 renders these headings through the current pipeline as follows
(probe run on 2026-10-24):

| Heading | id |
|---------|----|
| `# Setup`, `## Setup`, `## Setup` | `setup`, `setup-1`, `setup-2` |
| `## Zażółć gęślą jaźń` | `zażółć-gęślą-jaźń` |
| `## Setup & config (v2.0)!` | `setup--config-v20` |
| `## C# / .NET: why?` | `c--net-why` |
| `## 🚀 Launch` | `-launch` |
| ``## `code` and **bold** [link](x)`` | `code-and-bold-link` |
| `## !!!` | `section` |
| `## Setup-1` (after the duplicates) | `setup-1-1` |
| `> ## In quote`, `- ## In list` | `in-quote`, `in-list` |
| `### main` | `main` (collides with `<main id="main">`, see R2) |
| `<h2>Raw html</h2>` / `<h2 id="custom">` | no id / `custom` |

The rule (`LinkHelper.UrilizeAsGfm`) is:
- a letter or digit of any script, `-` or `_` is kept, lowercased;
- a space becomes `-`;
- everything else is dropped, with no trimming and no collapsing;
- a duplicate gets `-1`, `-2`, … until the id is unique;
- an empty result becomes `section`.

**Rationale**:
- Letters of any script are already kept, so FR-006 is met with no change.
- Changing the format would break existing links (SC-006).
- The ids match GitHub except for emoji and combining marks.

**Alternatives considered**:
- An Azure DevOps-style format: its rules are not documented consistently (R4), and it
  would break existing links.
- Explicit `{#id}` attributes: that would require changing stored Markdown, against FR-016.

## R2 — Prefix user-content ids (`user-content-`)

**Decision**:
- The sanitizer's `PostProcessNode` rewrites every surviving `id` in user content to
  `user-content-{id}`, unless it is already prefixed.
- Fragments in URLs and `href="#x"` stay unprefixed.
- The SPA resolves them by adding the prefix (R4).

**Rationale**:
- Today a heading `### main` produces `id="main"`, which duplicates the skip-link target
  `<main id="main">`. Raw HTML can carry any id (`root`, `discussions-title`, …), and ids
  in sanitized HTML can clobber `window`/`document` named properties.
- GitHub solved the same problem with the same prefix.
- Prefixing in the one server-side sanitizer covers pages, previews and comments at once
  (FR-008, Safe content).

**Alternatives considered**:
- Renaming the application's ids: this only moves the collision and leaves clobbering
  open.
- Prefixing only heading ids in Markdig: raw HTML ids and footnotes would stay
  unprotected.
- Dropping `id` from the allowed attributes: this breaks footnotes and author anchors.

**Consequences**:
- Native same-page jumps stop matching, so the SPA handles `#` links (R5). This is needed
  for history entries anyway (FR-013).
- Footnote links (`#fn:1`) resolve through the same path.
- One existing test changes its expected id.

## R3 — Copy control as browser UI next to the heading

**Decision**:
- After the article HTML is inserted, a component appends a `<span class="section-link"
  data-anchor-skip>` to each `h1`–`h3` and renders the button into it through a portal
  (`<button aria-label="Copy link to section: …">`).
- The heading gets `aria-label` with its own text, so its accessible name stays the
  heading text.
- The button uses `Link2Icon`, has no text node and has `user-select: none`.

*Changed during implementation*: the plan placed the span after the heading, with a grid
wrapper. Wrapping the heading stopped its margins collapsing with the surrounding blocks
and cut the H2 bottom rule short. Placing the span at the end of the heading keeps the
layout unchanged. The `aria-label` keeps the accessible name, and the absence of a text
node keeps `textContent`.

**Rationale**:
- Without the `aria-label`, a button inside the heading would change the heading's
  accessible name ("Setup Copy link…").
- Any text in the button would change `textContent`, which shifts discussion anchors
  (offsets over `textContent`, 001).
- `data-anchor-skip` is the existing convention for UI injected into the article (diagram
  chrome, 004).
- The server must not emit buttons: the sanitizer blocks them, and the control is not
  content.

**Alternatives considered**:
- A link `<a href="#id">` wrapping the heading or a `¶` anchor, as on GitHub: copying is
  the user's goal (FR-003), and a link adds a second navigation target per heading for
  screen readers.
- Showing the control on H4–H6: the spec limits it to H1–H3.

## R4 — Resolving fragments, including Azure DevOps links

**Decision**: Resolve in this order, inside the page article only:
1. Percent-decode the fragment; if decoding fails, use the raw value.
2. Exact match: `user-content-{f}`.
3. Otherwise compute `gfmSlug(f)`, a TypeScript port of the R1 rule without
   de-duplication, and look for `user-content-{gfmSlug(f)}`.
4. Otherwise report "not found".

`gfmSlug` is pinned to the server by a shared golden list in
`tests/fixtures/sections/slugs.json`, read by both xUnit and Vitest.

**Evidence on Azure DevOps**:
- Microsoft Learn ("Anchor links") says to lowercase, turn spaces into hyphens and handle
  punctuation "according to the rendering engine". Its own example
  (`Team #1 : Release Wiki!` → `#team-1--release-wiki`) matches the GitHub rule.
- Observations of ADO Server 2019 and Services 2020 show that punctuation is kept
  (`Interface Version 1.0` → `interface-version-1.0`, `Design & Process` →
  `design-%26-process`) and that duplicates get no suffix.
- In every documented variant, ADO only lowercases and turns spaces into `-`, then keeps or
  drops punctuation. Applying the GitHub rule to an ADO fragment drops the same characters
  the wiki dropped from the heading text, so it yields the wiki's base id. ADO duplicates
  mean the first heading, and the base id is the first one here too.
- ADO's "copy link" produces addresses on the ADO host (`…?anchor=…`, unverified). Those
  are not links into this wiki and are out of scope.

**Rationale**:
- The rule needs no knowledge of the uncertain ADO punctuation rules, and an exact id
  always wins.
- Step 3 can only match where step 2 failed, so own-format links are never redirected.

**Remaining risk**: headings that differ only in punctuation (`1.0` and `10`) are joined
by step 3. Then the first heading wins, the same outcome as ADO's own duplicate rule.

**Alternatives considered**:
- Adding ADO-style ids as aliases on the server: this needs extra attributes and
  certainty about ADO's rules.
- Matching on heading text in the browser: this repeats the slug work for no gain.

## R5 — Navigation, scrolling and focus

**Decision**: A `useSections(article, html, location)` hook in `PageView` handles the
hash:
- it runs after the HTML for the current location is committed, and again on hash or
  history-key changes;
- it scrolls instantly (`scrollIntoView({block:'start'})`) and relies on the existing
  `scroll-margin-top: calc(var(--header-height) + var(--space-4))` for the sticky header;
- it moves focus with `tabindex=-1` and `preventScroll`;
- it adds a highlight class (a fade, or a static outline under reduced motion);
- a `ResizeObserver` re-aligns the heading for up to 3 s or until the first user input,
  to cover images and diagrams (FR-010).

Same-page `#` clicks in the article, the preview and comment bodies call
`navigate({hash})`, which pushes a history entry (FR-013). `RouteAnnouncer` skips its
`h1` focus when a hash is present but keeps announcing the title.

**Rationale**:
- `BrowserRouter` has no scroll restoration, and the native jump fires before the SPA has
  rendered, so neither works today (finding from the code map).
- Instant scrolling avoids motion problems and the timing issues of smooth scroll during
  re-alignment.

**Alternatives considered**:
- Moving to a data router's `ScrollRestoration`: a larger routing change for one need.
- Waiting for all images and diagrams before scrolling: this delays the first position
  noticeably on long pages.

## R6 — Sections for the editor from the server

**Decision**:
- `MarkdownRenderer` returns the H1–H3 sections from the same Markdig parse it renders:
  `HeadingBlock`, the level, `GetAttributes().Id`, and the inline plain text through the
  existing plain-text renderer.
- `Page` and the render response gain `sections` (contracts/api.md).
- The page cache stores HTML and sections together.

**Rationale**:
- The constitution forbids rendering or parsing user content in the browser outside the
  defined exceptions.
- The server is the only place that knows the final ids, including de-duplication.
- No new route is needed: the dialog reuses the page query, and the editor's own sections
  come from the preview endpoint it already calls.

**Alternatives considered**:
- A separate `/sections` route: a new authorization surface for data that already comes
  with the page.
- Parsing the page HTML with `DOMParser` in the dialog: a constitution grey zone, and it
  duplicates the server's logic.

## R7 — Copy failure

**Decision**: When `navigator.clipboard.writeText` is missing or refused, open the existing
`CopyLinkDialog` with the section link, and also update the address bar.

**Rationale**:
- This reuses the page-link pattern that people already know (002/005).
- It is more helpful than only pointing at the address bar.
- It covers FR-003's "the reader is told where the link is".

## R8 — Scope boundaries confirmed

- **Comments**: headings in comments get prefixed ids too. They are not decorated and are
  never targets, because resolution searches only the page article.
- **Too large pages**: no decoration and no resolution, so no "not found" toast for a page
  shown as source.
- **Print**: the control is hidden under `@media print`. This is the first print rule in
  the codebase and is placed in `sections.css`.
- **Not done**: no table of contents (`[[_TOC_]]` stays a placeholder) and no link
  updates on heading rename (FR-017).
