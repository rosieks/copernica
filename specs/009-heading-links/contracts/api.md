# API Contract: Sections

No new routes. Two responses gain a field, and the rendered HTML changes in one way. The
source of truth is `specs/001-git-backed-team-wiki/contracts/openapi.yaml`, from which
`src/web/src/api/schema.d.ts` is generated (`npm run gen:api`).

## Schema `Section` (new)

```yaml
Section:
  type: object
  required: [level, id, text]
  properties:
    level: { type: integer, minimum: 1, maximum: 3 }
    id:    { type: string, description: Section address without the user-content- prefix }
    text:  { type: string, description: Visible plain text of the heading }
```

## `GET /api/spaces/{spaceId}/pages/{path}` → `Page`

Adds `sections: Section[]` (required). It lists the H1–H3 headings in document order
(data-model.md). It is empty when `tooLarge` is true or the page has no such headings, and
it describes the requested version when `?version=` is given. Access rules are unchanged:
the field is returned only with the page.

```json
{
  "spaceId": "handbook",
  "path": "guides/sections.md",
  "title": "Sections",
  "html": "<h1 id=\"user-content-sections\">Sections</h1>…",
  "sections": [
    { "level": 1, "id": "sections", "text": "Sections" },
    { "level": 2, "id": "setup", "text": "Setup" },
    { "level": 2, "id": "setup-1", "text": "Setup" },
    { "level": 2, "id": "zażółć-gęślą-jaźń", "text": "Zażółć gęślą jaźń" }
  ],
  "version": { "commitId": "…", "blobId": "…" }
}
```

## `POST /api/render` → render response

Adds `sections: Section[]` (required), computed from the posted Markdown with the same
rules. The visual editor uses it to list the headings of the page being edited.

## Rendered HTML (pages, previews, comments)

- Every `id` attribute that survives sanitization becomes `user-content-{id}`. This applies
  to auto heading ids, author-written ids in raw HTML, and footnote ids. An id that already
  starts with `user-content-` is not prefixed again.
- `href="#…"` values are unchanged. The SPA resolves them (contracts/ui.md).
- Section addresses in links (`page.md#frag`, `wiki:` links, diagram click targets) keep
  passing through unchanged, as today.
- No other attribute is added. In particular, there are no buttons or data attributes from
  the server: the copy control is browser UI.

## Compatibility

- Existing clients ignore `sections`.
- URLs with fragments behave as before or better: same-page native jumps are replaced by
  the SPA's resolution.
- The `Headings_get_ids_for_anchors` test now expects `id="user-content-getting-started"`.
