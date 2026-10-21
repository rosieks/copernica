# Data Model: Visual Page Editor

**Feature**: [spec.md](spec.md) | **Date**: 2026-10-21

This feature adds **no persisted server data and no API changes**. Content stays in git;
the entities below live in the browser only.

## Interface preference *(browser `localStorage`)*

Extends the 002 table (`specs/002-accessible-wiki-ui/data-model.md`).

| Key | Type | Default | Rules |
|-----|------|---------|-------|
| `copernica.editorMode` | `"visual"` \| `"markdown"` | `"visual"` (absent ⇒ visual) | FR-017. Written only when the user switches mode. It is not written when the load-time guard falls back to Markdown (FR-019). Unknown values fall back to the default. Storage errors are caught. |

`copernica.editorTab` still applies, but only in Markdown mode.

## Draft *(browser `sessionStorage`, unchanged shape)*

`Draft { markdown, message, base?, attachments? }` (`src/web/src/drafts.ts`).
- `markdown` is always Markdown text, in both modes.
- In visual mode it is refreshed from `serialize()` on a 200 ms idle debounce and before
  save, mode switch and review.
- Restoring a draft parses `markdown` into a fresh visual document.

## Editor document *(in memory)*

A ProseMirror document of the schema in [contracts/fidelity.md](contracts/fidelity.md) §1.

### Source block

The attributes carried by every block node that came from the loaded text:

| Attribute | Type | Meaning |
|-----------|------|---------|
| `src` | `{ from: number, to: number } \| null` | Offsets of the block's exact text in the **source snapshot**. `null` for blocks created in the editor |
| `srcId` | `number \| null` | Index of the block in source order; used to decide whether two blocks were adjacent in the source (gap preservation) |

- Copying a block inside the document copies `src`. This is harmless: the original text is
  emitted only when the content is equivalent to it (R4).
- Splitting a block keeps `src` on both parts; the comparison then fails for the changed
  part, which is serialized fresh.

### Source snapshot

| Field | Type | Meaning |
|-------|------|---------|
| `text` | `string` | The Markdown the document was parsed from (page source, restored draft, or Markdown-mode text at the last switch) |
| `style` | `FileStyle` | Detected style (below) |
| `preamble` | `string` | Leading BOM and front-matter bytes when present (front matter is also a placeholder) |

The snapshot is replaced on every Markdown → visual switch.

### Placeholder (`raw_block`, `raw_inline`)

| Attribute | Type | Meaning |
|-----------|------|---------|
| `source` | `string` | Verbatim text, emitted unchanged |
| `kind` | enum | `html`, `comment`, `front-matter`, `toc`, `container`, `footnote`, `footnote-ref`, `link-definition`, `grid-table`, `definition-list`, `unknown` |
| `label` | `string` | Short visible and accessible label, e.g. "HTML block", "Table of contents (Azure DevOps)" |

Read-only atom. It can be moved or deleted as a whole.

### Diagram

| Attribute | Type | Meaning |
|-----------|------|---------|
| `source` | `string` | Diagram text (without fence/container lines) |
| `syntax` | `"fence"` \| `"container"` | ` ```mermaid ` or `::: mermaid` |
| `src`, `srcId` | as above | The original block, kept byte-for-byte while `source` is unchanged |

### Image upload placeholder (`image_upload`)

| Attribute | Type | Meaning |
|-----------|------|---------|
| `key` | `string` | Upload key from `useImageUploads` |
| `name` | `string` | File name shown while uploading |

It is never serialized: if one is still present at save, the existing 003 rule applies and
save waits for or drops the pending upload.

### FileStyle

`{ bullet: "-"|"*"|"+", ordered: { delimiter: "."|")", increment: boolean },
emphasis: "*"|"_", strong: "**"|"__", fence: { char: "`"|"~", length: number },
heading: "atx"|"setext", closingHashes: boolean, rule: string, eol: "\n"|"\r\n",
finalNewline: boolean, listIndent: number, tablePipes: { leading: boolean, trailing: boolean } }`.

Detection rules and defaults: [research.md R6](research.md#r6-file-style-detection).

## State transitions: editor mode

```text
open editor ──► read preference ──► visual? ──► parse + load-time guard ──ok──► VISUAL
                                       │                              └─fail─► MARKDOWN (message, preference untouched)
                                       └─ markdown ───────────────────────────► MARKDOWN
VISUAL ──switch──► serialize → MARKDOWN (preference := markdown)
MARKDOWN ──switch──► parse + guard ──ok──► VISUAL (preference := visual)
                                    └─fail─► stay MARKDOWN with message
```
