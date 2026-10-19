# Feature Specification: Diagrams in Markdown Pages (Mermaid)

**Feature Branch**: `004-mermaid-diagrams`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "To teraz potrzebujemy dodac wsparcie dla diagramow w makrdownie (Mermeid czy jak im tam)" (Now we need to add support for diagrams in Markdown: Mermaid, or whatever they are called.)

**Builds on**:
- [001](../001-git-backed-team-wiki/spec.md): rendering, safe content, editing and preview.
- [002](../002-accessible-wiki-ui/spec.md): themes, responsive layout, accessibility.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diagrams written as text are shown as diagrams (Priority: P1)

A team member documents a process or an architecture. They write the diagram as text in a
Mermaid code block, as they would for GitHub, GitLab or Azure DevOps Wiki, and the page
shows the drawn diagram instead of the code.

**Why this priority**: Diagrams-as-text are common in engineering documentation. Pages
migrated from other platforms already contain them, and today the wiki shows them as raw
code. Rendering them is the core of the feature.

**Independent Test**: Push a page with a flowchart, a sequence diagram and a class diagram in
Mermaid code blocks. Verify all three appear as diagrams, and the page still loads within
the usual time.

**Acceptance Scenarios**:

1. **Given** a page with a code block marked as Mermaid (` ```mermaid `), **When** the page
   is displayed, **Then** the diagram is shown in place of the code.
2. **Given** a page from Azure DevOps Wiki that uses its own diagram block syntax
   (`::: mermaid` … `:::`), **When** the page is displayed, **Then** the diagram is shown
   the same way.
3. **Given** a page with several diagrams, **When** it is displayed, **Then** each diagram is
   shown where it appears in the text. The rest of the page is readable before the diagrams
   finish drawing.
4. **Given** a diagram with a mistake in its text, **When** the page is displayed, **Then** a
   short error message and the diagram's text are shown in its place, and the rest of the
   page is unaffected.
5. **Given** an older version of a page (001 history), **When** it is displayed, **Then** its
   diagrams are drawn from that version's text.

---

### User Story 2 - See the diagram while editing (Priority: P2)

While editing a page, the writer sees the drawn diagram in the editor preview, updated as
they type. Mistakes are pointed out without interrupting typing.

**Why this priority**: Writing diagram text without seeing the result is error-prone. This
depends on story 1 for drawing, but adds the editing loop.

**Independent Test**: In the editor, type a small flowchart in a Mermaid block. Verify that
the preview shows it within a couple of seconds after typing stops, that a syntax error is
shown as an error, and that fixing it brings the diagram back.

**Acceptance Scenarios**:

1. **Given** a user editing a page, **When** they add or change a Mermaid block, **Then** the
   preview shows the updated diagram shortly after they stop typing.
2. **Given** the diagram text is temporarily invalid while typing, **When** the preview
   updates, **Then** it shows the error message and the text for that diagram only. The rest
   of the preview and the editor keep working.

---

### User Story 3 - Diagrams that everyone can read (Priority: P3)

Readers using the dark theme, a narrow screen or assistive technology can still use diagrams.
In the dark theme, diagrams use matching colours. Large diagrams are scaled to fit the
column, and can be shown at full size, scrolling inside their own area. Screen-reader users get a text alternative, and anyone can switch a
diagram to its text form.

**Why this priority**: The project's accessibility target (WCAG 2.1 AA) and the 002
interface rules apply to all content. Diagrams that only work on a wide, light screen
would exclude people.

**Independent Test**: View a page with diagrams:
- in the dark theme;
- at 320 px width;
- with only the keyboard and a screen reader.

Verify colours follow the theme, the page does not scroll sideways, and the diagram has an
accessible name and a way to read its text.

**Acceptance Scenarios**:

1. **Given** the dark theme (002), **When** a page with diagrams is shown, **Then** the
   diagrams use dark-theme colours with readable contrast, and switch when the theme
   changes.
2. **Given** a diagram wider than the screen, **When** it is shown on a narrow screen,
   **Then** it is scaled to fit; **When** the reader asks for full size, **Then** only the
   diagram area scrolls horizontally, not the page (002 FR-009).
3. **Given** a diagram, **When** a screen-reader user reaches it, **Then** it is announced as
   an image with a name. The name is the diagram's own title or description when the
   author wrote one, and a generic name with the diagram type otherwise.
4. **Given** a diagram, **When** a user activates "Show diagram source" (by keyboard or
   pointer), **Then** the diagram's text is shown in its place, and they can switch back.

---

### Edge Cases

- **Links and interactions in a diagram:** Mermaid can attach links and click actions to
  nodes. Links to other wiki pages or ordinary web addresses work like links in the text.
  Scripts, click handlers and unsafe links are never executed (001 FR-006).
- **References to outside resources:** a diagram that tries to load images, fonts or styles
  from elsewhere does not cause any request to another server.
- **Very large or deeply nested diagrams:** they render within a size limit. Above it, the
  text is shown with a message, so a single page cannot freeze the reader's browser.
- **Unknown or unsupported diagram types:** these are handled like errors: a message plus
  the text.
- **Other code blocks:** code blocks that are not Mermaid are unaffected.
- **Discussions (001 US4):** anchoring keeps working on pages with diagrams. Text inside a
  drawn diagram cannot be selected for a discussion, but the text around it can.
- **Pages too large to render (001):** they stay as they are, offered as a download.

## Requirements *(mandatory)*

### Functional Requirements

**Rendering**

- **FR-001**: Code blocks marked as Mermaid (` ```mermaid `) MUST be displayed as diagrams on
  pages, on older versions of pages, and in the editor preview.
- **FR-002**: Diagram blocks in Azure DevOps Wiki syntax (`::: mermaid` … `:::`) MUST be
  displayed the same way.
- **FR-003**: At least flowcharts, sequence, class, state, entity-relationship and Gantt
  diagrams, pie charts and Git graphs MUST be supported.
- **FR-004**: A diagram that cannot be drawn MUST be replaced by a short error message plus
  its text, without affecting the rest of the page or other diagrams.
- **FR-005**: The page text MUST be shown without waiting for diagrams to be drawn. Drawing
  diagrams MUST NOT delay showing the page beyond the existing target (001 SC-002).
- **FR-006**: Diagrams above a size limit MUST NOT be drawn. They are shown as text with a
  message, so the reader's browser stays responsive.

**Safety**

- **FR-007**: Diagrams MUST NOT run scripts or click handlers, and MUST NOT use unsafe
  links. Links in diagrams MUST follow the same rules as links in page text (001 FR-005,
  FR-006).
- **FR-008**: Displaying a diagram MUST NOT cause any request to a server other than the
  wiki itself (constitution: no outbound connections).
- **FR-009**: Diagram support MUST NOT weaken the protection of page content against unsafe
  markup (001 FR-006). The constitution's rule that page content is rendered and sanitized
  in one place MUST be met, or changed through the constitution's amendment process before
  this feature ships.

**Readability and accessibility**

- **FR-010**: Diagrams MUST follow the light and dark theme (002 FR-025) with WCAG 2.1 AA
  contrast for their text.
- **FR-011**: Diagrams wider than the content area MUST be scaled to fit it by default and
  offer a full-size view that scrolls inside its own area. They MUST never make the page
  scroll horizontally.
- **FR-012**: Each drawn diagram MUST have an accessible name. The name comes from the
  diagram's own title or description (Mermaid's accessibility title and description) when
  present, and is "<Type> diagram" otherwise.
- **FR-013**: Each drawn diagram MUST offer a keyboard-operable control to show its text in
  place of the drawing and back.

### Key Entities

- **Diagram block**: a fenced or Azure DevOps Wiki block in a page whose content is diagram
  text. It has a type (flowchart, sequence, …), an optional title or description, and a
  state when shown: drawn, error, too large, or showing text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the diagram types listed in FR-003, taken from the Mermaid examples
  in common use, are drawn correctly on pages and in the preview.
- **SC-002**: A page with up to 10 typical diagrams (≤ 50 nodes each) shows its text within
  the existing 2-second target, and all its diagrams within 3 seconds once the diagram
  renderer is cached (the first diagram page after a release may take longer; research.md R4).
- **SC-003**: In the editor, the preview reflects a change to a diagram within 2 seconds
  after typing stops.
- **SC-004**: A security test suite with script injection, click handlers, unsafe links and
  external resource references inside diagrams produces 0 script executions and 0 requests
  to other servers.
- **SC-005**: The automated accessibility checks (002) report 0 WCAG 2.1 AA violations for
  pages with diagrams, in both themes and at 1280 and 320 px.
- **SC-006**: A page migrated from Azure DevOps Wiki with its diagram blocks displays 100% of
  its diagrams without editing.

## Assumptions

- Mermaid is the only diagram language in scope. PlantUML, Graphviz and others are out of
  scope: they would need a separate rendering service, and the constitution forbids new
  external services.
- Diagrams are drawn in pages, page versions and the editor preview. Comments in
  discussions keep showing diagram text as code; drawing there can be added later.
- Exporting diagrams as images, zooming, and editing diagrams visually are out of scope.
- The size limit (FR-006) is a reasonable default that the plan will set, e.g. by the
  amount of diagram text or the number of elements. Deployers do not need to configure it.
- The constitution currently requires page content to be rendered and sanitized on the
  server in one place, and forbids the interface from rendering HTML from other sources.
  Because diagrams are usually drawn in the browser, planning must either find a way to
  meet this rule or propose an amendment (FR-009). This is a known decision for the plan,
  not an open question about what users need.
