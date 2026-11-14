# Implementation Plan: Links to Headings

**Branch**: `009-heading-links` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-heading-links/spec.md`

## Summary

Section addresses already exist: the server renders headings with GitHub-style ids
(Markdig `AutoIdentifierOptions.GitHub`). A probe confirmed that non-English letters are
kept and that duplicates get `-1`, `-2` (research R1). What is missing is everything in the
browser, plus a guard against id collisions.

- **Server**
  - The sanitizer prefixes every id in user content with `user-content-`, so a heading can
    no longer take over `#main` or clobber DOM globals (R2). URL fragments stay unprefixed,
    so existing links do not change.
  - The page response and the preview response gain a `sections` list (level, id, text) of
    the H1–H3 headings, taken from the Markdig syntax tree (R6).
- **Page view**
  - A `useSections` hook decorates H1–H3 in the rendered article with a copy-link button.
    The button sits in a `data-anchor-skip` wrapper, so discussion anchors and the
    heading's accessible name are unchanged (R3).
  - The hook also resolves `location.hash` to a heading: exact id first, then the
    Azure DevOps form (R4). On first load, in-app navigation and Back/Forward it scrolls
    the heading below the sticky header, follows late layout changes, highlights the
    heading and moves focus to it (R5).
  - `RouteAnnouncer` leaves focus to the hook when there is a hash.
  - Same-page `#links` in pages, previews and comments are routed through the router, so
    they create history entries.
- **Visual editor**
  - `LinkDialog` gains an optional section list for the chosen page. For other pages it
    comes from the page response; for the page being edited it comes from the preview
    response (R6). It writes `relative.md#id` or `#id`.

## Technical Context

**Language/Version**: C# 14 / .NET 10 (server); TypeScript 5.9 (strict), React 19 (SPA)

**Primary Dependencies**: no new ones. Reused:
- Markdig AutoIdentifiers and Ganss HtmlSanitizer `PostProcessNode` (server);
- react-router 7, the Radix toast and `@radix-ui/react-icons` (`Link2Icon`), the existing
  `copyText`, `canonicalUrl` and `CopyLinkDialog` (SPA).

**Storage**: none. Sections are derived when a page is rendered and cached with its HTML.

**Testing**:
- xUnit: id prefixing (including raw HTML and footnotes), section extraction, unchanged
  slugs (golden list from the R1 probe), the API shape of `sections`;
- Vitest: hash resolution (exact, Azure DevOps, duplicates, not found), the slug function
  pinned against the server golden list, the decoration hook (DOM shape, `textContent`
  unchanged, accessible name), LinkDialog section list;
- Playwright: `heading-links.spec.ts`, seeded page `guides/sections.md`, in chromium,
  firefox and webkit, plus the axe scan and the CSP suite.

**Target Platform**: unchanged; browsers per the constitution

**Project Type**: web application (server + embedded SPA), one artifact

**Performance Goals**:
- page view unaffected: decoration is one `querySelectorAll` over the article;
- section extraction runs in the same parse as rendering and is cached;
- the copy action completes instantly.

**Constraints**:
- CSP unchanged (no inline styles; the highlight is a CSS class);
- no client-side rendering of user content: the editor's section list uses server data;
- existing section addresses unchanged (SC-006);
- no change to stored Markdown (FR-016).

**Scale/Scope**:
- 3 user stories, 17 FRs;
- server: 1 sanitizer change, 1 section extractor, 2 response fields;
- SPA: 1 hook, 1 resolver module, 1 LinkDialog extension, 3 small integrations
  (PageView, RouteAnnouncer, comments).

No open unknowns (research R1–R8).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| I. English | Spec, plan, code and UI strings ("Copy link to section", "Section not found") in English. | PASS |
| II. Self-hosted, no egress | No outbound connections; the clipboard is local; no new assets from outside. | PASS |
| III. Low-friction adoption | Authentication and authorization unchanged: section data comes with the page under the same access check. **Safe content is strengthened**: user ids are prefixed, which closes heading/UI id collisions and DOM clobbering. Container context unchanged. | PASS |
| IV. Dependencies | No new packages (NuGet or npm). | PASS |
| V. Git-backed, simplicity | Nothing stored; sections are derived per page version (rebuildable); Markdown files unchanged (FR-016). | PASS |
| Security constraints | Rendering and sanitizing stay on the server in one place. Decoration adds UI elements around server HTML, like the diagram chrome (004), and never parses user HTML. The editor's section list uses server data, so the visual-editor exception is not widened. | PASS |
| Quality gates | Rendering/sanitization tests extended (prefix, raw HTML ids, footnotes); no write path or storage change. PR notes the sanitizer change; `SECURITY.md` "Safe content" gets one sentence on id prefixing. | PASS |

**Post-design re-check (after Phase 1)**: still PASS. The API change only adds the
`sections` fields (openapi updated, `schema.d.ts` regenerated). No new endpoint, port,
dependency or authentication change.

## Project Structure

### Documentation (this feature)

```text
specs/009-heading-links/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R8
├── data-model.md        # Section, SectionLink, resolution
├── quickstart.md        # Validation scenarios
├── contracts/
│   ├── api.md           # sections in Page and render responses
│   └── ui.md            # copy control, fragment format, resolution, focus, ids
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/Copernica/
├── Rendering/
│   ├── HtmlSanitizerFactory.cs     # prefix ids with user-content-
│   ├── MarkdownRenderer.cs         # render result also returns sections
│   └── SectionExtractor.cs         # new: H1–H3 (level, id, text) from the syntax tree
├── Spaces/PageService.cs           # PageDto.Sections, preview Sections, cache
└── Api/…                           # response shapes (no new routes)

src/web/src/
├── sections/                       # new
│   ├── resolveSection.ts(+test)    # hash → element: exact, Azure DevOps, decoding
│   ├── SectionLinks.tsx            # copy-link buttons (portals) + fallback dialog
│   ├── useSectionNavigation.ts     # scroll/focus/highlight on hash
│   ├── contentLinks.ts             # click routing for #section and /s/ links
│   ├── sections.test.tsx           # component and hook tests
│   └── sections.css                # button, highlight, print, reduced motion
├── layout/SkipLink.tsx             # focuses <main> without a #main navigation
├── pages/PageView.tsx              # use the hook, route same-page #links
├── pages/PageActions.tsx           # canonicalUrl reused with fragment
├── layout/RouteAnnouncer.tsx       # skip heading focus when a hash is present
├── discussions/DiscussionPanel.tsx # #links in comments resolve in the article
├── visual/LinkDialog.tsx(+test)    # section list, href with fragment
└── api/schema.d.ts                 # regenerated

specs/001-git-backed-team-wiki/contracts/openapi.yaml   # sections fields

tests/
├── Copernica.Tests/Rendering/{SanitizationTests,SectionExtractorTests}.cs
├── Copernica.IntegrationTests/…                         # sections in page/render API
└── e2e/{heading-links.spec.ts, server.mjs (guides/sections.md)}
```

**Structure Decision**: The existing single web application. Server changes stay in
`Rendering/` and `Spaces/`. The browser logic gets its own `src/web/src/sections/` module,
used by the page view, comments and the editor.

## Complexity Tracking

No constitution violations to justify.
