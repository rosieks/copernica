# Research: Page Front Matter

Phase 0 decisions for [spec.md](spec.md). Each entry: Decision, Rationale, Alternatives.

## R1. Recognizing and hiding the block: Markdig `UseYamlFrontMatter()`

**Decision**: Add Markdig's built-in YAML front matter extension to both pipelines in
`MarkdownRenderer` (`_pipeline` and `_spanPipeline`). It turns the leading `---` … `---`/`...`
block into a `YamlFrontMatterBlock`, which the HTML renderer writes as nothing. The block's
text (its lines) is taken from that syntax node and handed to the front matter parser (R3).

A single helper, `FrontMatter.Locate(string text)`, defines FR-001 (first line exactly `---`
after an optional BOM, trailing spaces allowed; closed by the next `---` or `...` line) and
returns the block's character range. It is used where no Markdig parse happens: page titles
for the tree (R5), the rename rewrite (R6), and the existing scan in `PageTitle.FirstHeading`,
which is replaced by it. A probe test runs the shared corpus through both and asserts that
Markdig and `Locate` agree on every file (start, end, or "no block"); if Markdig accepts a
shape FR-001 rejects (or the reverse), the renderer drops/keeps the node based on `Locate`.

**Rationale**: No new dependency for recognition; the block disappears from the HTML at the
syntax level, so it can no longer become a horizontal rule plus paragraph, or a setext
heading (a block ending in `key: value` followed by `---` is today an H2 with an id).
Keeping the full text in one parse leaves source positions intact for diagram containers
(`DiagramContainerRenderer` reads the original Markdown) and link spans (005).

**Alternatives**:
- Strip the block before parsing: shifts every source offset (link rewriting, diagram
  containers, precise spans) and would need offset correction everywhere. Rejected.
- Post-process the HTML: fragile, and the setext-heading case changes the tree shape.
  Rejected.

**Consequences, checked by tests**:
- Section ids (009) of real headings are unchanged. The only ids that disappear are
  accidental setext headings made from front matter. A real heading whose slug equalled
  such an accidental heading's slug loses its `-1` suffix; this is the intended fix and
  is listed in the PR notes.
- Discussion anchors (001) quoting text inside a front matter block no longer find their
  text and are shown as detached, by the existing anchor rules. Such anchors are not
  expected in practice.

## R2. YAML parsing library: YamlDotNet, event parser only

**Decision**: Add **YamlDotNet** (MIT, no dependencies, pinned in `Directory.Packages.props`
and `packages.lock.json`; version 16.3.0 or the newest 16.x at implementation time) and use
only its low-level event parser `YamlDotNet.Core.Parser`. Copernica builds its own small
value tree (text, list, map) from the events. The deserializer, `YamlStream`, type tags
and any reflection-based API are not used.

**Rationale**:
- YAML is large: quoting rules, block scalars (`description: >`), flow collections,
  escapes, comments, multi-line plain scalars. A hand-written subset parser would
  misread real files from Jekyll, Hugo and Obsidian (SC-001) and be its own security risk.
- The event parser never constructs objects from tags, so `!!python/object` and similar
  are just ignored tags on a scalar (FR-019). Alias expansion, depth and size are
  controlled by Copernica's own tree builder (R4), not the library.
- Event marks give character offsets, which the rename rewrite needs (R6).
- Trimming/AOT safe: no reflection.
- MIT, widely used, maintained, so internal license and vulnerability scanning is simple.

**Alternatives**:
- `SharpYaml` (BSD-2): less used, the same capabilities. Rejected.
- Hand-written subset parser: see above. Rejected.
- Parsing in the browser (`yaml` npm): forbidden by FR-018 / Constitution (server-side
  rendering in one place) and would ship a second parser. Rejected.

Constitution IV: the plan justifies the dependency (above); `SECURITY.md` third-party list
and the PR description name it.

## R3. Value model: everything is text, lists or maps

**Decision**: Scalars are kept **as written** (the scalar's string value after YAML
unquoting/folding), never resolved to numbers, booleans or dates. Plain scalars `~`,
`null`, `Null`, `NULL` and empty values are *null*: a known field with a null value counts
as absent; under Properties the field is listed with an empty value.

**Rationale**: The spec shows dates "as written" and never computes with values. Type
resolution adds YAML 1.1 vs 1.2 ambiguity (`no` = false?) with no benefit.

**Alternatives**: Typed values (numbers, booleans, dates) in the API. Rejected (YAGNI).

## R4. Limits and invalid blocks

**Decision**: The tree builder enforces:

| Limit | Value | Over the limit |
|-------|-------|----------------|
| Block size | 32 KiB (UTF-16 chars of the block body) | invalid, parser not started |
| Nesting depth | 16 | invalid |
| Nodes after alias expansion | 2,000 | invalid |
| Single scalar | 8 KiB | invalid |

A block is **invalid** when: YAML syntax error (`YamlException`), any limit hit, more than
one YAML document, top level not a mapping, a non-scalar key, or a key repeated exactly
(duplicate keys, spec Edge Cases). An invalid block yields `{ readable: false, raw }` and
the page renders normally; the title falls back to the heading/file name.

Known field names match case-insensitively. When `Title` and `title` both appear (not an
exact duplicate), the first one in written order is used and the other is listed under
Properties.

**Rationale**: Typical front matter is under 2 KiB; the limits leave wide room and keep a
hostile page cheap (SC-004). Counting nodes during alias expansion defeats "billion laughs".

**Alternatives**: Reject anchors/aliases outright. Rejected: they are valid YAML and
occasionally used; the node budget is enough.

## R5. Page title

**Decision**: `PageTitle.Resolve(content, path)` becomes: front matter `title` (readable
block, scalar, non-empty after trim) → first level-1 heading → file name. It parses only
when `FrontMatter.Locate` finds a block, so pages without front matter cost the same as
today. The tree already caches titles per blob id (`PageTreeService`), so YAML is parsed
once per page version.

The page header keeps today's rule: it shows `title` as an `<h1>` only when the rendered
content has no level-1 heading. When `title` and the body H1 differ, the body H1 is the
visible heading and `title` names the page in the tree, tab and picker (spec US2 AS3).

**Alternatives**: Always show `title` as a header and hide the body H1. Rejected: changes
the content's visible structure and section ids.

## R6. Rename rewrites the `title` value in place

**Decision**: When a page is renamed with a new title (005 `Retitle`) and its readable
front matter has a `title` scalar, `FrontMatterTitle.Replace(content, title)` replaces only
that scalar's character range (start/end marks from the event parser, offset by the
block's start in the file) and **does not** touch the first heading. Otherwise
`PageTitle.ReplaceFirstHeading` runs as today.

The new value keeps the original style when safe:
- double-quoted → double-quoted (`\` and `"` escaped);
- single-quoted → single-quoted (`'` doubled);
- plain → plain if the text cannot be misread (no leading indicator character, no `: `,
  ` #`, no leading/trailing spaces, not `null`/`true`/`false`/`~`/a number), otherwise
  double-quoted;
- block scalar (`>`/`|`) → a double-quoted single line.

A test re-parses the result and asserts the new title, and that every other byte of the
file is unchanged.

**Alternatives**: Re-serialize the whole block. Rejected: breaks byte-for-byte fidelity
(FR-012, FR-015).

## R7. Delivering metadata: one `frontMatter` object on Page and render responses

**Decision**: `RenderedMarkdown` gains `FrontMatter? FrontMatter`, produced in the same
parse as HTML and sections and cached with them. `PageDto` and the `POST /api/render`
response carry it as `frontMatter` (null when the file has no block). Shape in
[contracts/api.md](contracts/api.md). Too-large pages return `frontMatter: null`.

**Rationale**: Same pattern as `sections` (009); no new endpoint; history versions get it
for free because they go through `GetPage`.

## R8. Page view display

**Decision**: A new `src/web/src/frontmatter/` module with `PageMeta.tsx`, rendered by
`PageView` between the page header and the article (outside the `<article>`, so discussion
anchors, section decoration and plain-text extraction ignore it), and by the Markdown
editor's preview pane. Everything is React text; no `dangerouslySetInnerHTML`.

- Status: the existing `Callout` (`tone="warning"` for deprecated/archived, `"info"` for
  draft) with a text title ("Deprecated", …) and a one-line explanation.
- Description: a paragraph styled as a lead.
- Owner / Authors: a small `<dl>`.
- Tags: `<ul aria-label="Tags">` of non-interactive chips (FR-013).
- Properties (and "Also known as"): native `<details><summary>Properties</summary>` with a
  nested `<dl>`; lists render as `<ul>`, maps as nested `<dl>`. Native `<details>` is
  keyboard operable and exposes its expanded state (FR-010).
- Invalid: `Callout tone="warning"` "This page's metadata could not be read", plus a
  `<details>` with the raw block in `<pre>` as text.

Styles in `frontmatter.css` with existing tokens (light/dark), wrapping long values
(`overflow-wrap: anywhere`), no inline styles (CSP).

## R9. Visual editor card

**Decision**: The visual editor keeps front matter as the existing `raw_block` with
`kind: 'front-matter'` (byte fidelity unchanged, 007). `nodeViews.ts` gets a
`FrontMatterView` for that kind: a read-only card (`contentEditable=false`, `role=group`,
label "Page metadata, can be edited in Markdown mode") built with the file's existing
`el()` helper and `textContent` only, showing title, description, status, tags, owner and
authors, the number of other properties, and a button "Edit in Markdown mode" that calls a
new `NodeViewContext.onSwitchToMarkdown`.

The card's data comes from the server: the view calls a new context function
`loadFrontMatter(source)`, which posts the block's source to the existing `POST /api/render`
and reads `frontMatter`, cached per source string. Because the block is read-only in
visual mode, it changes only after an edit in Markdown mode, so one request per mode
switch at most.

**Rationale**: Satisfies spec clarification Q1, keeps the Constitution's visual-editor
rule (no markup from user content; values shown only as text inside a placeholder) and
FR-018 (no YAML in the browser).

**Alternatives**: Reuse `PageMeta` via a React root inside the node view: no existing node
view does that, and the card is simpler than the page display. Rejected.

## R10. Test corpus

**Decision**: `tests/fixtures/front-matter/` with:
- `corpus/`: at least 30 real-world style files (Jekyll posts, Hugo with `weight`,
  Docusaurus with `sidebar_position` and `authors` objects, MkDocs, Obsidian with `aliases`
  and `tags` as a string), SC-001/SC-002;
- `hostile/`: script/HTML in values, `javascript:` values, alias bomb, depth 50, 40 KiB
  block, custom tags, duplicate keys, tabs, unclosed block, SC-004;
- an expected-JSON file per corpus page for the server tests.

The 007 round-trip test (corpus in `src/web/src/visual/markdown/corpus/`) also globs
`tests/fixtures/front-matter/corpus/` (SC-003), the same way the web tests already read
`tests/fixtures/sections/` (009). The e2e server seeds two of the files.
