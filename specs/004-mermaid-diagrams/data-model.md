# Data Model: Diagrams in Markdown Pages

No stored data. Diagram text lives in the page Markdown, which is the git source of truth.
Nothing is written to the database or the data volume.

## Diagram block *(derived while rendering, not stored)*

| Field | Source | Rules |
|-------|--------|-------|
| `Source` | Fenced ` ```mermaid ` or `::: mermaid` block | ≤ 20 000 characters to be drawn; longer → `TooLarge` |
| `Type` | First keyword of `Source` | Mapping in [contracts/rendering.md](contracts/rendering.md) |
| `Name` | `accTitle:`, else the diagram `title`, else `"<Type> diagram"` | ≤ 200 characters |
| `Description` | `accDescr:` / `accDescr { … }` | Optional, ≤ 1000 characters |
| `Links` | `click … "<url>"` statements | Each target rewritten by `WikiLinkRewriter`; rejected targets dropped |

## Figure state *(browser only, per page view)*

```text
loading ──(rendered)──▶ drawn ⇄ showing source
loading ──(error | 10 s timeout)──▶ error
(too large on the server) ──▶ too-large
drawn ──(theme change)──▶ loading ──▶ drawn
```

## Render cache *(browser memory, per session)*

Key `(Source, theme)` → SVG text. It is never persisted and is dropped on reload.
