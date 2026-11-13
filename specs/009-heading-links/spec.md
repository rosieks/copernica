# Feature Specification: Links to Headings

**Feature Branch**: `009-heading-links`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Headings of level H1, H2 and H3 are linkable." (Polish
original: "Nagłówki typu H1, H2, H3 są linkowalne.")

**Builds on**:
- [001 Git-Backed Team Wiki](../001-git-backed-team-wiki/spec.md): page rendering, page
  addresses and earlier versions of a page.
- [002 Consistent, Accessible Wiki Interface](../002-accessible-wiki-ui/spec.md):
  keyboard, screen reader and focus rules, themes.
- [005 Page Tree Management](../005-page-tree-management/spec.md): links between pages and
  the page picker.
- [007 Visual Page Editor](../007-wysiwyg-editor/spec.md): inserting links in the visual
  editor.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share a link to a section (Priority: P1)

A reader finds the part of a long page that answers a colleague's question. Next to the
section heading there is a "copy link to this section" control. The reader copies the link
and pastes it into a chat; the colleague who opens it lands on that section, not at the
top of the page.

**Why this priority**: This is the reason for the feature. Today the only way to point at a
section is to send the page link and say "scroll down to …".

**Independent Test**: Open a page with several H2 headings, copy the link of the third one,
open it in a new browser tab, and check that the page opens scrolled to that heading.

**Acceptance Scenarios**:

1. **Given** a page with headings of level 1, 2 and 3, **When** the reader points at or
   moves keyboard focus to one of them, **Then** a "copy link to this section" control is
   available for that heading.
2. **Given** the control of a heading, **When** the reader activates it with the mouse or
   the keyboard, **Then** the full address of the page with that section is copied, and a
   short confirmation is shown and announced to screen readers.
3. **Given** a copied section link, **When** anyone with access to the space opens it,
   **Then** the page opens with that heading at the top of the reading area, not hidden
   behind the fixed page header, and the heading is briefly highlighted.
4. **Given** a heading of level 4, 5 or 6, **When** the reader looks at it, **Then** it has no
   copy-link control (it keeps an address, see FR-004).
5. **Given** a reader who cannot copy to the clipboard (permission refused by the browser),
   **When** they activate the control, **Then** the address bar shows the section link so
   they can copy it by hand, and they are told so.

---

### User Story 2 - Section links inside the wiki work (Priority: P1)

Page authors already write links such as `[see Setup](#setup)` or
`[Deployment notes](/Operations/Deploy#rollback)`. Today the wiki opens the right page but
does not move to the section. With this feature every such link, typed by hand or copied,
lands on the section, both on first load and when moving between pages inside the wiki.

**Why this priority**: Without it the copied links of User Story 1 work only half way, and
existing content with section links keeps misleading readers.

**Independent Test**: On a page with a table of contents written as section links, click
each entry and use the browser's Back button; check that each click moves to the section
and Back returns to the previous position.

**Acceptance Scenarios**:

1. **Given** a link to a section of the same page, **When** the reader activates it,
   **Then** the page scrolls to the section, the address shows the section, and keyboard
   focus moves to the heading so the next Tab continues from there.
2. **Given** a link to a section of another page in the same or another space, **When** the
   reader activates it, **Then** the other page opens at that section.
3. **Given** the reader followed one or more section links, **When** they use the browser's
   Back and Forward buttons, **Then** they return to the previous sections and pages.
4. **Given** a section link whose heading no longer exists (renamed or removed), **When** the
   reader opens it, **Then** the page opens at the top as it does today, with no error, and
   the reader is told that the section was not found.
5. **Given** an earlier version of a page, **When** the reader opens a section link to that
   version, **Then** it lands on the heading as it was in that version.
6. **Given** a section link written for an Azure DevOps Wiki (the format its own "copy link"
   produces), **When** the reader opens it in this wiki, **Then** it lands on the same
   heading.

---

### User Story 3 - Link to a section while editing (Priority: P2)

An author writing a page wants to link to a section of another page. In the visual editor's
link dialog, after choosing the page in the page picker, they can also choose one of that
page's headings, so they do not have to guess the section address.

**Why this priority**: Makes section links easy to create; readers benefit from User Stories
1 and 2 even without it, because authors can paste copied links.

**Independent Test**: In the visual editor insert a link, pick a page, pick one of its
H2 headings, save, and check that the saved link opens that section.

**Acceptance Scenarios**:

1. **Given** the link dialog with a page chosen, **When** the author opens the section list,
   **Then** it shows that page's H1–H3 headings in page order, indented by level.
2. **Given** a heading chosen in the list, **When** the author confirms, **Then** the link
   points to that page and section, in the same link form the editor already uses.
3. **Given** the page currently being edited, **When** the author chooses "this page",
   **Then** the list shows the headings of the current, unsaved text.
4. **Given** the author does not choose a section, **When** they confirm, **Then** the link
   points to the page as it does today.
5. **Given** the Markdown source mode, **When** the author types a section link by hand,
   **Then** nothing changes compared with today (no picker is required there).

---

### Edge Cases

- Two headings with the same text on one page: each has its own distinct address (the
  second gets a numbered suffix), and copying either link leads to the right one.
- A heading whose text is only punctuation, emoji or non-Latin script (for example Polish
  letters such as "Zażółć"): it still gets a usable, stable address; letters outside
  English are kept, not dropped.
- A heading made of a link, inline code or bold text: the address is based on its visible
  text, and the copy-link control does not interfere with following the heading's own link.
- A heading inside a quote, list or table cell: it gets an address as well. A heading inside
  a code block is just code and gets nothing.
- A heading whose address equals an identifier used by the wiki's own interface: the page
  heading never takes over or breaks the interface element, and the link still lands on the
  heading.
- A section link opened while the page is still loading images or diagrams: the final
  position is the heading, even if content above it changes height after it loads.
- A section link on a page that is too large to render (shown as source): the page opens as
  it does today, without an error.
- A section link inside a discussion comment or a diagram: it behaves like the same link in
  the page.
- The wiki's own page title (shown when a page has no H1): it is not a section of the page
  and has no copy-link control.
- Printing a page: the copy-link controls do not appear on paper.

## Requirements *(mandatory)*

### Functional Requirements

**Copy-link control**

- **FR-001**: Every rendered heading of level 1, 2 and 3 on a page MUST offer a "copy link to
  this section" control. Headings of level 4–6 MUST NOT show it.
- **FR-002**: The control MUST be reachable and operable with the keyboard, have an
  accessible name that includes the heading text, and be visible when the heading is
  pointed at, when the control has focus, and on touch devices without hovering. It MUST
  follow the 002 rules (contrast, focus indicator, themes) and MUST NOT change the heading's
  text as read by screen readers or as copied with the page text.
- **FR-003**: Activating the control MUST copy the absolute address of the page with the
  section, update the address bar to it without reloading, and show and announce a short
  confirmation. If copying is refused, the reader MUST be told that the address bar holds
  the link.

**Section addresses**

- **FR-004**: Every heading of every level MUST keep the section address it gets today, so
  existing links keep working. Addresses MUST be stable: the same heading text in the same
  position of a page always yields the same address, across versions and rendering.
- **FR-005**: Headings with the same address on one page MUST get distinct addresses in
  page order, the same way for every reader and in the editor's section list.
- **FR-006**: Section addresses MUST keep letters of any script (for example Polish
  diacritics) rather than dropping them.
- **FR-007**: A section link in the format produced by Azure DevOps Wiki for a heading MUST
  lead to the same heading as this wiki's own format, so links in content migrated from or
  shared with Azure DevOps keep working. Links written in this wiki MUST use this wiki's own
  format.
- **FR-008**: Page headings MUST NOT be able to take over identifiers of the wiki's own
  interface elements.

**Opening section links**

- **FR-009**: Opening a page address with a section, by first load, link within the wiki,
  link from another page, or Back/Forward, MUST bring the heading into view below the fixed
  page header, briefly highlight it in a way that respects the reader's reduced-motion
  setting, and move keyboard focus to it.
- **FR-010**: The final position MUST account for content above the heading that changes
  height after the page appears (images, diagrams).
- **FR-011**: When the section does not exist on the opened page or version, the page MUST
  open at the top and the reader MUST be told, unobtrusively, that the section was not
  found. No error page is shown.
- **FR-012**: Section links MUST work in the current version of a page, in earlier versions,
  in discussion comments and in links inside diagrams, wherever links to pages work today.
- **FR-013**: Moving between sections MUST create browser history entries so Back and
  Forward return to previous sections.

**Editor**

- **FR-014**: The visual editor's link dialog MUST let the author optionally choose an
  H1–H3 heading of the chosen page, shown in page order and indented by level, including
  the headings of the unsaved text of the page being edited.
- **FR-015**: The resulting link MUST use the same address the reader's copy-link control
  produces for that heading, in the link form the editor already writes for pages.
- **FR-016**: Saving a page MUST NOT add identifiers or other markup to the headings in the
  page's file; addresses are derived from the heading text when the page is shown.

**Scope limits**

- **FR-017**: The feature MUST NOT change how pages are stored, MUST NOT update links when a
  heading is renamed, and MUST NOT add a generated table of contents. Azure DevOps
  `[[_TOC_]]` stays a placeholder as today.

### Key Entities

- **Section**: A heading of a page version, with its level, visible text and section
  address. Derived from the page text when shown; never stored.
- **Section address**: The part of a link after `#` that identifies a section within a page.
  Unique within a page version.
- **Section link**: A page address plus a section address, as copied by a reader or written
  by an author.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can copy a link to any H1–H3 heading in at most two actions (point or
  focus, then activate), with mouse, keyboard or touch.
- **SC-002**: 100% of section links in a test corpus of pages (duplicate headings, Polish
  text, punctuation, emoji, inline formatting, images and diagrams above the heading) land
  on the intended heading on first load and on in-wiki navigation, in all supported
  browsers.
- **SC-003**: In the same corpus, links written in the Azure DevOps Wiki format land on the
  same heading as this wiki's own links for every heading.
- **SC-004**: After a section link opens, the heading's top edge is fully visible and within
  the top quarter of the reading area.
- **SC-005**: The copy-link control and section navigation pass the 002 accessibility checks
  (automated scan with no violations, keyboard-only and screen reader walkthrough).
- **SC-006**: Every section link that works before this feature still lands on the same
  heading after it (no existing address changes).
- **SC-007**: An author can insert a link to a section of another page in the visual editor
  without typing the section address.

## Assumptions

- "Linkable" means a reader can get a link to the heading and the link leads to it. Only
  H1–H3 get the visible control, as asked; H4–H6 keep their addresses for hand-written links
  but are too fine-grained for a control on every one.
- The section address format already produced by the wiki (GitHub-style: lowercase, spaces
  become hyphens) stays the wiki's own format, because changing it would break existing
  links (SC-006). Azure DevOps Wiki links are accepted in addition, not instead.
- Section addresses are derived per page version, so a link to a renamed heading stops
  matching. Rewriting links on heading rename (as 005 does for page renames) is a possible
  later feature.
- Copying uses the browser's clipboard; no server change is needed to copy a link.
- A generated table of contents (including Azure DevOps `[[_TOC_]]`) is a separate, later
  feature listed in the roadmap.
- Access rules are unchanged: a section link gives no access beyond the page's own.
