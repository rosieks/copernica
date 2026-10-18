# Rendering Contract: Diagram Blocks (server → browser)

What the server's Markdown pipeline emits for diagram blocks. This is the only place where
diagram text becomes HTML ([research.md](../research.md) R2). Used for pages, page
versions and `/api/render` (preview). Comments in discussions are unchanged and keep
showing diagram text as code (`MarkdownRenderer.Render(…, diagrams: false)`).

## Input forms

| Form | Example | Recognised when |
|------|---------|-----------------|
| Fenced code block | ` ```mermaid ` … ` ``` ` | Info string is `mermaid` (case-insensitive, first word) |
| Azure DevOps Wiki container | `::: mermaid` … `:::` | Custom container whose info is `mermaid` (block containers only; the inline `::text::` form stays disabled so text like `std::vector` is unchanged) |

Any other code block renders as before.

## Output

```html
<figure class="diagram"
        data-diagram="mermaid"
        data-diagram-type="Sequence"
        data-diagram-name="Login sequence"
        data-diagram-description="How a user signs in with the identity provider"
        data-diagram-too-large="true">          <!-- only when over the limit -->
  <pre class="diagram__source"><code>sequenceDiagram
  accTitle: Login sequence
  …HTML-escaped source…</code></pre>
  <ul class="diagram__links" aria-label="Links in this diagram">   <!-- only when click links exist -->
    <li><a href="/s/handbook/guides/setup.md">Setup</a></li>
  </ul>
</figure>
```

| Attribute | Value | Rules |
|-----------|-------|-------|
| `data-diagram` | `mermaid` | Fixed |
| `data-diagram-type` | Readable type | From the first keyword: `flowchart`/`graph` → Flowchart, `sequenceDiagram` → Sequence, `classDiagram` → Class, `stateDiagram(-v2)` → State, `erDiagram` → Entity relationship, `gantt` → Gantt, `pie` → Pie chart, `gitGraph` → Git graph, `journey` → User journey, `mindmap` → Mind map, `timeline` → Timeline, `quadrantChart` → Quadrant chart, `xychart(-beta)` → XY chart, anything else → Mermaid |
| `data-diagram-name` | Text, ≤ 200 chars | `accTitle:` value, else the `title` of the diagram (gantt, pie, …), else `"<Type> diagram"` |
| `data-diagram-description` | Text, ≤ 1000 chars, optional | `accDescr: …` or `accDescr { … }` |
| `data-diagram-too-large` | `true`, optional | Source longer than 20 000 characters |

**Links list.** `click <id> "<url>" ["tooltip"]` and `click <id> href "<url>" …` statements
produce one `<li><a>` each:
- the label is the tooltip, or else the node id;
- the `href` goes through `WikiLinkRewriter`, exactly like a text link;
- targets it rejects (`javascript:`, `data:`, escaping paths) are left out;
- `click <id> call fn()` statements are ignored.

**Sanitizer.** The HtmlSanitizer allow-list gains:
- `figure`;
- the `diagram`, `diagram__source` and `diagram__links` classes;
- the five `data-diagram*` attributes above;
- `aria-label` (the links list).

The source text inside `<code>` is escaped, so it can never produce markup.

**Plain text.** `PlainTextExtractor` (001, used for discussion anchoring) includes the source
text and the link labels, in document order. This matches the browser's `textContent` of
the figure (research R6).
