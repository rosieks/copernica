# Data Model: Page Front Matter

Nothing is stored. Everything below is derived from a page file's content when the page is
rendered and cached with the rendered page (Constitution V). Research references: R1–R7.

## FrontMatterBlock (server, internal)

The leading YAML block of a file (R1).

| Field | Type | Notes |
|-------|------|-------|
| `Start`, `End` | int | Character range of the whole block in the file, delimiters included |
| `BodyStart`, `BodyEnd` | int | Range of the YAML text between the delimiters |
| `Body` | string | The YAML text |

Recognition (FR-001): first line is exactly `---` (after an optional BOM, trailing spaces
allowed); the block ends at the next line that is exactly `---` or `...`. No closing line
→ no block. `+++` (TOML) → no block.

## YamlValue (server, internal; R3)

A tree built from YamlDotNet parser events:

- `Text(string Value, ScalarStyle Style, int Start, int End)`: scalar as written; `Start`/`End`
  are offsets in `Body` (used by R6). `IsNull` for plain `~`, `null`, `Null`, `NULL`, empty.
- `List(IReadOnlyList<YamlValue> Items)`
- `Map(IReadOnlyList<(string Key, YamlValue Value)> Entries)`: entries in written order.

Validation (R4) → the block is **unreadable** when any holds: syntax error; body over
32 KiB; depth over 16; over 2,000 nodes after alias expansion; a scalar over 8 KiB; more than
one document; top level not a `Map`; a non-scalar key; the same key string twice in one map.

## FrontMatter (API: `frontMatter`)

The interpreted view returned with a page or a preview (contracts/api.md).

| Field | Type | Source | Rule |
|-------|------|--------|------|
| `readable` | bool | | false → only `raw` is set |
| `raw` | string? | block body | only when `readable` is false |
| `title` | string? | `title` | non-null scalar, trimmed, non-empty |
| `description` | string? | `description`, else `summary` | non-null scalar, trimmed |
| `tags` | string[] | `tags`, else `keywords` | list of scalars, or one scalar split on `,`; trimmed; empty and duplicate (case-insensitive) dropped; written order |
| `status` | `"draft" \| "deprecated" \| "archived"`? | `status` | scalar, case-insensitive match; any other value → Properties |
| `owners` | string[] | `owner` | scalar or list of scalars |
| `authors` | string[] | `authors`, else `author` | scalar or list of scalars |
| `aliases` | string[] | `aliases` | scalar or list of scalars |
| `properties` | Property[] | everything else | written order |

Field names match case-insensitively. A known field goes to `properties` instead when:
its value has the wrong shape (e.g. `title: [a, b]`, Docusaurus `authors` objects); its
alias lost to the canonical name (`summary` next to `description`); it is a later
case variant of a field already used (`Title` after `title`); or (`status`) its value is
not one of the three banner values. Position fields (`order`, `weight`,
`sidebar_position`) are ordinary properties (FR-014).

### Property

| Field | Type |
|-------|------|
| `name` | string (as written) |
| `value` | PropertyValue |

### PropertyValue (tagged union)

- `{ "kind": "text", "text": string, "href"?: string }`: null scalars have `text: ""`.
  `href` is present only when the trimmed text, without whitespace, is an absolute `http`,
  `https` or `mailto` URI (normalized); the page then shows the value as a link.
- `{ "kind": "list", "items": PropertyValue[] }`
- `{ "kind": "map", "entries": Property[] }`

## RenderedMarkdown (server, changed)

`RenderedMarkdown(string Html, IReadOnlyList<Section> Sections, FrontMatter? FrontMatter)`:
`FrontMatter` is null when the file has no block. Cached with the HTML per
(space, commit, blob, path) as today.

## Page (changed)

- `Title` rule (R5): readable `frontMatter.title` → first level-1 heading → file name.
- `PageDto` gains `FrontMatter? FrontMatter`. Too-large pages: `null`.

## Rename (state change, R6)

| Page has | Rename with new title does |
|----------|----------------------------|
| readable front matter with `title` | replaces only the `title` scalar's characters; headings untouched |
| no block, unreadable block, or no `title` | replaces the first level-1 heading as today (005) |

Either way it is one commit together with the move, as today.
