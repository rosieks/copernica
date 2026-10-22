# Contract: Markdown ↔ Visual Document Fidelity

**Feature**: [../spec.md](../spec.md) | **Research**: [R2–R6, R10](../research.md)

This contract is the testable definition of FR-007 to FR-012 and FR-016. Module:
`src/web/src/visual/markdown/` (pure TypeScript, no DOM).

## 1. Schema (allow-list)

Only these node and mark types exist. Anything else in the source becomes a placeholder.

| Type | Kind | Markdown source (Lezer node) | Attributes besides `src`/`srcId` |
|------|------|------------------------------|----------------------------------|
| `doc` | root | `Document` | – |
| `paragraph` | block | `Paragraph` | – |
| `heading` | block | `ATXHeading1–6`, `SetextHeading1–2` | `level` |
| `blockquote` | block container | `Blockquote` | – |
| `bullet_list` | block container | `BulletList` | `tight` |
| `ordered_list` | block container | `OrderedList` | `start`, `tight` |
| `list_item` | block container | `ListItem` | `checked: boolean \| null` (task item) |
| `code_block` | block, text only | `FencedCode` (not mermaid), `CodeBlock` | `language` |
| `diagram` | block atom | ` ```mermaid ` fence, `::: mermaid` container | `source`, `syntax` |
| `horizontal_rule` | block atom | `HorizontalRule` | – |
| `table`, `table_row`, `table_header`, `table_cell` | block | `Table`, `TableHeader`, `TableRow`, `TableCell` | `align` per column |
| `raw_block` | block atom | see data-model Placeholder | `source`, `kind`, `label` |
| `text` | inline | text | – |
| `soft_break` | inline | line break inside a paragraph | – |
| `hard_break` | inline | `HardBreak` (two spaces or `\`) | `marker` |
| `image` | inline atom | `Image` | `src`, `alt`, `title` |
| `image_upload` | inline atom | (editor only, never serialized) | `key`, `name` |
| `raw_inline` | inline atom | `HTMLTag`, `Comment`, footnote ref, … | `source`, `kind`, `label` |

| Mark | Source | Attributes |
|------|--------|------------|
| `strong` | `StrongEmphasis` | `marker` (`**`/`__`) |
| `em` | `Emphasis` | `marker` (`*`/`_`) |
| `strike` | `Strikethrough` | – |
| `code` | `InlineCode` | – |
| `link` | `Link`, `Autolink`, `URL` | `href`, `title`, `form: inline \| reference \| autolink`, `ref` |

`toDOM` of every type produces fixed tags and classes. No type renders user text as
markup, and URL attributes go through `isAllowedUrl` (§5).

## 2. Functions

| Function | Signature | Guarantee |
|----------|-----------|-----------|
| `parse` | `(markdown: string) → { doc, snapshot }` | Total: never throws for any string input. Unknown syntax becomes a placeholder |
| `serialize` | `(doc, snapshot) → string` | Rules in §3 |
| `detectStyle` | `(markdown: string) → FileStyle` | Deterministic. Defaults per research R6 |
| `isRoundTripSafe` | `(markdown: string) → boolean` | `serialize(parse(m).doc, …) === m`. Used as the load-time guard |

## 3. Serialization rules

- **S1 (identity)**: `serialize(parse(m)) === m` for every string `m` the guard accepts. In
  the corpus that is 100% of files (SC-001).
- **S2 (equivalence)**: a block whose canonical content equals the canonical content of
  `parse(original slice)` is emitted as the original slice, byte for byte. Canonical
  content is the node type, attributes other than `src`/`srcId`/marker attributes, text
  and marks.
- **S3 (locality)**: if a document differs from `parse(m)` only inside leaf block *B*, the
  line diff of `serialize` against `m` lies within *B*'s lines. For paragraphs and headings
  it lies within the changed lines only.
- **S4 (containers)**: changed children of quotes and list items are prefixed with the
  container's original continuation prefix. Unchanged children and siblings keep their
  exact lines.
- **S5 (gaps)**: the text between two blocks emitted from the source that were adjacent
  there is the original gap. Otherwise the gap is one blank line in the file's line ending.
- **S6 (style)**: freshly serialized content uses `FileStyle`. Inside an existing list, new
  items copy the nearest sibling's marker and indent.
- **S7 (escaping)**: freshly serialized text escapes only characters that would otherwise
  change meaning at that position (CommonMark backslash escapes). Unchanged lines keep
  their original escapes (S2, S3).
- **S8 (placeholders)**: `raw_block` and `raw_inline` are emitted as `source` exactly.
- **S9 (preamble)**: a leading BOM is preserved. The final-newline state of the file is
  preserved, and new content at the end follows it.
- **S10 (no upload markers)**: `image_upload` nodes are never emitted.

## 4. Mode switch

- **M1**: `parse` → (no edits) → `serialize` returns the Markdown-mode text unchanged
  (FR-016).
- **M2**: the cursor maps to the innermost block containing it, in both directions. If no
  block contains it, the cursor goes to the document start.

## 5. URL allow-list (`isAllowedUrl`)

| Input | Display in editor | Markdown |
|-------|-------------------|----------|
| `http:`, `https:`, `mailto:` | `href` set (links). Images: not loaded, "External image" frame | kept |
| relative, `/…` space-root, `wiki:` | link `href` resolved to `/s/{space}/…`. Image resolved as in research R9 | kept |
| `data:image/*` (images only) | shown | kept |
| anything else (`javascript:`, `vbscript:`, `file:`, …) | no `href`/`src`, "not allowed" style | kept verbatim |

The scheme list matches `HtmlSanitizerFactory.AllowedSchemes` (`src/Copernica/Rendering/
HtmlSanitizerFactory.cs:34`). A unit test pins both lists so they cannot drift apart.

## 6. Tests (must pass in CI, `npm test`)

| Test | Covers |
|------|--------|
| `fidelity.test.ts`: round trip over `corpus/**` | S1, S8, S9 → SC-001 |
| `fidelity.test.ts`: single-block edit over `corpus/**` | S2–S5, S7 → SC-002 |
| `style.test.ts` | S6, `detectStyle` table in R6 |
| `serialize.test.ts`: new blocks, lists, quotes, tables, links (reference forms), hard breaks | S4–S7 |
| `modeSwitch.test.ts` | M1, M2 → SC-004 |
| `urls.test.ts` | §5 and the sanitizer list pin |
| `parse.test.ts`: totality fuzz (random strings and CommonMark examples mutated) | `parse` never throws; guard either accepts or rejects |
