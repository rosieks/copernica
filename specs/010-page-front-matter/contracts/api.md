# API Contract: Front Matter

No new routes. Two responses gain a field, the page title rule changes, and the rendered
HTML no longer contains the front matter block. The source of truth is
`specs/001-git-backed-team-wiki/contracts/openapi.yaml`, from which
`src/web/src/api/schema.d.ts` is generated (`npm run gen:api`). Field rules:
[data-model.md](../data-model.md).

## Schemas (new)

```yaml
FrontMatter:
  type: object
  required: [readable, tags, owners, authors, aliases, properties]
  properties:
    readable:    { type: boolean, description: false when the block could not be read (syntax error, limits, duplicate keys) }
    raw:         { type: [string, 'null'], description: The block's YAML text; set only when readable is false }
    title:       { type: [string, 'null'] }
    description: { type: [string, 'null'] }
    tags:        { type: array, items: { type: string } }
    status:      { type: [string, 'null'], enum: [draft, deprecated, archived, null] }
    owners:      { type: array, items: { type: string } }
    authors:     { type: array, items: { type: string } }
    aliases:     { type: array, items: { type: string } }
    properties:  { type: array, items: { $ref: '#/components/schemas/FrontMatterProperty' } }

FrontMatterProperty:
  type: object
  required: [name, value]
  properties:
    name:  { type: string }
    value: { $ref: '#/components/schemas/FrontMatterValue' }

FrontMatterValue:
  oneOf:
    - type: object
      required: [kind, text]
      properties:
        kind: { const: text }
        text: { type: string }
        href: { type: string, description: Only for http, https and mailto addresses }
    - type: object
      required: [kind, items]
      properties:
        kind:  { const: list }
        items: { type: array, items: { $ref: '#/components/schemas/FrontMatterValue' } }
    - type: object
      required: [kind, entries]
      properties:
        kind:    { const: map }
        entries: { type: array, items: { $ref: '#/components/schemas/FrontMatterProperty' } }
  discriminator: { propertyName: kind }
```

When `readable` is false, every other field is empty (`null` or `[]`).

## `GET /api/spaces/{spaceId}/pages/{path}` → `Page`

- Adds `frontMatter: FrontMatter | null` (required, nullable). `null` when the file has no
  front matter block or `tooLarge` is true. With `?version=` it describes that version.
  Access rules unchanged: returned only with the page.
- `title` follows the new rule: readable `frontMatter.title` → first level-1 heading →
  file name.
- `html` never contains the block (no `<hr>`, paragraph or heading made from it).
- `sections` is unchanged except that accidental setext headings made from front matter
  disappear (research R1).

```json
{
  "spaceId": "handbook",
  "path": "ops/release-process.md",
  "title": "Release process",
  "html": "<p>Releases are cut every …</p>",
  "sections": [],
  "frontMatter": {
    "readable": true,
    "raw": null,
    "title": "Release process",
    "description": "How we cut, test and publish a release.",
    "tags": ["release", "ci"],
    "status": "draft",
    "owners": ["Platform team"],
    "authors": [],
    "aliases": [],
    "properties": [
      { "name": "weight", "value": { "kind": "text", "text": "20" } },
      { "name": "reviewers", "value": { "kind": "list", "items": [
        { "kind": "text", "text": "Ana" }, { "kind": "text", "text": "Bo" } ] } }
    ]
  },
  "version": { "commitId": "…", "blobId": "…" },
  "isCurrent": true,
  "tooLarge": false
}
```

Unreadable block:

```json
"frontMatter": {
  "readable": false,
  "raw": "title: Release\ntitle: Again\n",
  "title": null, "description": null, "tags": [], "status": null,
  "owners": [], "authors": [], "aliases": [], "properties": []
}
```

## `POST /api/render` → 200

Adds `frontMatter: FrontMatter | null` (required, nullable) next to `html` and `sections`,
computed from the posted Markdown. The visual editor's metadata card posts just the block
(research R9). Request, limits and access rules unchanged.

## Tree (`TreeNode.title`)

Uses the new title rule. No shape change.

## Rename (`POST` tree move/rename with a new title, 005)

Request and response unchanged. Effect on the file: data-model.md "Rename". Still one
commit; the commit diff for a front matter title shows only the `title` line changed.

## Security notes

- All values are plain strings; clients MUST render them as text (contracts/ui.md). The
  only links are property values with an `href`, which the server sets for http, https and
  mailto addresses only.
- `raw` is the unparsed block for display as preformatted text only.
- Parsing limits: research R4. Exceeding them yields `readable: false`, never an error
  response.
