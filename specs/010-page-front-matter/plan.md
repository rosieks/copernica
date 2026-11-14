# Implementation Plan: Page Front Matter

**Branch**: `010-page-front-matter` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-page-front-matter/spec.md`

## Summary

Today a leading YAML block shows up as a horizontal rule and `key: value` text, or even as
an accidental setext heading. Titles ignore `title:`. The visual editor already keeps the
block verbatim as a placeholder.

- **Server**
  - Markdig's `UseYamlFrontMatter()` drops the block from the HTML at the syntax level in
    both pipelines (R1). One `FrontMatter.Locate` helper defines the block for code paths
    without a Markdig parse.
  - The block body is parsed with YamlDotNet's **event parser only**, into a small
    text/list/map tree. Limits: 32 KiB, depth 16, 2,000 nodes after alias expansion,
    8 KiB per scalar. Duplicate keys or any violation make the block "unreadable" without
    failing the page (R2–R4).
  - A `FrontMatter` object (title, description, tags, status, owners, authors, aliases,
    other properties) is computed in the same render as HTML and sections, cached with
    them, and returned as `frontMatter` on `Page` and `POST /api/render` (R7).
  - `PageTitle.Resolve` puts a readable `title` first (R5). Rename rewrites only the
    `title` scalar's characters, keeping its quoting style (R6).
- **Page view and Markdown preview**
  - A new `frontmatter/PageMeta.tsx` shows a status banner (existing `Callout`), the
    description, people, tag chips and a native `<details>` "Properties", all as React
    text, outside the `<article>` (R8).
- **Visual editor**
  - A `FrontMatterView` node view for `raw_block` of kind `front-matter` shows a read-only
    card built from server data. It loads that data by posting the block to
    `/api/render`, and has an "Edit in Markdown mode" button (R9). Byte fidelity is
    unchanged.

## Technical Context

**Language/Version**: C# 14 / .NET 10 (server); TypeScript 5.9 (strict), React 19 (SPA)

**Primary Dependencies**:
- **New (shipped)**: YamlDotNet (MIT, no transitive dependencies), event parser only.
  Justification in research R2.
- Reused: Markdig `UseYamlFrontMatter()` (already in the Markdig package), the existing
  `Callout`, `Tooltip` and `el()` node-view helper.

**Storage**: none. Metadata is derived per page version and cached with the rendered page.

**Testing**:
- xUnit:
  - block recognition (Locate vs Markdig agreement over the corpus);
  - value tree and limits (hostile set);
  - field mapping (aliases, shapes, case variants);
  - title rule;
  - rename rewrite (all scalar styles, byte-for-byte rest);
  - unchanged section ids and HTML for pages without front matter (SC-007);
  - API shape in integration tests.
- Vitest:
  - `PageMeta` (each part, unreadable, hostile strings stay text, `<details>`);
  - `FrontMatterView` card states;
  - the 007 round-trip test extended with `tests/fixtures/front-matter/corpus/` (SC-003).
- Playwright:
  - `front-matter.spec.ts` with seeded pages (quickstart);
  - axe scan and CSP suite extended.

**Target Platform**: unchanged; browsers per the constitution

**Project Type**: web application (server + embedded SPA), one artifact

**Performance Goals**:
- Pages without front matter: no extra work (`Locate` is a first-line check).
- With front matter: one bounded parse per page version, cached with HTML (render cache)
  and titles (tree cache).
- Hostile blocks are rejected within the limits; no measurable slowdown (SC-004).

**Constraints**:
- CSP unchanged, no inline styles.
- No YAML or metadata markup in the browser (FR-018).
- 007 byte fidelity and 009 section ids unchanged (FR-021).
- Stored Markdown never rewritten, except the `title` scalar on rename (FR-012).

**Scale/Scope**:
- 4 user stories, 21 FRs.
- Server: 1 locator, 1 parser/mapper, renderer and title changes, rename branch, 2
  response fields.
- SPA: 1 component module, 1 node view, preview integration.
- 1 fixture corpus.

No open unknowns (research R1–R10).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| I. English | Spec, plan, code and UI strings ("Properties", "Deprecated", "This page's metadata could not be read.") in English. | PASS |
| II. Self-hosted, no egress | No outbound connections; no new assets from outside; YamlDotNet is bundled in the single artifact. | PASS |
| III. Low-friction adoption | Authentication and authorization unchanged: metadata comes with the page or preview under the same access checks. **Safe content**: YAML parsed on the server with bounded resources and no object construction from tags; values delivered as data and rendered as text only; raw block only as `<pre>` text. Container context unchanged. | PASS |
| IV. Dependencies | **One new shipped NuGet package: YamlDotNet** (MIT, no transitive deps, pinned in `Directory.Packages.props` and the lockfile, mirrorable for offline builds). Justified in R2: a YAML parser is needed for real-world front matter; the standard library has none; hand-writing one is riskier. No new npm packages. | PASS (justified) |
| V. Git-backed, simplicity | Content stays in files; nothing stored; metadata is derived and rebuildable. Saves keep the block byte-identical (007); the only file change is the `title` scalar on rename, inside the existing single attributed commit. No configurable schema (YAGNI). | PASS |
| Security constraints | Markdown, and now front matter, interpreted on the server in one place (`MarkdownRenderer`). The visual editor card shows server data as text inside a placeholder, which fits the visual-editor clause (no markup from user content, unsupported constructs kept verbatim). | PASS |
| Quality gates | Rendering/sanitization tests extended (block removal, hostile values); storage write path (rename) covered; no auth change. The PR calls out the new dependency; `SECURITY.md` third-party list gets YamlDotNet and the "Safe content" section gets one sentence on bounded YAML parsing. | PASS |

**Post-design re-check (after Phase 1)**: still PASS. The API only adds nullable
`frontMatter` fields (openapi updated, `schema.d.ts` regenerated) and changes the title
rule. No new endpoint, port or authentication change. The single dependency addition is
recorded above.

## Project Structure

### Documentation (this feature)

```text
specs/010-page-front-matter/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R10
├── data-model.md        # FrontMatterBlock, YamlValue, FrontMatter, rename
├── quickstart.md        # Validation scenarios
├── contracts/
│   ├── api.md           # frontMatter on Page and render responses, title rule
│   └── ui.md            # page metadata, preview, visual editor card
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
Directory.Packages.props                      # + YamlDotNet
src/Copernica/
├── Copernica.csproj                          # + PackageReference YamlDotNet
├── packages.lock.json                        # updated
├── Rendering/
│   ├── FrontMatter.cs                        # new: Locate, records (FrontMatter, Property, values)
│   ├── FrontMatterParser.cs                  # new: event parser → value tree, limits, field mapping
│   ├── MarkdownRenderer.cs                   # UseYamlFrontMatter in both pipelines; FrontMatter in result
│   └── SectionExtractor.cs                   # RenderedMarkdown gains FrontMatter
├── Spaces/
│   ├── PageTitle.cs                          # title from front matter; Locate replaces own scan
│   ├── FrontMatterTitle.cs                   # new: replace the title scalar in place (R6)
│   ├── TreeOperations.cs                     # rename: front matter title or first heading
│   └── PageService.cs                        # PageDto.FrontMatter
└── Api/PageWriteEndpoints.cs                 # render response: frontMatter

src/web/src/
├── frontmatter/                              # new
│   ├── PageMeta.tsx (+ PageMeta.test.tsx)    # banner, description, people, tags, Properties
│   └── frontmatter.css
├── pages/PageView.tsx                        # render PageMeta above the article
├── pages/PageEdit.tsx                        # preview shows PageMeta; switch-to-Markdown hook for the card
├── visual/nodeViews.ts                       # FrontMatterView for raw_block kind front-matter
├── visual/VisualEditor.tsx                   # context: loadFrontMatter, onSwitchToMarkdown
├── visual/visual.css                         # card styles
└── api/schema.d.ts                           # regenerated

specs/001-git-backed-team-wiki/contracts/openapi.yaml   # FrontMatter schemas, fields
SECURITY.md, README.md, docs/roadmap.md                 # dependency, safe content, feature list

tests/
├── fixtures/front-matter/{corpus,hostile}/…            # + expected JSON
├── Copernica.Tests/Rendering/{FrontMatterParserTests,FrontMatterRenderingTests}.cs
├── Copernica.Tests/Spaces/{PageTitleTests,FrontMatterTitleTests}.cs
├── Copernica.IntegrationTests/…                        # frontMatter in page/render API, rename commit
└── e2e/{front-matter.spec.ts, server.mjs, a11y.spec.ts, csp.spec.ts}
```

**Structure Decision**: The existing single web application. Parsing lives in
`Rendering/` next to the Markdown pipeline (one place for content interpretation); title
and rename logic in `Spaces/`. The browser gets a `src/web/src/frontmatter/` module used by
the page view and the editor preview; the visual editor card stays with the other node
views.

## Complexity Tracking

No constitution violations. The new dependency is permitted by Principle IV and justified
in research R2.
