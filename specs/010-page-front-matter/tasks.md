---

description: "Task list for 010 Page Front Matter"
---

# Tasks: Page Front Matter

**Input**: Design documents from `specs/010-page-front-matter/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included.
- The constitution's Quality Gates require automated tests for content rendering and
  sanitization, and for storage write paths (rename rewrites the `title` value).
- SC-001–SC-005 and SC-007 need automated checks.
- Server: xUnit in `tests/Copernica.Tests` and `tests/Copernica.IntegrationTests`.
- Browser: Vitest next to the code in `src/web/src`.
- End to end: Playwright in `tests/e2e/front-matter.spec.ts`.

**Organization**: Tasks are grouped by user story in priority order: US1, US2, US4 (P1),
then US3 (P2).
- Recognition, parsing, limits, field mapping and the `frontMatter` API field are
  foundational, because every story reads them.
- After Phase 2 the raw block already disappears from pages (the HTML no longer contains
  it), but nothing shows the metadata until US1. Phase 2 and US1 should therefore ship
  together.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to

Conventions: `web/` means `src/web/src/`. UI strings are English (Constitution I).

---

## Phase 1: Setup

**Purpose**: The new dependency and shared test data.

- [X] T001 Add YamlDotNet:
  - `<PackageVersion Include="YamlDotNet" Version="…" />` in `Directory.Packages.props`, in the "Shipped" group, with the comment "(justified in specs/010-page-front-matter/research.md R2)";
  - version: 16.3.0, or the newest 16.x release if a newer one exists (check `dotnet package search YamlDotNet --exact-match` or nuget.org); its license must be MIT;
  - `<PackageReference Include="YamlDotNet" />` in `src/Copernica/Copernica.csproj`;
  - restore so `src/Copernica/packages.lock.json` is updated (`dotnet restore --force-evaluate` if the lockfile is locked mode).
- [X] T002 [P] Create the fixture corpus `tests/fixtures/front-matter/` (research R10):
  - `corpus/`: at least 30 `.md` files in the styles of Jekyll posts (`layout`, `date`, `categories`), Hugo (`weight`, `draft: true`, `summary`), Docusaurus (`sidebar_position`, `authors` as a list of `{name, url}` objects, `keywords`), MkDocs (`description`), Obsidian (`aliases`, `tags` as a single comma-separated string, `tags` as a list); include: block scalars (`description: >` and `|`), single and double quoted values with escapes, flow lists, nested maps, CRLF line endings, a BOM, `...` as the closing line, an empty block (`---` then `---`), comments inside the block, `title` with and without a body `# ` heading, `title` differing from the body heading, and a block whose last line is followed by `---` that today renders as a setext heading;
  - `corpus/expected.json`: per file name, the expected `frontMatter` object exactly as contracts/api.md (or `null`) and the expected page `title`;
  - `hostile/`: `script-values.md` (`title: "<script>alert(1)</script>"`, `description: <img src=x onerror=alert(1)>`, `owner: "javascript:alert(1)"`, `tags: ["**bold**", "[x](javascript:alert(1))"]`), `alias-bomb.md` (billion-laughs pattern, 9 levels of 9 aliases), `deep.md` (nesting depth 50), `huge.md` (40 KiB block), `custom-tags.md` (`!!python/object/apply:os.system ["x"]`, `!<tag:yaml.org,2002:js/function>`), `duplicate-keys.md` (`title` twice), `tabs.md` (tab indentation), `unclosed.md` (opening `---` and no closing line), `toml.md` (`+++` block), `not-mapping.md` (block is a list). A second YAML document cannot occur inside the block, because the locator ends the block at the first `---` or `...` line; the parser still rejects it (T009) and T005 covers it with an inline string;
  - `hostile/expected.json`: per file, `readable` and whether a block exists.
- [X] T003 [P] Seed the e2e pages in `tests/e2e/server.mjs` (`handbook` files map), per quickstart.md "Prerequisites":
  - `ops/release-process.md` (no `# ` heading; `title`, `description`, `tags: [release, ci]`, `status: deprecated`, `owner: Platform team`, `weight: 20`, `reviewed: 2026-09-01`, list `reviewers`, nested map `links`) and body text;
  - `ops/broken-meta.md` (duplicate `title` key, body `# Broken meta`);
  - `ops/hostile-meta.md` (copy of `tests/fixtures/front-matter/hostile/script-values.md`).

  Keep existing seeded content intact (append, do not rewrite).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Recognize the block, parse it safely, map fields, remove it from the HTML and
return `frontMatter` from the API.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests

- [X] T004 [P] Add `tests/Copernica.Tests/Rendering/FrontMatterLocateTests.cs`:
  - `FrontMatter.Locate` finds the block for `---\n…\n---\n`, `---\r\n…\r\n---\r\n`, BOM + `---`, `---   ` (trailing spaces), closing `...`, and an empty block;
  - returns no block for: a blank line before `---`, text before `---`, no closing line, `+++` blocks, `----`;
  - `BodyStart`/`BodyEnd` are exact (body excludes delimiter lines);
  - agreement probe (research R1): for every file in `tests/fixtures/front-matter/corpus/` and `hostile/`, the Markdig parse with `UseYamlFrontMatter()` has a `YamlFrontMatterBlock` exactly when `Locate` finds a block, with the same start line and end line. If a case disagrees, the test documents it and the renderer follows `Locate` (T010).

  Read fixtures relative to the repository root the same way `SectionExtractorTests` reads `tests/fixtures/sections/slugs.json`.
- [X] T005 [P] Add `tests/Copernica.Tests/Rendering/FrontMatterParserTests.cs`:
  - value tree: scalars keep their written text (`date: 2026-09-01` → `"2026-09-01"`, `n: 007` → `"007"`, `b: yes` → `"yes"`); block scalars are folded/literal per YAML; quoted escapes are decoded; plain `~`, `null`, `Null`, `NULL` and empty values are null; maps keep written order;
  - limits (research R4), each making `readable: false` with `raw` = block body: body over "32 KiB"; depth over "16"; more than "2,000" nodes after alias expansion (alias bomb); a scalar over "8 KiB"; duplicate exact key; a non-scalar key (`? [a, b]: x`); top level not a mapping; YAML syntax error; tab indentation;
  - custom tags (`!!python/object…`) do not throw and give a text value, no object;
  - field mapping per data-model.md "FrontMatter": aliases (`summary`, `keywords`, `author`), canonical name wins and the alias goes to `properties`; case-insensitive names with the first case variant used and later ones in `properties`; `tags` from a list and from `"a, b, , A"` → `["a", "b"]` (trim, drop empty, drop case-insensitive duplicates, keep order); `status` `Deprecated` → `"deprecated"`, `status: review` → property; `title: [a, b]` → property and `title` null; Docusaurus `authors` objects → property; `owner` scalar or list → `owners`; `order`, `weight`, `sidebar_position` always in `properties` (FR-014); null known field → absent; null unknown field → property with `text: ""`;
  - every `tests/fixtures/front-matter/corpus/` file yields the object in `corpus/expected.json`, and every `hostile/` file matches `hostile/expected.json`;
  - performance guard: parsing every hostile file takes under 50 ms each on CI (generous bound; SC-004).
- [X] T006 [P] Add `tests/Copernica.Tests/Rendering/FrontMatterRenderingTests.cs`:
  - a page with front matter renders no `<hr>`, no `key: value` text and no heading made from the block (the setext case from the corpus);
  - `RenderWithSections` returns `FrontMatter` for a page with a block and `null` without one;
  - hostile values never appear in the HTML at all (they are not in the HTML; they are only in `FrontMatter`);
  - SC-007: for every existing rendering test input without front matter (reuse the inputs of `SanitizationTests` and `SectionExtractorTests`), HTML and sections are identical to `Render` before the change: compare against a hard-coded expected string for 3 representative pages;
  - section ids of real headings below a front matter block are the same as when the block is removed from the file.
- [X] T007 [P] Add integration tests in `tests/Copernica.IntegrationTests/Spaces/FrontMatterTests.cs` (follow `SectionsTests.cs`):
  - `GET /api/spaces/{id}/pages/{path}` returns `frontMatter` as in contracts/api.md for a page with a block, `frontMatter: null` without one, `readable: false` with `raw` for a duplicate-key block, and the older value for `?version={older commit}`;
  - `frontMatter` is `null` for a too-large page;
  - `POST /api/render` returns `frontMatter` for the posted Markdown (including a body that is only the block);
  - JSON names are camelCase and `value.kind` is `"text" | "list" | "map"`.

### Implementation

- [X] T008 Add `src/Copernica/Rendering/FrontMatter.cs`:
  - `public sealed record FrontMatterBlock(int Start, int End, int BodyStart, int BodyEnd, string Body)`;
  - `public static FrontMatterBlock? Locate(string text)` implementing FR-001 as in data-model.md: optional `﻿`, first line `---` with only trailing spaces/tabs, ends at the next line that (trimmed of trailing whitespace) is exactly `---` or `...`; handles `\n` and `\r\n`; returns null when not closed;
  - API records (contracts/api.md): `public sealed record FrontMatter(bool Readable, string? Raw, string? Title, string? Description, IReadOnlyList<string> Tags, string? Status, IReadOnlyList<string> Owners, IReadOnlyList<string> Authors, IReadOnlyList<string> Aliases, IReadOnlyList<FrontMatterProperty> Properties)`, `public sealed record FrontMatterProperty(string Name, FrontMatterValue Value)`, and `FrontMatterValue` serialized as `{ kind: "text", text }`, `{ kind: "list", items }`, `{ kind: "map", entries }` (use `[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]` with `[JsonDerivedType]` names `text`, `list`, `map`, matching the existing JSON options; check the app's `JsonSerializerContext`, if any, and register the types there);
  - `FrontMatter.Unreadable(string raw)` factory with empty lists. Makes T004 (Locate part) pass.
- [X] T009 Add `src/Copernica/Rendering/FrontMatterParser.cs` (research R2–R4, data-model.md):
  - `public static FrontMatter Parse(string body)`;
  - reject before parsing when `body.Length > 32 * 1024`;
  - use `YamlDotNet.Core.Parser` over a `StringReader` and walk events (`StreamStart`, `DocumentStart`, `MappingStart`, `SequenceStart`, `Scalar`, `AnchorAlias`, …) into an internal tree `YamlText(string Value, ScalarStyle Style, int Start, int End, bool IsNull)` / `YamlList` / `YamlMap(List<(string Key, YamlNode Value)>)`; `Start`/`End` from `Scalar.Start.Index`/`End.Index`;
  - anchors: remember anchored nodes; on `AnchorAlias` re-use the node and add its node count to the running total; stop with "unreadable" at "2,000" nodes, depth "16", scalar length over "8 KiB", a second `DocumentStart`, a non-scalar key, a repeated exact key, or a non-mapping root; catch `YamlException` → unreadable;
  - null: plain style and value in `"" | "~" | "null" | "Null" | "NULL"`;
  - map the root to `FrontMatter` per data-model.md "FrontMatter" table and rules (case-insensitive names, aliases, shapes, first case variant wins, `status` only `draft|deprecated|archived` case-insensitive and lowercased, position fields stay properties, null known field absent, null unknown field `text: ""`);
  - expose `internal static YamlText? FindTitleScalar(string body)` for rename (T020). Makes T005 pass.
- [X] T010 Change `src/Copernica/Rendering/MarkdownRenderer.cs` and `SectionExtractor.cs`:
  - add `.UseYamlFrontMatter()` to `_pipeline` and `_spanPipeline`;
  - `RenderedMarkdown` becomes `record RenderedMarkdown(string Html, IReadOnlyList<Section> Sections, FrontMatter? FrontMatter = null)` (update existing `new RenderedMarkdown(...)` call sites, e.g. the too-large case in `PageService`);
  - in `RenderWithSections`, `FrontMatter.Locate(markdown)` → `FrontMatterParser.Parse(block.Body)` when found, else null;
  - if T004 found a disagreement case: remove the `YamlFrontMatterBlock` from the document when `Locate` returns null, or leave the case documented if Markdig never accepts a shape `Locate` rejects. Makes T006 pass.
- [X] T011 Wire `frontMatter` into the API:
  - `src/Copernica/Spaces/PageService.cs`: add `FrontMatter? FrontMatter` to `PageDto` (after `Sections`), from `rendered.FrontMatter`; `null` when `tooLarge`;
  - `src/Copernica/Api/PageWriteEndpoints.cs` render endpoint: `new { html, sections, frontMatter = rendered.FrontMatter }`. Makes T007 pass.
- [X] T012 Update `specs/001-git-backed-team-wiki/contracts/openapi.yaml` per contracts/api.md:
  - add `FrontMatter`, `FrontMatterProperty`, `FrontMatterValue` schemas;
  - add `frontMatter` (required, `oneOf: [FrontMatter, null]`) to `Page` and the `/render` 200 response (also add it to that response's `required`);
  - update the `title` description: "front matter title, else first level-1 heading, else file name";
  - regenerate `src/web/src/api/schema.d.ts` with `npm --prefix src/web run gen:api` and add `frontMatter: null` to TypeScript test doubles that build `Page` objects.
- [X] T013 [P] Update `SECURITY.md`: add YamlDotNet (MIT) to the third-party list, and one sentence under "Safe content": front matter is parsed on the server with size, depth and alias limits, never constructs objects from YAML tags, and its values are shown as text only.

**Checkpoint**: Pages no longer show the raw block, and the API returns `frontMatter`. `dotnet test` and `npm --prefix src/web test` pass.

---

## Phase 3: User Story 1 - Metadata no longer clutters the top of the page (Priority: P1) 🎯 MVP

**Goal**: Description, people, tags and the status banner appear above the content;
unreadable blocks show a warning with the raw text.

**Independent Test**: quickstart scenario 1 steps 1 and 3, scenario 3, scenario 5.

### Tests for User Story 1

- [X] T014 [P] [US1] Add `web/frontmatter/PageMeta.test.tsx`:
  - renders nothing for `null` and for a readable object with no displayable fields;
  - status banners per contracts/ui.md table (title text "Draft"/"Deprecated"/"Archived", explanation text, Callout tone class);
  - description paragraph; "Owner"/"Owners" and "Author"/"Authors" labels by count;
  - tags: `getByRole('list', { name: 'Tags' })` with one `listitem` per tag; no links or buttons inside; nothing focusable;
  - wrapper `getByRole('region', { name: 'Page metadata' })`;
  - unreadable: warning "This page's metadata could not be read.", a closed `details` "Show metadata source" whose `pre` text equals `raw`;
  - hostile strings (`<script>…`, `<img onerror>`, `**bold**`, `javascript:…`) appear literally as text, `container.querySelector('script, img, strong, a')` is null.
- [X] T015 [P] [US1] Add `tests/e2e/front-matter.spec.ts`, US1 part (quickstart scenarios 1.1, 1.3, 3, 5):
  - `ops/release-process.md`: the article has no `hr` before the first paragraph and no text `status:`; the banner "Deprecated" is visible; tags list has "release" and "ci"; pressing Tab from the page actions never focuses a tag;
  - a page without front matter is unchanged (existing page snapshot of headings and first paragraph);
  - `ops/broken-meta.md` shows the warning and "Show metadata source" reveals the raw YAML;
  - `ops/hostile-meta.md`: no dialog event fires (`page.on('dialog')` fails the test), values are visible literally;
  - History → previous version of `ops/release-process.md` after a commit changing `status` shows the older banner (create the commit via the API in the test, as other e2e tests do).

### Implementation for User Story 1

- [X] T016 [US1] Add `web/frontmatter/PageMeta.tsx` per contracts/ui.md "Page metadata" (all parts except Properties, which is US3):
  - `export function PageMeta({ frontMatter }: { frontMatter: Schemas['FrontMatter'] | null | undefined })`;
  - `<section aria-label="Page metadata" className="page-meta">` containing, in order and only when present: status `Callout` (draft → `tone="info"`, deprecated/archived → `tone="warning"`, title and text exactly as the contracts/ui.md table), `<p className="page-meta__description">`, a `<dl className="page-meta__people">` (Owner/Owners, Author/Authors; names joined with ", "), `<ul aria-label="Tags" className="page-meta__tags">` with `<li className="page-meta__tag">`;
  - unreadable: `Callout tone="warning" title="This page's metadata could not be read."` and `<details><summary>Show metadata source</summary><pre>{raw}</pre></details>`;
  - text only: no `dangerouslySetInnerHTML`; return `null` when nothing to show.
- [X] T017 [P] [US1] Add `web/frontmatter/frontmatter.css` and import it in `web/main.tsx` next to `sections.css`:
  - spacing between the parts with existing space tokens; description as lead text (existing lead/muted tokens);
  - tag chips: inline-flex list, wrap, gap, border radius and background from existing badge/chip tokens if present (look in `web/ui/`), AA contrast in light and dark;
  - `overflow-wrap: anywhere` on values and `pre` with `white-space: pre-wrap`; no horizontal scroll at 320 px;
  - `forced-colors` borders for chips; print: keep metadata, hide nothing.
- [X] T018 [US1] Render `PageMeta` in `web/pages/PageView.tsx`: after `<PageInfo …/>` and before the article wrapper, `{!loaded.tooLarge && <PageMeta frontMatter={loaded.frontMatter} />}`. It stays outside `<article>`, so discussions, section links and highlights are unaffected. Makes T014 and T015 pass.

**Checkpoint**: Imported pages look clean; T014 and T015 pass.

---

## Phase 4: User Story 2 - The page title comes from front matter (Priority: P1)

**Goal**: `title` names the page everywhere; rename updates the `title` value in place.

**Independent Test**: quickstart scenario 2.

### Tests for User Story 2

- [X] T019 [P] [US2] Add/extend `tests/Copernica.Tests/Spaces/PageTitleTests.cs` and add `tests/Copernica.Tests/Spaces/FrontMatterTitleTests.cs`:
  - `PageTitle.Resolve`: front matter `title` wins over the first `# ` heading and the file name; empty/whitespace/null/list `title` falls back; unreadable block falls back; `Locate` replaces the old scan (a `# ` line inside the block is never a heading; existing tests still pass);
  - every corpus file's resolved title equals `corpus/expected.json` `title` (SC-002);
  - `FrontMatterTitle.Replace(content, "New title")` per research R6 for: plain (`title: Old` → `title: New title`), plain needing quotes (`Release: v2`, `#1`, `true`, `123`, ` lead`, `a #b` → double-quoted), double-quoted with `"` and `\` in the new value, single-quoted with `'` in the new value, folded/literal block scalar → one double-quoted line, CRLF file, BOM file, trailing comment after the value (`title: Old # note` keeps ` # note`);
  - for each: re-parsing gives `title == "New title"`, and the content outside the replaced scalar range is byte-identical;
  - returns null when there is no readable block or no `title` scalar.
- [X] T020 [P] [US2] Extend the rename integration tests in `tests/Copernica.IntegrationTests/` (find the existing 005 rename/retitle test and follow it):
  - renaming a page with front matter `title` and a different `# ` heading changes only the `title` line (plus the move) in one commit; the heading is unchanged;
  - renaming a page without front matter still rewrites the first heading (regression);
  - the tree (`TreeNode.title`) shows the front matter title before and after.

### Implementation for User Story 2

- [X] T021 [US2] Change `src/Copernica/Spaces/PageTitle.cs`:
  - `Resolve`: `FrontMatter.Locate(content)` → when found, `FrontMatterParser.Parse(block.Body)`; if `Readable` and `Title` is non-empty, return it; else first level-1 heading; else file name;
  - in `FirstHeading`, replace the hand-written front matter scan with skipping to `block.End` from `Locate`, so the block rule lives in one place. Keep `ReplaceFirstHeading` behaviour.
- [X] T022 [US2] Add `src/Copernica/Spaces/FrontMatterTitle.cs`:
  - `public static string? Replace(string content, string title)`: locate the block, `FrontMatterParser.FindTitleScalar(block.Body)` (first case-insensitive `title` key with a scalar value; null if unreadable), and replace `content[(block.BodyStart + scalar.Start)..(block.BodyStart + scalar.End)]` with the encoded title;
  - encoding per research R6: keep double/single-quoted style with escaping (`\\`, `\"` / `''`); plain stays plain only when safe (no leading `-?:,[]{}#&*!|>'"%@` or backtick, no `: `, no ` #`, no leading/trailing whitespace, not matching `^(~|null|true|false|yes|no|on|off)$` case-insensitively, not numeric), else double-quoted; block scalars become double-quoted; make sure the scalar end mark does not swallow a trailing comment or newline (trim the replaced range to the scalar text). Makes T019 pass.
- [X] T023 [US2] Use it in `src/Copernica/Spaces/TreeOperations.cs` rename: where `operation.Retitle` is applied, `updated = FrontMatterTitle.Replace(current, title) ?? PageTitle.ReplaceFirstHeading(current, title) ?? updated` (with `current = updated ?? text.Value`). Makes T020 pass.
- [X] T024 [P] [US2] Extend `tests/e2e/front-matter.spec.ts` with quickstart scenario 2: tree item, `document.title` and page header show "Release process" for `ops/release-process.md`; the visual editor's link dialog page search shows "Release process"; rename to "Release handbook" from the tree and check the tree label and (via the remote file helper used by other e2e tests) that the file's `title:` line changed and the body is unchanged.

**Checkpoint**: Titles are right in tree, tab, header and picker; rename keeps the file intact.

---

## Phase 5: User Story 4 - Editing never damages front matter (Priority: P1)

**Goal**: Both editors keep the block byte-identical; the Markdown preview shows metadata;
the visual editor shows a read-only card with "Edit in Markdown mode".

**Independent Test**: quickstart scenario 4.

### Tests for User Story 4

- [X] T025 [P] [US4] Extend the 007 round-trip test (find it next to `web/visual/markdown/corpus/`, e.g. `roundtrip.test.ts`) to also glob `../../../../../tests/fixtures/front-matter/corpus/*.md` (same import style as the sections fixtures in `web/sections/`) and assert byte-identical output for each (SC-003). Exclude `expected.json`.
- [X] T026 [P] [US4] Add tests for the card in `web/visual/nodeViews.test.ts` (or the existing node-view test file):
  - a `raw_block` with `kind: 'front-matter'` renders `role="group"` with `aria-label="Page metadata, can be edited in Markdown mode"` and `contentEditable="false"`;
  - with a stubbed `loadFrontMatter` resolving to the example object: shows title, "Deprecated", description, tags joined with ", ", owners, and "2 more properties" when two properties exist;
  - states: "Loading page metadata…" while pending, "This page's metadata could not be read." for unreadable, the generic placeholder (label + first line) when the promise rejects;
  - hostile values appear as text (no `script`/`img` elements);
  - the "Edit in Markdown mode" button calls `onSwitchToMarkdown` with the node position; `stopEvent` returns true for the button;
  - other `raw_block` kinds still use the generic placeholder.
- [X] T027 [P] [US4] Extend `tests/e2e/front-matter.spec.ts` with quickstart scenario 4: visual editor card content; Tab reaches "Edit in Markdown mode"; edit one paragraph, open the diff and check only that paragraph changed; open and save without changes creates no commit (follow the existing `us9-visual-editor.spec.ts` no-op save check); button switches to Markdown mode; changing `status` to `draft` shows "Draft" in the preview; switching back shows "Draft" on the card.

### Implementation for User Story 4

- [X] T028 [US4] Show metadata in the Markdown editor preview in `web/pages/PageEdit.tsx`:
  - type the preview response as `{ html: string; sections: …; frontMatter: Schemas['FrontMatter'] | null }` (use the generated schema type for the render response if available);
  - render `<PageMeta frontMatter={preview.data?.frontMatter} />` above both `PreviewPane` usages (preview tab and split view), outside the sanitized HTML container.
- [X] T029 [US4] Add `FrontMatterView` in `web/visual/nodeViews.ts` per contracts/ui.md "Visual editor card" and research R9:
  - selected in the `raw_block` factory when `node.attrs.kind === 'front-matter'`, otherwise `RawBlockView` as today;
  - built with `el()` and `textContent` only; `contentEditable = 'false'`, `role="group"`, the aria-label above;
  - on construction and in `update()` when `attrs.source` changed: show "Loading page metadata…", call `ctx.loadFrontMatter(source)`, then render the fields or the unreadable text; ignore stale results (compare source like `DiagramView.draw`); on rejection fall back to the generic placeholder content;
  - a button `ui-button ui-button--secondary ui-button--sm` "Edit in Markdown mode" calling `ctx.onSwitchToMarkdown?.(getPos())`;
  - `stopEvent` true for the button, `ignoreMutation` true;
  - extend `NodeViewContext` with `loadFrontMatter?: (source: string) => Promise<Schemas['FrontMatter'] | null>` and `onSwitchToMarkdown?: (pos: number | undefined) => void`.
- [X] T030 [US4] Provide the context in `web/visual/VisualEditor.tsx` and `web/pages/PageEdit.tsx`:
  - `loadFrontMatter`: `POST /api/render` with `{ spaceId, path, markdown: source }` (the block source as stored in the node, which includes the delimiters), returns `frontMatter`; cache promises in a `Map<string, Promise<…>>` per editor instance;
  - `onSwitchToMarkdown`: switch the editor mode to Markdown (reuse the existing mode switch, which already serializes the document) and place the CodeMirror caret at offset 0 (the block is always at the start of the file); add a new prop on `VisualEditor` if the mode is owned by `PageEdit`.
- [X] T031 [P] [US4] Add card styles in `web/visual/visual.css`: `.visual-front-matter` based on `.visual-raw` (border, padding, muted background), a compact header row (title + status label), tags inline, button aligned to the end, wrapping long values, light/dark tokens.

**Checkpoint**: Editing round-trips the block; preview and card show metadata; T025–T027 pass.

---

## Phase 6: User Story 3 - Fields the wiki does not know are still visible (Priority: P2)

**Goal**: A collapsed "Properties" section lists aliases and all other fields.

**Independent Test**: quickstart scenario 1 step 2.

### Tests for User Story 3

- [X] T032 [P] [US3] Extend `web/frontmatter/PageMeta.test.tsx`:
  - no `details` "Properties" when `properties` and `aliases` are empty;
  - otherwise a closed `details` with `summary` "Properties"; opening it shows "Also known as" first (when aliases exist), then each property `dt` name as written and `dd` value in order;
  - `text` values as text; `text: ""` shows an em dash with accessible text "empty" (e.g. `<span aria-hidden="true">—</span><span className="visually-hidden">empty</span>`); `list` as `ul` of items; `map` as a nested `dl`; a list of maps renders nested;
  - toggling with keyboard (`user.keyboard('{Enter}')` on the summary) opens/closes it.
- [X] T033 [P] [US3] Extend `tests/e2e/front-matter.spec.ts` with quickstart scenario 1 step 2: "Properties" is closed, opens with Enter, shows `weight` 20, `reviewed` 2026-09-01, `reviewers` as a list and `links` as nested pairs.

### Implementation for User Story 3

- [X] T034 [US3] Add the Properties part to `web/frontmatter/PageMeta.tsx` per contracts/ui.md item 5: a recursive `PropertyValue` component (`text` / `list` / `map`), rendered inside `<details className="page-meta__properties"><summary>Properties</summary><dl>…</dl></details>`, placed last in the section; add matching styles (nested indentation, `dt` weight) to `web/frontmatter/frontmatter.css`. Makes T032 and T033 pass.

**Checkpoint**: All four stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T035 [P] Extend `tests/e2e/a11y.spec.ts` with `ops/release-process.md` (Properties closed and open, light and dark themes) and the visual editor with the card; extend `tests/e2e/csp.spec.ts` to visit `ops/release-process.md` and `ops/hostile-meta.md` with no violations (SC-004, SC-005).
- [X] T036 [P] Update `README.md`'s feature list (front matter: hidden block, metadata header, title, Properties; editors keep the block) and `docs/roadmap.md`: add "010 – Page front matter (implemented)" with a short note and renumber "Admin onboarding (setup CLI)" to 011 (update the "also used by 010" reference in the 008 entry); add "tag browsing" and "front matter order in the tree" to "Later candidates".
- [X] T037 [P] Update `specs/007-wysiwyg-editor/` prose only if it states that front matter is shown as a generic placeholder (grep "front matter"); add a one-line note that 010 shows it as a metadata card.
- [ ] T038 Run the full checks:
  - `dotnet test`;
  - `npm --prefix src/web run lint`, `npm --prefix src/web test`, `npm --prefix src/web run build`;
  - Playwright `front-matter`, `a11y`, `csp`, `heading-links`, `us9-visual-editor` and the page-tree/rename suite in chromium, firefox and webkit;
  - confirm the container image still builds (fixtures under `tests/fixtures/front-matter` are copied into the web build stage if the round-trip test runs there, as was needed for `tests/fixtures/anchoring`).

  Fix regressions.
- [ ] T039 Walk through quickstart.md scenarios 1–5 by hand, including a screen reader spot check of the banner and Properties. Record results and anything not met in the Notes of `specs/010-page-front-matter/checklists/requirements.md`. The PR description must call out the new dependency (YamlDotNet) and the `SECURITY.md` update (Quality Gates).

---

## Dependencies & Execution Order

- **Setup (T001–T003)**: no dependencies. T002 is needed by T004–T006 and T019; T003 by e2e tasks.
- **Foundational (T004–T013)**: depends on T001 and T002. Tests T004–T007 come before T008–T012.
  - T009 depends on T008;
  - T010 depends on T009;
  - T011 depends on T010;
  - T012 depends on T011;
  - T013 is independent.
- **US1 (T014–T018)**: depends on Phase 2 (T012 for the generated type).
- **US2 (T019–T024)**: depends on T008–T009 only (server); T024 also needs T003. Can run in parallel with US1.
- **US4 (T025–T031)**: T025 depends only on T002. T028 depends on T016 (`PageMeta`). T029–T030 depend on T012.
- **US3 (T032–T034)**: depends on T016 (same component file).
- **Polish (T035–T039)**: after the stories it covers.

### Parallel Opportunities

- T002 ∥ T003 (after or alongside T001).
- T004 ∥ T005 ∥ T006 ∥ T007; T013 alongside the server chain T008 → T009 → T010 → T011 → T012.
- US1 (`web/frontmatter`, `PageView`) ∥ US2 (`Spaces/`, server) ∥ US4's T025, T026, T029, T031 (`web/visual`).
- Within US1: T014 ∥ T015 ∥ T017, then T016 → T018.
- Within US2: T019 ∥ T020, then T021 → T022 → T023; T024 after T023.
- T035 ∥ T036 ∥ T037.

### Parallel Example: after Phase 2

```text
Task: "T016 [US1] PageMeta component in web/frontmatter/PageMeta.tsx"
Task: "T021 [US2] title rule in src/Copernica/Spaces/PageTitle.cs"
Task: "T029 [US4] FrontMatterView in web/visual/nodeViews.ts"
Task: "T025 [US4] round-trip corpus extension"
```

## Implementation Strategy

### MVP

Phase 1 → Phase 2 → US1, released together: Phase 2 hides the raw block, US1 shows the
metadata. Validate with quickstart scenarios 1, 3 and 5.

### Incremental Delivery

1. Phase 2 + US1: imported pages look clean.
2. US2: correct titles in the tree and rename support.
3. US4: preview and visual editor card (byte fidelity already holds from 007; T025 proves it).
4. US3: Properties for custom fields.

Each step is shippable on its own after the MVP.

## Implementation Notes

Differences from the task descriptions:
- **T001**: YamlDotNet **18.1.0**, the newest release at implementation time (MIT, no
  dependencies), instead of 16.x. Only `YamlDotNet.Core.Parser` is used.
- **T002**: `hostile/expected.json` has the same `{ title, frontMatter }` shape as the corpus
  file. A second YAML document cannot occur inside a located block; the parser test covers
  it with an inline string.
- **T010**:
  - Comments get their own pipeline without front matter, so a comment that starts with a
    `---` block still shows it as text.
  - Markdig does not accept an empty block (`---` directly followed by `---`). The renderer
    blanks such a block out with spaces, which keeps every source offset. The agreement
    probe in `FrontMatterLocateTests` documents this as the only difference.
- **T021**: an unclosed `---` block is no longer skipped when the first heading is looked
  up (FR-001). The old scan treated it as front matter up to the end of the file.
- **T024**: the page picker lists pages from the tree, so the tree-title checks cover it.
  There is no separate e2e step in the link dialog.
- **T024, T027**: the rename test uses one seeded page per browser project
  (`ops/rename-{browser}.md`), because the e2e server and repositories are shared across
  projects. Editing uses `ops/edit-meta.md`, so `ops/release-process.md` stays unchanged for
  the other tests.
- **T026, T029**: the context callback is `onEditInMarkdown()` without a position, because
  front matter is always at the start of the file. The card tests are in the new
  `web/visual/nodeViews.test.ts`.
- **T028**: the preview pane is now an outer element labelled "Preview" that holds
  `PageMeta` and an inner `.prose` element with the sanitized HTML. Diagram drawing and
  section links use the inner element.
- **Added**: `vite.config.ts` `server.fs.allow` includes `../../tests/fixtures`, so the
  round-trip corpus can read the front matter fixtures.
- **T037**: no change needed. The 007 spec still correctly says that unsupported
  constructs, front matter included, are kept verbatim and edited in Markdown mode.
