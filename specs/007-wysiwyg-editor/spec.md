# Feature Specification: Visual Page Editor

**Feature Branch**: `007-wysiwyg-editor`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Visual (WYSIWYG) page editor for non-technical users. Today the page editor is a plain Markdown source editor (CodeMirror), which business users cannot work with. Add a visual editing mode in which pages look like the rendered page while editing (headings, bold/italic, links, lists, task lists, tables, quotes, code blocks, images, Mermaid diagrams), with a formatting toolbar, keyboard shortcuts and a "/" command menu for inserting blocks. Users can switch between visual mode and Markdown source mode at any time without losing text; the chosen mode is remembered per user; visual mode is the default for new users. Existing features keep working in visual mode: pasting/dropping images with alt-text prompt (003), Mermaid diagrams shown rendered and editable as text (004), wiki: links and links to other pages via a page picker (005), drafts surviving reloads, change description on save, accessibility rules of 002. HARD REQUIREMENT — Markdown fidelity: git is the source of truth, so the editor must never rewrite parts of the file the user did not change. Opening a page in visual mode and saving without changes produces no commit (the file is byte-identical); editing one block changes only that block's lines in the diff. Approach: block-level source preservation — each block remembers its original source range; on save an unchanged block is written back byte-for-byte (unchanged = serializing the block now equals serializing the parsed original), only new/edited blocks are serialized, recursively inside lists and quotes; original spacing between unchanged blocks is kept; the serializer follows the file's detected style (bullet marker, emphasis character, fence style, heading style, line endings, trailing newline). Constructs the visual editor does not support (raw HTML, Azure DevOps [[_TOC_]], front matter, footnotes, etc.) are shown as non-editable placeholders that keep their source verbatim and can be edited only in Markdown mode. Before saving, the user can see the resulting change as a diff. Acceptance: a round-trip test over a corpus of real Markdown files (Azure DevOps wikis, CommonMark examples) must be byte-identical and runs in CI. Out of scope: real-time collaborative editing, comments inline in the editor, visual diagram editing, Mermaid in discussions, changing Markdown dialect."

**Builds on**:
- [001 Git-Backed Team Wiki](../001-git-backed-team-wiki/spec.md): editing, saving, one commit per save, drafts, conflict handling.
- [002 Consistent, Accessible Wiki Interface](../002-accessible-wiki-ui/spec.md): the editor layout, shortcuts, themes, interface preferences and accessibility rules.
- [003 Paste and Drop Images](../003-paste-images/spec.md): adding images while editing.
- [004 Mermaid Diagrams](../004-mermaid-diagrams/spec.md): diagram blocks and how they are drawn.
- [005 Page Tree Management](../005-page-tree-management/spec.md): page addresses and `wiki:` links.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit a page the way it looks (Priority: P1)

A colleague from a business team opens an existing page to fix a sentence and add a short
list. Instead of Markdown text with symbols, the editor shows the page the way readers see
it: real headings, bold text, links, lists, tables and images. They click into a sentence,
type, select a few words and make them bold with the toolbar, turn two lines into a
bulleted list, write a change description and save. They never see or need to know any
Markdown syntax.

**Why this priority**: This is the reason for the feature. Business users avoid the wiki
today because the editor shows raw Markdown. Without this story nothing else matters.

**Independent Test**: A user who has never written Markdown opens an existing page in the
visual editor, changes a sentence, applies bold, creates a bulleted list and a heading,
and saves. The saved page shows exactly those changes; the repository has one commit by
that user.

**Acceptance Scenarios**:

1. **Given** a user with write access opening the editor for the first time, **When** the
   editor opens, **Then** it is in visual mode and the page looks like the published page
   (headings, emphasis, links, lists, task lists, tables, quotes, code blocks, images and
   diagrams are shown formatted, not as syntax).
2. **Given** the visual editor, **When** the user selects text and chooses bold, italic,
   strikethrough, inline code or link from the toolbar or with the standard keyboard
   shortcut, **Then** the formatting is applied to the selection and is visible at once.
3. **Given** the visual editor, **When** the user changes the current block to a heading
   (levels 1–6), paragraph, bulleted list, numbered list, task list, quote or code block,
   **Then** the block changes type in place and keeps its text.
4. **Given** the visual editor, **When** the user types "/" at the start of an empty line,
   **Then** a menu offers the insertable blocks (heading, lists, task list, table, quote,
   code block, diagram, image, horizontal rule, link to page), filters them as the user
   types, and inserts the chosen block at that point.
5. **Given** a table in the visual editor, **When** the user edits a cell, adds or removes
   a row or a column, or changes a column's alignment, **Then** the table updates in place.
6. **Given** a task list, **When** the user ticks or unticks an item, **Then** the item's
   state changes and is saved with the page.
7. **Given** edits in visual mode, **When** the user saves with a change description,
   **Then** exactly one commit attributed to the user is created, as for any other save.
8. **Given** edits in visual mode, **When** the user reloads the page or signs in again
   before saving, **Then** the unsaved draft is restored, as in source mode.

---

### User Story 2 - Saving never rewrites what the user did not change (Priority: P1)

A developer keeps their team's pages tidy in Markdown, sometimes edits them in their own
editor and reviews changes as git diffs. A business user edits one paragraph of such a
page in the visual editor. The resulting commit changes only that paragraph's lines. The
rest of the file (list markers, line wrapping, spacing, tables aligned by hand, HTML
comments, Azure DevOps-specific syntax) is exactly as it was.

**Why this priority**: Git is the single source of truth (constitution, Principle V). A
visual editor that reformats whole files on every save would make history and version
comparison useless, create merge conflicts with people editing the files outside the
wiki, and could silently damage content the editor does not understand. Story 1 is not
acceptable without this.

**Independent Test**: For a corpus of real Markdown files, open each file in visual mode
and save without changes, and the file must be byte-identical (no commit is created).
Then change one word in one block of each file. The resulting diff must touch only the
lines of that block.

**Acceptance Scenarios**:

1. **Given** any page, **When** the user opens it in visual mode and saves without making
   changes, **Then** no commit is created and the user is told there was nothing to save.
2. **Given** any page, **When** the user changes text inside one block, **Then** the saved
   file differs from the original only within the lines of that block.
3. **Given** a list or quote, **When** the user changes one item, **Then** only the lines
   of that item change; the other items and their markers and indentation stay as they
   were.
4. **Given** a page that uses a particular style (for example `*` bullets, `_` emphasis,
   `~~~` fences, underlined headings, Windows line endings, no newline at the end of the
   file), **When** the user adds new blocks in visual mode, **Then** the new blocks use the
   same style as the rest of the file.
5. **Given** a page containing content the visual editor cannot represent (raw HTML, HTML
   comments, Azure DevOps `[[_TOC_]]`, front matter, footnotes, or any other unsupported
   construct), **When** it is opened in visual mode, **Then** each such part is shown as a
   clearly labelled placeholder that cannot be edited in visual mode, and saving keeps it
   byte-for-byte; the user can move or delete the placeholder as a whole.
6. **Given** edits in visual mode, **When** the user chooses "Review changes" before
   saving, **Then** they see the change to the file as a comparison of the original and
   the new Markdown, in the same view used for comparing page versions.
7. **Given** a user who undoes all their changes, **When** they save, **Then** the file is
   byte-identical to the original and no commit is created.

---

### User Story 3 - Switch between visual and Markdown mode (Priority: P2)

A technical user prefers Markdown and switches the editor to Markdown mode; the wiki
remembers that. A business user occasionally needs to fix something the visual editor
shows as a placeholder; they switch to Markdown mode, change it, and switch back. Nothing
they typed is lost in either direction.

**Why this priority**: Technical users must not lose the editor they use today, and
placeholders (Story 2) are only acceptable if there is a way to edit them.

**Independent Test**: Edit text in visual mode, switch to Markdown mode, edit there,
switch back, edit again and save. All three edits are present; nothing else changed.
Reload the editor and check the last chosen mode is used.

**Acceptance Scenarios**:

1. **Given** the editor in either mode, **When** the user switches mode, **Then** the
   current content is shown in the other mode with all edits kept, and the cursor or
   selection is placed in the corresponding block where possible.
2. **Given** text typed in Markdown mode, **When** the user switches to visual mode and
   back without editing that text, **Then** it is exactly as typed.
3. **Given** a user who chose a mode, **When** they open the editor again on that browser,
   **Then** the editor opens in that mode.
4. **Given** a user who has never chosen a mode, **When** they open the editor, **Then**
   it opens in visual mode.
5. **Given** a user in Markdown mode, **When** they work as today, **Then** the existing
   write/preview/split layout and behaviour are unchanged.

---

### User Story 4 - Images, diagrams and page links in visual mode (Priority: P2)

A user adds a screenshot by pasting it, inserts a diagram and links to another page in the
same space, all in visual mode, without typing any syntax.

**Why this priority**: These are features the wiki already has (003, 004, 005). Losing
them in visual mode would push users back to Markdown mode for common tasks.

**Independent Test**: In visual mode, paste an image (and give it alternative text),
insert a diagram from the "/" menu and edit its text, insert a link to another page via
the page picker, and save. The page shows the image, the drawn diagram and a working link,
and the commit contains the page and the image in one commit.

**Acceptance Scenarios**:

1. **Given** visual mode, **When** the user pastes or drops an image or uses "Insert
   image", **Then** the image is uploaded, prompted for alternative text and shown in
   place, following all rules of 003 (formats, size limit, storage location, one commit,
   abandoned images never committed).
2. **Given** a diagram block in visual mode, **When** it is not being edited, **Then** it
   is shown drawn, as on the published page; **When** the user opens it for editing,
   **Then** they edit the diagram text with the drawing updated alongside it.
3. **Given** visual mode, **When** the user inserts a link to a page, **Then** a page
   picker lets them search pages of the current space by title or path, and the inserted
   link uses the same link form the wiki already writes for links between pages.
4. **Given** a link in visual mode, **When** the user selects it, **Then** they can see its
   target, open it, change it or remove the link while keeping the text.
5. **Given** an image in visual mode, **When** the user selects it, **Then** they can
   change its alternative text or remove it.

---

### User Story 5 - Paste content from other documents (Priority: P3)

A business user copies a section from a Word document, an e-mail or a web page and pastes
it into the visual editor. Headings, emphasis, lists, links and tables are kept as far as
the wiki supports them; everything else becomes plain text.

**Why this priority**: Much business knowledge already lives in office documents. Pasting
is the natural way to move it, but the core editing value exists without it.

**Independent Test**: Copy a section with headings, a bulleted list, a link and a table
from a word-processor document and paste it. The result shows those elements formatted
and the saved Markdown contains only standard Markdown constructs.

**Acceptance Scenarios**:

1. **Given** formatted content on the clipboard, **When** the user pastes it in visual
   mode, **Then** supported formatting is kept and unsupported formatting (fonts, colours,
   sizes, layout) is dropped; no raw HTML is added to the page.
2. **Given** pasted content containing images as files, **When** it is pasted, **Then**
   the images are added as in 003; images that are only references to other web addresses
   are not inserted and the user is told so.
3. **Given** formatted content, **When** the user pastes it as plain text (the platform's
   "paste as plain text" shortcut), **Then** only the text is inserted.

---

### Edge Cases

- **File details**: Windows (CRLF) or mixed line endings, a missing final newline, a byte
  order mark, tabs, trailing spaces used as line breaks and trailing whitespace are all
  kept in unchanged parts of the file.
- **Hand-wrapped paragraphs**: editing one word in a paragraph wrapped over several lines
  changes only the affected line; lines are not joined or re-wrapped.
- **Reference-style links** and their definitions, escaped characters, HTML entities,
  setext headings, indented code blocks, nested lists with unusual indentation and
  loose/tight lists are kept as written when not edited.
- **Azure DevOps syntax**: `::: mermaid` diagram blocks are shown as diagrams and keep
  their syntax; `[[_TOC_]]` and other unsupported Azure DevOps constructs become
  placeholders.
- **Very large pages** (up to 100 KB, as in 002): the visual editor opens and stays
  responsive while typing.
- **Pages the visual editor cannot open safely** (for example, the parser fails): the
  editor falls back to Markdown mode for that page with a message; the user's chosen mode
  is not changed.
- **Mixed content**: a block that contains both supported text and an unsupported inline
  construct (for example inline HTML) shows the unsupported part as an inline placeholder;
  editing the surrounding text keeps the placeholder's source unchanged.
- **Concurrent edits**: if the page changed in the repository while the user was editing,
  conflict handling is the same as today (001); the user can resolve it in Markdown mode.
- **New pages**: a new page opens in the user's mode; new content follows the wiki's
  default style (see Assumptions).
- **Narrow screens**: the toolbar remains usable on phone and tablet widths (002
  thresholds), collapsing less common actions into a menu.
- **Typing Markdown in visual mode**: typing common shortcuts such as `# `, `- `, `1. `,
  `> ` or ``` ``` ``` at the start of a line converts the block, as users of other
  editors expect; typing `**text**` applies bold.

## Requirements *(mandatory)*

### Functional Requirements

**Visual editing**

- **FR-001**: The editor MUST offer a visual mode that shows the page content formatted as
  on the published page while it is being edited, for: headings 1–6, paragraphs, bold,
  italic, strikethrough, inline code, links, bulleted, numbered and task lists (including
  nesting), quotes, code blocks with a language, tables, horizontal rules, images and
  diagram blocks.
- **FR-002**: Visual mode MUST provide a toolbar for inline formatting, block type, lists,
  links, images, tables and diagrams, and the standard keyboard shortcuts for common
  formatting (bold, italic, link, undo, redo).
- **FR-003**: Visual mode MUST provide a "/" command menu at the start of an empty line,
  filterable by typing and fully operable with the keyboard, that inserts the blocks
  listed in User Story 1, scenario 4.
- **FR-004**: Visual mode MUST support editing tables: editing cells, adding and removing
  rows and columns, and setting column alignment.
- **FR-005**: Typing common Markdown shortcuts at the start of a line (`#`, `-`, `*`,
  `1.`, `>`, `[ ]`, code fence) and around text (`**`, `*`, `` ` ``) MUST convert to the
  corresponding formatting.
- **FR-006**: Visual mode MUST support undo and redo of all edits, including formatting
  and block changes.

**Markdown fidelity**

- **FR-007**: Saving MUST write every part of the file that the user did not change back
  exactly as it was, byte for byte, including whitespace, line endings, blank lines,
  markers, escaping and the presence or absence of a final newline.
- **FR-008**: A change MUST be confined to the smallest block that contains it: a change
  inside a list item or quote MUST NOT alter other items or the surrounding lines, and a
  change inside a paragraph MUST NOT re-wrap or join its other lines.
- **FR-009**: A block counts as unchanged when its content is the same as when it was
  loaded, regardless of how the user got there (including edits that were undone or
  typed back).
- **FR-010**: New and changed blocks MUST be written in the style the file already uses
  (list marker, emphasis and strong markers, code fence, heading style, line endings),
  falling back to the wiki's default style when the file gives no indication.
- **FR-011**: Content the visual editor does not represent (at least raw HTML blocks and
  inline HTML, HTML comments, front matter, footnotes, Azure DevOps `[[_TOC_]]` and other
  unrecognised syntax) MUST be shown as labelled, read-only placeholders that preserve
  their source exactly; the user MUST be able to move or delete a placeholder as a whole
  and MUST be told that it can be edited in Markdown mode.
- **FR-012**: If the resulting file is byte-identical to the version the edit started
  from, saving MUST NOT create a commit and MUST tell the user there were no changes.
- **FR-013**: Before saving, the user MUST be able to review the resulting change as a
  comparison of the original and the new Markdown.
- **FR-014**: The project MUST include an automated round-trip check, run on every change
  to the project, over a corpus of real-world Markdown files (including Azure DevOps Wiki
  pages and the CommonMark specification examples): loading each file into the visual
  editor and saving without changes MUST yield an identical file, and a single-block edit
  MUST change only that block's lines.

**Modes**

- **FR-015**: Users MUST be able to switch between visual mode and Markdown mode at any
  time while editing, without losing or altering content, with keyboard access to the
  switch.
- **FR-016**: Text written in Markdown mode MUST stay exactly as typed after switching to
  visual mode and back, unless the user edits it in visual mode.
- **FR-017**: The editor MUST remember the last chosen mode as an interface preference
  and open in it next time; without a stored preference it MUST open in visual mode.
- **FR-018**: Markdown mode MUST keep today's behaviour unchanged (editor, preview,
  split view, image insertion, drafts).
- **FR-019**: If a page cannot be opened in visual mode, the editor MUST open it in
  Markdown mode with an explanation, without changing the stored preference.

**Existing features in visual mode**

- **FR-020**: Adding images by paste, drop and "Insert image" MUST work in visual mode
  under all rules of 003, including the alternative-text prompt; users MUST be able to
  edit an image's alternative text afterwards.
- **FR-021**: Diagram blocks MUST be shown drawn in visual mode using the same isolated
  drawing as published pages (004); editing a diagram MUST happen on its text with the
  drawing updated alongside.
- **FR-022**: Users MUST be able to insert a link to a page of the current space through a
  page picker that searches by title and path; the link MUST use the same form as links
  the wiki writes elsewhere.
- **FR-023**: Drafts, the change description, save, cancel and conflict handling MUST
  behave the same in both modes.
- **FR-024**: Pasting formatted content in visual mode MUST keep supported formatting,
  drop everything else, and MUST NOT add raw HTML to the page; plain-text paste MUST be
  available.

**Accessibility and safety**

- **FR-025**: Visual mode MUST meet the accessibility rules of 002 (WCAG 2.1 AA): every
  toolbar action and menu is operable with the keyboard, has an accessible name and a
  visible focus; formatting changes and placeholders are announced to assistive
  technology; the editor is usable in both themes.
- **FR-026**: Single-key wiki shortcuts MUST NOT fire while the user types in the visual
  editor (002, FR-016).
- **FR-027**: The visual editor MAY display page content in the browser only under these
  restrictions: content is built exclusively from the supported elements listed in
  FR-001 through a fixed, limited document structure, never by inserting markup produced
  from user content; user-supplied HTML, scripts and styles are never executed or
  rendered and appear only as source text inside placeholders; link and image addresses
  follow the same allowed schemes as the server-side renderer; published pages, page
  versions and the Markdown-mode preview continue to use the server-side renderer. This
  requires the constitution amendment described in Assumptions.

### Key Entities

- **Editor mode**: visual or Markdown; an interface preference stored in the browser like
  the other preferences of 002 (default: visual).
- **Source block**: a part of the page as loaded (a heading, paragraph, list item, table,
  code or diagram block, or placeholder) together with the exact original text it came
  from; used to decide what is written back unchanged.
- **Placeholder**: a part of the page the visual editor does not represent; holds its
  original text verbatim and a short label describing what it is.
- **File style**: the conventions detected in a page (list marker, emphasis markers, code
  fence, heading style, line endings, final newline) applied to new and changed blocks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the files in the round-trip corpus are byte-identical after opening
  in visual mode and saving without changes.
- **SC-002**: In 100% of single-block edits in the corpus check, the resulting diff
  touches only the lines of the edited block.
- **SC-003**: In a usability session, at least 9 of 10 participants who have never written
  Markdown complete the task "fix a sentence, make a word bold, add a bulleted list, a
  heading, a link to another page and a screenshot, and save" without help within 5
  minutes.
- **SC-004**: Switching between visual and Markdown mode never loses or changes content
  (0 failures across the automated mode-switch tests).
- **SC-005**: For pages up to 100 KB, the visual editor is ready to type in within 1
  second of opening and shows typed characters without perceptible delay.
- **SC-006**: Automated accessibility checks of the editor in visual mode report no WCAG
  2.1 AA violations, and every editor function is completed using only the keyboard in
  the acceptance tests.

## Assumptions

- **Mode preference** is stored per browser, like the other interface preferences of 002
  (not tied to the account); "remembered per user" is met on the user's own computer.
- **Visual mode replaces preview**: in visual mode the content already looks like the
  published page, so there is no separate preview pane; the write/preview/split layout
  remains in Markdown mode.
- **Default style for new pages** follows the wiki's existing conventions for newly
  created pages: `-` bullets, `*` emphasis, `**` strong, ATX headings (`#`), backtick
  fences, LF line endings and a final newline.
- **Granularity** of preservation is the block, refined to the line inside paragraphs; a
  change inside a table may rewrite that table's lines (tables are one block).
- **Markdown dialect is unchanged**: visual mode writes only constructs the wiki already
  renders (CommonMark with tables, task lists, strikethrough and the diagram syntax of
  004). It does not introduce colours, font sizes, underline, alignment of paragraphs or
  other formatting Markdown lacks.
- **Discussions** keep their current comment editor; visual editing of comments is out of
  scope.
- **Out of scope**: real-time collaborative editing, inline comments in the editor,
  visual (drag-and-drop) diagram editing, diagrams in discussions, changes to the Markdown
  dialect, and visual editing of the constructs shown as placeholders.
- **Corpus**: the round-trip corpus consists of files the project may store in its
  repository (public CommonMark examples and Azure DevOps-style sample pages written or
  anonymised for the project); private pages from the organization are not committed.
- **Permissions** are unchanged: visual mode is available to everyone who can edit pages.
- **Constitution amendment (dependency)**: the constitution currently allows user content
  to be rendered only on the server (plus isolated diagram drawing). Before planning, it
  is amended (MINOR version) to allow the visual editor's in-browser display under the
  restrictions of FR-027; `SECURITY.md` is updated accordingly. Options considered and
  rejected: editing server-rendered HTML (makes byte-exact preservation of the Markdown
  impractical) and a syntax-highlighting "live preview" in the source editor (does not
  meet the needs of non-technical users).
