# Feature Specification: Page Front Matter

**Feature Branch**: `010-page-front-matter`

**Created**: 2026-11-13

**Status**: Draft

## Clarifications

### Session 2026-11-13

- Q: Can authors edit front matter fields in the visual editor? → A: No. The visual editor
  shows the metadata read-only as a card with a control to switch to Markdown mode, where
  the raw block is edited.
- Q: What does activating a tag do? → A: Nothing; tags are plain labels in this feature.
  Browsing pages by tag is left for the planned full-text search.
- Q: How does a front matter position (`order`, `weight`, `sidebar_position`) interact with
  005's order files? → A: It is ignored in this feature; the field is listed under
  Properties and the tree order stays with order files (otherwise alphabetical).
- Q (after trying the feature): Should web addresses in metadata be clickable? → A: Yes. A
  property value that is entirely an http, https or mailto address is shown as a link; the
  server decides, with the same schemes as the content sanitizer.

**Input**: User description: "Support for front matter (a YAML block between `---` lines at
the start of a Markdown file). The metadata should not be shown as raw text at the top of
the page but rendered nicely. Known fields from common conventions (Jekyll, Hugo,
Docusaurus, Obsidian) are used by the application: title (page title in the tree and the
browser tab), description (summary/preview), tags (clickable labels), status (e.g.
draft/deprecated as a banner), owner/author, aliases, order (position in the tree). Unknown
fields are shown in a collapsible Properties section. The editor (including the visual
editor) must preserve front matter on save. Safe YAML parsing and sanitization of values."
(Polish original: "Chcę dodać opcję wspierania Frontmattera … żeby te metadane nie
wyświetlały się na samej górze, a może były jakoś ładniej wyrenderowane … może można by
było od razu tego jakoś użyć.")

**Builds on**:
- [001 Git-Backed Team Wiki](../001-git-backed-team-wiki/spec.md): page rendering and
  sanitization, page titles, earlier versions of a page.
- [002 Consistent, Accessible Wiki Interface](../002-accessible-wiki-ui/spec.md):
  keyboard, screen reader and focus rules, themes.
- [005 Page Tree Management](../005-page-tree-management/spec.md): page tree, renaming a
  page (which rewrites its title), custom order through order files.
- [007 Visual Page Editor](../007-wysiwyg-editor/spec.md): Markdown fidelity; front matter
  is already kept verbatim as a non-editable placeholder.
- [009 Links to Headings](../009-heading-links/spec.md): section addresses must not shift
  because of front matter.

## Background

Many Markdown repositories, including documentation migrated from static site generators
and notes from Obsidian, start their files with a metadata block:

```markdown
---
title: Release process
description: How we cut, test and publish a release.
tags: [release, ci]
status: draft
owner: Platform team
---

# Release process
…
```

Today the wiki does not recognize this block. The reader sees a horizontal rule followed by
a paragraph of `key: value` text (or a large heading, when the block happens to end in a way
that Markdown reads as a heading underline). The page title in the tree ignores `title:`
and uses the first heading or the file name instead.

There is no single standard for front matter fields. The fields below are the ones shared
by the most widely used tools (Jekyll, Hugo, Docusaurus, MkDocs, Obsidian) and that the wiki
can make useful without new infrastructure:

| Field | Common in | Meaning in the wiki |
|-------|-----------|---------------------|
| `title` | all | Page title in the tree, the browser tab and links |
| `description` (alias `summary`) | Hugo, Docusaurus, MkDocs, Jekyll | Short summary shown under the title |
| `tags` (alias `keywords`) | all | Labels shown on the page |
| `status` | common team convention | Banner for `draft`, `deprecated`, `archived` |
| `owner`, `author` / `authors` | Jekyll, Hugo, Docusaurus | Who to ask about the page |
| `aliases` | Obsidian, Hugo | Other names of the page |
| `order` / `weight` / `sidebar_position` | Hugo, Docusaurus | Not interpreted in this feature (listed under Properties); tree order stays with 005 order files |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Metadata no longer clutters the top of the page (Priority: P1)

A team imports documentation from a static site generator. Every page starts with a front
matter block. Readers today see a stray line and a paragraph of `key: value` pairs before
the real content. With this feature the block disappears from the page body and its known
fields appear as a tidy header: the description under the title, tags as labels, the owner,
and a banner when the page is a draft or deprecated.

**Why this priority**: This is the visible problem the feature was requested for. Even
without any other story, imported repositories stop looking broken.

**Independent Test**: Open a page whose file starts with a front matter block containing
`title`, `description`, `tags`, `status: deprecated` and `owner`. Check that no `key: value`
text or stray horizontal rule appears in the content, and that the description, tags, owner
and a "deprecated" banner are shown above the content.

**Acceptance Scenarios**:

1. **Given** a page whose file starts with a valid front matter block, **When** a reader
   opens it, **Then** the block's raw text is not shown in the page content.
2. **Given** front matter with `description`, **When** the page is shown, **Then** the
   description appears once, as a short summary near the page title.
3. **Given** front matter with `tags` written either as a list or as a single
   comma-separated value, **When** the page is shown, **Then** each tag appears as a
   separate label.
4. **Given** front matter with `owner` or `author`/`authors`, **When** the page is shown,
   **Then** those names are shown labelled as owner or authors.
5. **Given** front matter with `status: draft`, `status: deprecated` or `status: archived`
   (case-insensitive), **When** the page is shown, **Then** a banner above the content tells
   the reader the page is a draft, deprecated or archived, conveyed by text and not by
   color alone. Any other status value is shown as a plain property.
6. **Given** a page with no front matter, **When** it is shown, **Then** it looks exactly as
   it does today.
7. **Given** an earlier version of a page (001 page history) that has front matter, **When**
   a reader opens that version, **Then** its metadata is shown the same way, as it was in
   that version.

---

### User Story 2 - The page title comes from front matter (Priority: P1)

Imported pages often have no level-1 heading because the static site generator built it
from `title:`. Today such pages show their file name (`release-process`) in the tree. With
this feature `title:` names the page in the tree, the browser tab, the page header and the
page picker.

**Why this priority**: Wrong titles in the tree make an imported space hard to navigate;
this is the most useful field after hiding the raw block.

**Independent Test**: Create a page `release-process.md` whose front matter has
`title: Release process` and whose body has no level-1 heading. Check that the tree, the
browser tab and the page picker all show "Release process".

**Acceptance Scenarios**:

1. **Given** a page with a non-empty `title` in its front matter, **When** the tree, the page
   header, the browser tab or the page picker show the page, **Then** they use that title.
2. **Given** a page with front matter but no `title`, **When** it is shown, **Then** the title
   is chosen as today: the first level-1 heading, otherwise the file name.
3. **Given** a page whose front matter `title` differs from its first level-1 heading,
   **When** it is shown, **Then** the front matter title names the page and the heading stays
   in the content unchanged.
4. **Given** a page whose title comes from front matter, **When** a user renames the page in
   the tree (005), **Then** the `title` value in the front matter is updated in the same
   commit, the rest of the block is kept byte-for-byte, and the body heading is left as it is.

---

### User Story 3 - Fields the wiki does not know are still visible (Priority: P2)

Teams put their own fields into front matter (`reviewed: 2026-09-01`, `service: billing`,
`audience: on-call`). These must not be lost from view when the raw block is hidden. A
collapsed "Properties" section lists every field that the wiki does not show elsewhere.

**Why this priority**: Without it, hiding the block would hide information authors chose to
write. It is second because most value comes from the known fields.

**Independent Test**: Open a page with front matter containing `reviewed`, `service` and a
nested value. Check that a collapsed "Properties" section exists, opens with the keyboard,
and lists each field with its value.

**Acceptance Scenarios**:

1. **Given** front matter with fields the wiki does not interpret, **When** the page is
   shown, **Then** a "Properties" section, collapsed by default, lists each such field name
   and value in the order written.
2. **Given** a field whose value is a list, **When** it is listed, **Then** the items are
   shown as a list; a nested mapping is shown as nested name–value pairs.
3. **Given** front matter that contains only known fields, **When** the page is shown,
   **Then** no empty "Properties" section appears.
4. **Given** the Properties section, **When** a keyboard or screen reader user reaches it,
   **Then** it can be opened and closed with the keyboard and announces its state (002).

---

### User Story 4 - Editing never damages front matter (Priority: P1)

An author edits a page with front matter in the visual editor or the Markdown editor and
saves. The front matter is kept exactly as it was unless the author changed it in Markdown
mode.

**Why this priority**: Git is the source of truth (Constitution V, 007 fidelity rule).
Losing or reformatting metadata on save would break the repository for the tools that
produce and consume it.

**Independent Test**: Open a page with front matter in the visual editor, change one
paragraph and save; check that the commit diff touches only that paragraph's lines.

**Acceptance Scenarios**:

1. **Given** a page with front matter, **When** an author edits the body in the visual
   editor and saves, **Then** the front matter in the saved file is byte-identical to before.
2. **Given** a page with front matter, **When** an author opens it in the visual editor and
   saves without changes, **Then** no commit is created (007).
3. **Given** the visual editor, **When** it shows a page with front matter, **Then** the
   metadata is shown read-only as a card with the same fields as the published page,
   together with a control that switches to Markdown mode to change it; the fields cannot
   be edited in visual mode.
4. **Given** the Markdown editor's preview, **When** the source has front matter, **Then** the
   preview shows metadata the same way as the published page.

---

### Edge Cases

- **Invalid YAML** (syntax error, tabs used for indentation): the block is not interpreted;
  the page shows a short notice "This page's metadata could not be read" with the raw block
  available in a collapsed section shown as plain text, and the rest of the page renders
  normally. The page title falls back to the first heading or file name.
- **Block not closed** (opening `---` with no closing `---` or `...`): it is not front
  matter; the file renders as Markdown as today.
- **Block not at the very start** (any text or blank line before the first `---`, other than
  a byte-order mark): it is not front matter; a `---` later in the file stays a horizontal
  rule.
- **Empty block** (`---` immediately followed by `---`): treated as front matter with no
  fields; nothing is shown.
- **TOML front matter** (`+++` … `+++`, Hugo): not interpreted in this feature; rendered as
  today.
- **Values that are not text** where text is expected (e.g. `title: [a, b]`, `tags: 42`):
  the field is not used for its special meaning and is listed under Properties instead.
- **Dangerous content in values** (HTML, script, `javascript:` addresses, Markdown): values
  are always shown as plain text; nothing inside them is interpreted as markup. Only a
  property value that is entirely an http, https or mailto address becomes a link (FR-009);
  `javascript:`, `data:` and other schemes stay text.
- **YAML features that can blow up** (anchors and aliases expanding exponentially, custom
  type tags, very deep nesting, very large blocks): parsing is limited so that a hostile
  page cannot slow down or crash the server; when a limit is hit the block is treated as
  invalid. Type tags never create objects or run code.
- **Very long values or many fields**: shown in full without breaking the layout on a
  narrow screen (wrapping, no horizontal page scroll).
- **Dates** (`date: 2026-09-01`): shown as written, not reformatted or shifted by time zone.
- **Duplicate keys**: the block is treated as invalid (the same as a syntax error), because
  different tools resolve duplicates differently.
- **Section addresses (009)**: headings keep the same addresses as before; front matter
  does not create headings or shift ids.
- **Diagram blocks (004)**: their own Mermaid front matter inside a diagram is unaffected.

## Requirements *(mandatory)*

### Functional Requirements

**Recognition**

- **FR-001**: The system MUST recognize front matter only as a block that starts on the
  first line of the file with a line containing exactly `---` (optionally after a byte-order
  mark) and ends at the next line containing exactly `---` or `...`.
- **FR-002**: The recognized block MUST NOT appear as content in the rendered page, in page
  previews, in earlier versions or in the Markdown editor's preview.
- **FR-003**: The system MUST treat the block as YAML mapping data. A block that is not
  valid YAML, is not a mapping at the top level, has duplicate keys, or exceeds the parsing
  limits (FR-019) MUST be reported as unreadable metadata (Edge Cases) without failing the
  page.
- **FR-004**: Field names MUST be matched case-insensitively. Aliases MUST be accepted:
  `summary` for `description`, `keywords` for `tags`, `author` and `authors` as authors.
  When both a field and its alias are present,
  the canonical name wins and the alias is listed under Properties.

**Display**

- **FR-005**: The page MUST show, above the content: the description, the tags, the owner
  and authors, and the status banner, each only when present and usable.
- **FR-006**: `status` values `draft`, `deprecated` and `archived` (case-insensitive) MUST
  produce a banner with a text label and short explanation; other values MUST be shown as a
  plain property.
- **FR-007**: Fields not used by FR-005/FR-006, FR-008 or FR-013, and known fields
  whose value has an unusable type, MUST be listed in a "Properties" section that is
  collapsed by default and is omitted when empty.
- **FR-008**: `aliases` MUST be shown as "Also known as" text in the Properties area.
  Aliases do not change page addresses or link resolution in this feature.
- **FR-009**: All metadata values MUST be displayed as plain text. No value may be
  interpreted as HTML or Markdown. A property value (FR-007) that is entirely an absolute
  http, https or mailto address MUST be shown as a link to that address; the server decides
  this with the same schemes the content sanitizer allows. No other value becomes a link.
- **FR-010**: Metadata display MUST meet the accessibility rules of 002 (WCAG 2.1 AA):
  meaningful structure for screen readers, keyboard-operable collapse control, status
  conveyed by text, readable in light and dark themes and at narrow widths.

**Title**

- **FR-011**: A non-empty text `title` MUST be used as the page title everywhere the wiki
  shows page titles (tree, page header, browser tab, page picker, links that show titles).
  Without it the existing rule applies (first level-1 heading, else file name).
- **FR-012**: Renaming a page whose title comes from front matter MUST update only the
  `title` value in the front matter, in the same single commit as the rename, keeping every
  other byte of the block. Renaming a page without a front matter title MUST behave as today.

**Tags and order**

- **FR-013**: Tags MUST accept a YAML list or a single comma-separated text value. Each tag
  is trimmed; empty and duplicate tags are dropped. Tags are plain, non-interactive labels:
  they are not links and are not focusable.
- **FR-014**: Position fields (`order`, `weight`, `sidebar_position`) MUST NOT affect the
  page tree; the tree order stays as defined by 005 (order files, otherwise alphabetical).
  These fields are listed under Properties like any other field.

**Editing**

- **FR-015**: Saving from either editor MUST keep the front matter byte-identical unless the
  author changed the block's text in Markdown mode (007 fidelity rule).
- **FR-016**: The visual editor MUST show front matter in a form consistent with User
  Story 4 scenario 3 and MUST NOT drop, reorder or reformat it.
- **FR-017**: The Markdown editor MUST keep showing and allowing edits of the raw block.

**Safety and consistency**

- **FR-018**: Front matter MUST be interpreted on the server, in the same single place that
  renders Markdown, and delivered to the browser as data; the browser MUST NOT interpret YAML
  or render metadata as markup (Constitution: server-side rendering and sanitization).
- **FR-019**: Parsing MUST be bounded: limits on block size, nesting depth and alias
  expansion; no custom type tags may create objects or execute code. Exceeding a limit
  makes the block unreadable metadata (FR-003).
- **FR-020**: Metadata MUST be derived from the file content only; nothing is stored outside
  the repository except rebuildable caches (Constitution V).
- **FR-021**: Section addresses (009) and the visual editor's round-trip guarantee (007) MUST
  be unchanged for every existing page, with or without front matter.

### Key Entities

- **Front matter block**: The leading YAML block of a page file; its raw text, whether it
  was readable, and (when readable) its fields in written order.
- **Page metadata**: The interpreted view of a readable block: title, description, tags,
  status, owner, authors, aliases, and the remaining fields as name–value
  properties (values may be text, numbers, booleans, dates, lists or nested mappings).
- **Page** (from 001): gains page metadata; its title rule gains the front matter `title`
  as the first source.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a test corpus of at least 30 real-world Markdown files with front matter
  (Jekyll, Hugo, Docusaurus, MkDocs, Obsidian), 100% render with no raw metadata text in the
  page content.
- **SC-002**: 100% of pages in that corpus that have a `title` show it in the tree, the page
  header and the browser tab.
- **SC-003**: The 007 round-trip corpus, extended with every front matter file of SC-001,
  stays byte-identical when opened and saved without changes in the visual editor.
- **SC-004**: A set of hostile front matter samples (markup and script in values, alias
  bombs, deep nesting, oversized blocks, custom type tags) produces no executed script, no
  markup injection and no page that takes noticeably longer to open than a page without
  front matter.
- **SC-005**: Every metadata element passes the project's automated accessibility checks in
  light and dark themes, and can be operated with the keyboard alone.
- **SC-006**: A reader can tell within 5 seconds of opening a deprecated or draft page that
  it is deprecated or a draft.
- **SC-007**: Pages without front matter render identically to before (same output in the
  existing rendering tests).

## Assumptions

- Only YAML front matter delimited by `---` is in scope; TOML (`+++`) and JSON front matter
  are left for later.
- The wiki interprets a fixed set of fields; it does not offer a configurable schema of
  required or allowed fields per space.
- Dates and times are shown as written; the wiki does not use front matter dates as the
  page's last-modified date (git history remains the source).
- `owner` and `authors` are shown as text; they are not matched against wiki user accounts
  and do not grant any permissions.
- `aliases` are display-only; using them to resolve links or redirects is left for later.
- Tag browsing (a list of pages per tag) and front matter-driven tree order are left for
  later; see Clarifications.
- New pages are created without front matter as today; templates that add it are out of
  scope.
- Front matter does not affect access control, search engine visibility or whether a page
  is listed (e.g. `draft: true` does not hide a page).
- The status banner wording is the wiki's own (English UI strings, Constitution I).
