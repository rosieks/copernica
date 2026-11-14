# Quickstart: Validating Page Front Matter

How to check by hand that the feature works end to end. The automated equivalents are in
`tests/e2e/front-matter.spec.ts`, `src/web/src/frontmatter/*.test.tsx`,
`tests/Copernica.Tests/Rendering/FrontMatter*Tests.cs` and the 007 round-trip test.

## Prerequisites

- Build the SPA and the server, then start the e2e test server:
  ```sh
  npm --prefix src/web run build
  dotnet build src/Copernica
  cd tests/e2e && node server.mjs
  ```
  This seeds the `handbook` space and the local users alice and bob (password `secret`).
- The seed adds (from `tests/fixtures/front-matter/`):
  - `ops/release-process.md`: front matter with `title: Release process`, `description`,
    `tags: [release, ci]`, `status: deprecated`, `owner: Platform team`, `weight: 20`,
    `reviewed: 2026-09-01`, a list `reviewers` and a nested map `links`; the body has **no**
    `# ` heading. The file name is `release-process.md`. Its previous version has
    `status: draft`.
  - `ops/broken-meta.md`: front matter with a duplicate `title` key and a `# Broken meta`
    heading.
  - `ops/hostile-meta.md`: values containing `<script>`, `<img onerror>`,
    `javascript:alert(1)` and `**bold**`.
  - `ops/rename-chromium.md` (and `-firefox`, `-webkit`): `title: Rename chromium` and a
    different body heading, one per browser project because the server is shared.
  - `ops/edit-meta.md`: `title: Edit me`, `status: deprecated`, `tags: [edit]` and two
    paragraphs.

## Scenarios

### 1. Metadata is shown, not printed (US1)

1. Open `ops/release-process.md`.
   - **Expected**:
     - no `---` rule and no `key: value` text at the top of the content;
     - a "Deprecated" banner with its explanation;
     - the description as a lead paragraph;
     - "Owner: Platform team";
     - tags "release" and "ci" as chips that are not links (Tab does not stop on them).
2. Find "Properties" (closed). Open it with Enter.
   - **Expected**: `weight` 20, `reviewed` 2026-09-01 (as written), `reviewers` as a list,
     `links` as nested name–value pairs. A screen reader announces expanded/collapsed.
3. Open a page without front matter. **Expected**: it looks as before.

### 2. Title from front matter (US2)

1. Look at the tree, the browser tab and the page header of `ops/release-process.md`.
   **Expected**: "Release process", not "release process".
2. Start inserting a link in the visual editor and search for the page.
   **Expected**: the page picker shows "Release process".
3. Rename `ops/rename-chromium.md` ("Rename chromium") from the tree to "Renamed chromium".
   **Expected**:
   - one commit;
   - its diff changes only the `title:` line (plus the move); the body heading is unchanged;
   - the tree shows "Renamed chromium".

### 3. Unreadable and hostile metadata (Edge Cases)

1. Open `ops/broken-meta.md`.
   **Expected**:
   - a warning "This page's metadata could not be read.";
   - "Show metadata source" reveals the raw YAML as text;
   - the title is "Broken meta" (from the heading).
2. Open `ops/hostile-meta.md`.
   **Expected**:
   - every value appears literally (`<script>…`, `**bold**`);
   - no dialog, no bold text, no link;
   - the CSP suite reports no violation.

### 4. Editing keeps the block (US4)

1. Open `ops/edit-meta.md` in the visual editor.
   **Expected**:
   - a card "Page metadata" shows "Edit me", "Deprecated" and the tag;
   - "Edit in Markdown mode" is reachable with Tab.
2. Change one paragraph and open the diff before saving.
   **Expected**: only that paragraph's lines change.
3. Save without changes in a fresh editor. **Expected**: no commit.
4. Press "Edit in Markdown mode". **Expected**: Markdown mode, caret at the block.
5. Change `status: deprecated` to `status: draft` and look at the preview.
   **Expected**: the preview shows a "Draft" banner.
6. Switch back to visual mode. **Expected**: the card shows "Draft".

### 5. Earlier versions (US1 AS7)

1. Open History of `ops/release-process.md` and the previous version.
   **Expected**: the "Draft" banner, as the page was then.

## Automated runs

```sh
dotnet test                                        # parser, limits, title, rename, API shape
npm --prefix src/web test                          # PageMeta, editor card, round-trip corpus
npx --prefix tests/e2e playwright test front-matter a11y csp
```

**Expected**: all pass. The axe scan includes `ops/release-process.md` with Properties
open and closed, in light and dark themes.
