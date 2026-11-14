# Quickstart: Validating Links to Headings

How to check by hand that the feature works end to end. The automated equivalents are in
`tests/e2e/heading-links.spec.ts`, `src/web/src/sections/*.test.ts` and
`tests/Copernica.Tests/Rendering/`.

## Prerequisites

- Build the SPA and the server, then start the e2e test server:
  ```sh
  npm --prefix src/web run build
  dotnet build src/Copernica
  cd tests/e2e && node server.mjs
  ```
  This seeds the `handbook` space with `guides/sections.md` (below) and the local users
  alice and bob (password `secret`).
- The seeded page `guides/sections.md` contains:
  - `# Sections`, then three `## Setup` headings;
  - `## Zażółć gęślą jaźń`, `## Interface Version 1.0`, `## Design & Process`, `### main`;
  - a long image and a Mermaid diagram above `## Late layout`;
  - a footnote, a table of contents of `#…` links, and `#### Detail`.
- `guides/setup.md` links to `sections.md#late-layout`, to
  `sections.md#interface-version-1.0` (the Azure DevOps form) and to `sections.md#gone`.

## Scenarios

### 1. Copy a section link (US1)

1. Open `guides/sections.md` and hover `## Zażółć gęślą jaźń`. A link button appears at
   the end of the heading line. Tab through the page: every H1–H3 has one button after
   the heading, and `#### Detail` has none.
2. Activate the button with Enter.
   - **Expected**:
     - the toast says "Link copied";
     - the address bar ends with `#za%C5%BC%C3%B3%C5%82%C4%87-g%C4%99%C5%9Bl%C4%85-ja%C5%BA%C5%84`;
     - the page does not jump.
3. Paste the link into a new tab.
   - **Expected**:
     - the heading is at the top, below the header and fully visible;
     - it is briefly highlighted;
     - focus is on it (the next Tab reaches its copy button).
4. Repeat with the second `## Setup`. **Expected**: the link ends with `#setup-1` and lands
   on the second Setup heading.
5. In a browser with clipboard permission denied: **Expected**: the "Link to this section"
   dialog shows the link.
6. With a screen reader, read the headings list. **Expected**: the headings read "Setup",
   with no button text in them; the button reads "Copy link to section: Setup".

### 2. Follow section links (US2)

1. On `guides/sections.md`, click each table-of-contents entry, then use Back three times.
   **Expected**: each click moves to its section and Back returns through them in order.
2. Open `guides/setup.md` and follow its links. **Expected**:
   - "late layout" lands on `## Late layout` even after the image and the diagram load;
   - the Azure DevOps-form link lands on `## Interface Version 1.0`;
   - `#gone` opens at the top with an info toast "Section not found".
3. Open History, then an earlier version of `guides/sections.md`, and append `#setup-2`.
   **Expected**: it lands on the third Setup heading of that version.
4. Open `#main` (the `### main` heading). **Expected**: it lands on the heading. The skip
   link "Skip to content" still moves to the main region.
5. Click a footnote reference and its back link. **Expected**: both move within the page.
6. Post a discussion comment containing `[see](#setup)` and click it. **Expected**: it
   scrolls the page article to `## Setup`.
7. Turn on "reduce motion" in the operating system and repeat step 2.1. **Expected**: no
   animation; a static outline marks the target for about 2 s.
8. Print preview. **Expected**: no link buttons are visible.

### 3. Link to a section in the visual editor (US3)

1. Edit `guides/setup.md` in visual mode and press Mod-K.
2. Choose page "Sections".
   - **Expected**: a "Section (optional)" list appears, starting with "Whole page", then
     the H1–H3 headings indented by level.
   - Choose "Interface Version 1.0" and insert.
3. Save, then click the link in the page view. **Expected**: it lands on that heading. The
   saved Markdown contains `sections.md#interface-version-10`.
4. In the dialog, choose "This page" and pick a heading you just typed but have not saved.
   **Expected**: the link is written as `#…` and works after saving.

### 4. Regression checks

- `dotnet test`: the sanitization tests include id prefixing for raw HTML and footnotes,
  and the golden slug list is unchanged (SC-006).
- `npm test` in `src/web`: the `gfmSlug` golden list matches the server.
- Playwright `a11y` and `csp` suites pass with the new controls.
