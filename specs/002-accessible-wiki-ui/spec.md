# Feature Specification: Consistent, Accessible Wiki Interface

**Feature Branch**: `002-accessible-wiki-ui`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Consistent, accessible wiki interface: dark theme following the OS, responsive layout down to 320 px (tree and discussions collapse into panels), full keyboard operation with shortcuts, clear save/merge/error notifications, visible state indicators (out of sync, old version, read-only), easier commenting on a text selection, page metadata (last change author/time), copy link and download actions."

**Builds on**: [001 Git-Backed Team Wiki](../001-git-backed-team-wiki/spec.md). This
feature changes how the existing capabilities (reading, editing, history, conflict
resolution, discussions, profile) are presented and operated. It adds no new kinds of
content or data on the server.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Always know the state of the page and of my changes (Priority: P1)

A team member reads and edits pages and always understands what they are looking at and
what happened to their work:

- whether the page is the current version or an older one;
- whether the space is out of sync with its repository;
- whether they can edit the space.

After saving, they get a clear confirmation, or a clear explanation of why the save did
not go through. If the page was merged with someone else's change, they are told whose.

**Why this priority**: The wiki writes directly to shared repositories. Misreading an old
version as current, or believing a rejected save went through, causes real damage. Clear
state and feedback deliver value on every screen, with no other story required.

**Independent Test**: Open an old version, an out-of-sync space and a read-only space;
save a page successfully, with an automatic merge, and with a rejection. Verify that each
state and outcome is shown in words, without relying on colour, and is announced to
screen-reader users.

**Acceptance Scenarios**:

1. **Given** a user viewing an earlier version of a page, **When** the page is shown,
   **Then** a clearly worded indicator says it is an older version, shows that version's
   author and date, and offers a one-step way to the current version.
2. **Given** a space whose repository could not be synchronized, **When** a user opens
   any page in it, **Then** an indicator says the content may be outdated and since when.
3. **Given** a user who can read but not edit a space, **When** they view its pages,
   **Then** a "read only" indicator explains why no editing actions are offered.
4. **Given** a user who saves a page, **When** the save succeeds, **Then** a confirmation
   appears and is announced, then disappears on its own after at least 5 seconds.
5. **Given** a user whose save was automatically merged with another person's change,
   **When** the save completes, **Then** the confirmation states that a merge happened and
   names the other author.
6. **Given** a user whose save is rejected, **When** the rejection arrives, **Then** the
   reason is shown next to their preserved text and stays until they dismiss it or act.
7. **Given** several states apply at once (e.g. old version of a page in an out-of-sync
   space), **When** the page is shown, **Then** every applicable indicator is visible.

---

### User Story 2 - Use the wiki on any screen size (Priority: P2)

A team member opens the wiki on a laptop, a tablet or a phone. On wide screens the page
tree, the page and its discussions are visible side by side. On narrower screens, the
tree and the discussions collapse into panels opened on demand, so the page itself always
gets the space. All tasks still work at 320 px width: reading, editing, history, resolving
conflicts and discussing.

**Why this priority**: People read documentation on the go and in split-screen
windows. A wiki that only works on wide screens excludes these situations and fails
accessibility requirements for reflow.

**Independent Test**: At widths of 1280, 1000 and 320 px, complete reading, editing and
commenting on a page, and verify there is no horizontal scrolling of the whole screen.

**Acceptance Scenarios**:

1. **Given** a wide screen, **When** a user opens a page, **Then** the page tree, the page
   and its discussions are visible at the same time.
2. **Given** a medium-width screen, **When** a user opens a page, **Then** the tree and
   the page are visible, and the discussions open in a panel from a button that shows how
   many open discussions there are.
3. **Given** a narrow screen (down to 320 px), **When** a user opens a page, **Then** only
   the page is shown. The tree and the discussions open in panels from clearly labelled
   buttons, and closing a panel returns the user to where they were.
4. **Given** a narrow screen, **When** a user reads a page with a wide table or code
   block, **Then** only that element scrolls horizontally, not the whole page.
5. **Given** a narrow screen, **When** a user edits a page, **Then** they can switch
   between writing and preview and can save with a change description.

---

### User Story 3 - Operate everything with the keyboard (Priority: P3)

A team member who does not use a mouse (by preference, injury or assistive technology)
can reach and operate every function using only the keyboard. They can always see where
the focus is. Common actions have shortcuts, which are listed in the interface.

**Why this priority**: Accessibility is a project-wide requirement (WCAG 2.1 AA).
Keyboard operation is its foundation and benefits power users too.

**Independent Test**: Without touching the mouse:

- move from the space list to a page;
- edit and save it;
- resolve a conflict;
- start, reply to and resolve a discussion;
- delete a page and cancel.

Verify that focus is always visible and is never lost.

**Acceptance Scenarios**:

1. **Given** any screen, **When** the user presses Tab from the start, **Then** the first
   stop is a "skip to content" link, and every interactive element is reachable in a
   logical order with a visible focus indicator.
2. **Given** an open dialog, menu or panel, **When** the user presses Escape or completes
   the action, **Then** it closes and focus returns to the control that opened it.
3. **Given** the user is reading a page they can edit, **When** they press the edit
   shortcut, **Then** the editor opens.
4. **Given** the user is in the editor, **When** they press the save shortcut, **Then**
   the save starts. If the change description is missing, the description field is
   focused and an explanation appears.
5. **Given** any screen, **When** the user opens the shortcut help, **Then** all available
   shortcuts for that screen are listed.
6. **Given** a user who finds single-key shortcuts disruptive, **When** they turn them off,
   **Then** single-key shortcuts stop working in that browser and modifier-key shortcuts
   keep working.
7. **Given** a discussion highlight on a page, **When** the user moves focus to it and
   presses Enter, **Then** its discussion opens.

---

### User Story 4 - Comment on a text selection with little effort (Priority: P4)

While reading, a team member selects a sentence. A "Comment" action appears right next to
the selection, so they can start a discussion without looking for a button elsewhere on
the screen. Keyboard users can do the same with a shortcut after selecting text with the
keyboard.

**Why this priority**: Fragment discussions exist (feature 001), but the starting action
sits far from the text. Making it immediate raises use of the main collaboration feature.

**Independent Test**: Select a sentence with the mouse, then with the keyboard. Start a
discussion each time and measure the steps and time from selection to posted comment.

**Acceptance Scenarios**:

1. **Given** a user who selects text within a page, **When** the selection ends, **Then**
   a "Comment" action appears next to the selection without moving focus away from the
   page.
2. **Given** the action is shown, **When** the user activates it (click, tap or shortcut),
   **Then** a comment box opens with the selected text quoted.
3. **Given** a comment box, **When** the user submits it with the button or the submit
   shortcut, **Then** the discussion is created and its fragment highlighted.
4. **Given** the user changes or clears the selection, scrolls the selection out of view,
   or presses Escape, **When** that happens, **Then** the action disappears.
5. **Given** a selection that extends beyond the page content (e.g. into the navigation),
   **When** the selection ends, **Then** no action is offered.

---

### User Story 5 - See who changed a page and share or download it (Priority: P5)

A team member reading a page sees who last changed it, when, and with what description.
They can copy a link to the page for a chat message, and download the page's Markdown
source.

**Why this priority**: Knowing how fresh a page is and who to ask builds trust in
documentation. Sharing and downloading are frequent small tasks. Each is useful on its
own but less critical than the stories above.

**Independent Test**: Open a page and compare the shown author, time and description with
the repository's latest change of that file. Copy the link, open it in another tab, and
download the source.

**Acceptance Scenarios**:

1. **Given** a page, **When** it is shown, **Then** the author, time and description of
   its last change are visible near the title. The time is shown in a relative form
   ("2 hours ago"), with the exact date and time available.
2. **Given** an older version is shown, **When** the user looks at the page information,
   **Then** it describes that version, not the latest one.
3. **Given** a page, **When** the user chooses "Copy link", **Then** a link to exactly what
   is shown (current page or that specific version) is copied, and a confirmation appears.
4. **Given** the browser refuses clipboard access, **When** the user chooses "Copy link",
   **Then** the link is shown in a field they can copy from manually.
5. **Given** a page, **When** the user chooses "Download", **Then** the Markdown source of
   the shown version is downloaded with the page's file name.

---

### User Story 6 - Dark theme that follows the operating system (Priority: P6)

A team member whose operating system uses a dark appearance sees the wiki in a dark theme,
and in a light theme otherwise, without configuring anything. Changing the system setting
switches the wiki immediately.

**Why this priority**: Comfort and reduced glare in dark environments, and consistency
with the user's other tools. It is useful, but no task depends on it.

**Independent Test**: Switch the OS appearance between light and dark with the wiki open
on each screen. Verify the switch happens without reload and that contrast meets the
accessibility target in both themes.

**Acceptance Scenarios**:

1. **Given** the OS uses a dark appearance, **When** the user opens the wiki, **Then** the
   whole interface uses the dark theme, including the editor, comparison views, page
   content and discussion highlights.
2. **Given** the wiki is open, **When** the user changes the OS appearance, **Then** the
   wiki switches theme within a second without reloading or losing unsaved input.
3. **Given** either theme, **When** any screen is checked, **Then** text and controls meet
   WCAG 2.1 AA contrast, and discussion highlights remain distinguishable from normal
   text.

---

### Edge Cases

- **Long titles and paths** at 320 px: they wrap or are shortened with the full text
  available; they never push content off screen.
- **Many discussions** on a page: the panel stays usable (scrolls on its own); the open
  count stays accurate.
- **Touch devices**: selection made by long-press still offers the "Comment" action
  without conflicting with the device's own selection menu.
- **Leaving after a notification**: a confirmation or error appears just as the user
  navigates away. Success confirmations survive the navigation, and errors stay with the
  preserved text.
- **OS theme changes while a dialog is open or text is being edited**: nothing is lost
  and focus stays where it was.
- **Page too large to display** (feature 001): the download action still works, and
  metadata is still shown.
- **Unknown author details** (e.g. no email): the author name is shown and nothing breaks.
- **Reduced motion**: when the user's system asks for reduced motion, panels and dialogs
  appear without animation.
- **Shortcut conflicts**: shortcuts never fire while the user types in a text field or the
  editor, except explicit modifier-key shortcuts such as save and submit.
- **Session expiry during editing** (feature 001): the notice that asks the user to sign
  in again is reachable by keyboard and announced. The edited text is kept.

## Requirements *(mandatory)*

### Functional Requirements

**Consistency**

- **FR-001**: All screens MUST use the same visual language for equivalent elements:
  buttons, links, form fields, dialogs, menus, notifications and status indicators look
  and behave the same everywhere.
- **FR-002**: Each screen MUST offer at most one visually emphasised primary action
  (e.g. Edit when reading, Save when editing). Other actions MUST be visually secondary
  or grouped in a menu.
- **FR-003**: Destructive or work-discarding actions (delete page, delete comment,
  discard changes, abandon a conflict, remove a token) MUST ask for confirmation, with the
  safe choice focused by default.

**State indicators and notifications**

- **FR-004**: The system MUST show a visible, text-labelled indicator when:
  - the user views an older version (with a one-step way to the current one);
  - the space is out of sync (with the time of the last successful synchronization);
  - the user has read-only access to the space.
- **FR-005**: Indicators and notifications MUST NOT rely on colour alone and MUST be
  announced to assistive technology when they appear.
- **FR-006**: After a successful save, the system MUST show a confirmation that
  disappears on its own after at least 5 seconds and can be dismissed earlier.
- **FR-007**: After an automatically merged save, the confirmation MUST say that a merge
  happened and name the author(s) of the other change.
- **FR-008**: When a save, delete or comment action fails, the system MUST show the
  reason next to the user's preserved input. The message MUST stay until the user
  dismisses it or retries.

**Responsive layout**

- **FR-009**: The interface MUST be fully usable from 320 CSS px wide without horizontal
  scrolling of the screen, except within wide content elements (tables, code blocks,
  comparison views), which scroll on their own.
- **FR-010**: On wide screens (1200 px and more) the page tree, page and discussions MUST
  be shown side by side. Below that, the discussions MUST collapse into a panel opened on
  demand, and below 768 px the page tree MUST also collapse into a panel.
- **FR-011**: The control that opens the discussions panel MUST show the number of open
  discussions on the page.

**Keyboard operation**

- **FR-012**: Every function MUST be operable with the keyboard alone, with a visible
  focus indicator on every interactive element.
- **FR-013**: Each screen MUST start with a "skip to content" link. After navigation to
  another page or view, focus MUST move to that view's main heading, and the new title
  MUST be announced.
- **FR-014**: Closing a dialog, menu or panel MUST return focus to the control that opened
  it. Removing an item (e.g. a deleted comment) MUST move focus to a sensible neighbour,
  never to the start of the document.
- **FR-015**: The system MUST provide keyboard shortcuts at least for:
  - edit the current page;
  - save in the editor;
  - submit a comment or reply;
  - comment on the current selection;
  - open the shortcut help;
  - close the topmost dialog, menu or panel.
- **FR-016**: Shortcuts MUST NOT fire while the user types in a text field or the editor,
  except modifier-key shortcuts intended for that field (save, submit).
- **FR-017**: Users MUST be able to turn off single-key shortcuts. The choice MUST be
  remembered in their browser.
- **FR-018**: Discussion highlights in the page MUST be reachable by keyboard and MUST open
  their discussion when activated.

**Commenting on a selection**

- **FR-019**: When a user selects text within the page content, the system MUST offer a
  "Comment" action positioned next to the selection, without moving focus.
- **FR-020**: The selection action MUST disappear when the selection changes, is cleared,
  leaves the visible area, or when the user presses Escape. It MUST NOT be offered for
  selections that extend beyond the page content.

**Page information and actions**

- **FR-021**: A page view MUST show the author, time and description of the change that
  produced the shown version. The time MUST be relative ("2 hours ago"), with the exact
  date and time available on demand, including by keyboard.
- **FR-022**: Users MUST be able to copy a link to the shown page or page version. When
  clipboard access is unavailable, the link MUST be presented for manual copying.
- **FR-023**: Users MUST be able to download the Markdown source of the shown page
  version, including pages too large to display.
- **FR-024**: Showing page information MUST NOT delay showing the page content.

**Theme**

- **FR-025**: The interface MUST follow the operating system's light or dark appearance
  automatically and MUST switch within one second when that setting changes, without a
  reload and without losing input.
- **FR-026**: Both themes MUST cover every part of the interface, including the editor,
  comparison views, rendered page content and discussion highlights.

**Accessibility and constraints**

- **FR-027**: All screens MUST meet WCAG 2.1 AA in both themes and at all supported
  widths.
- **FR-028**: When the user's system requests reduced motion, the interface MUST not
  animate panels, dialogs or notifications.
- **FR-029**: All visual resources (styles, icons, fonts) MUST be delivered by the wiki
  itself; the interface MUST NOT load anything from other sources.
- **FR-030**: The interface changes MUST NOT relax the wiki's existing protection against
  unsafe page content (feature 001, FR-006).

### Key Entities

- **Interface preference**: a per-browser setting chosen by the user. It currently holds
  only "single-key shortcuts on/off" and is never sent to the server.
- **Notification**: a transient message about the outcome of an action. It has a kind
  (success, information, error), a text, an optional action, and a lifetime (auto-dismiss
  or sticky until dismissed).
- **State indicator**: a persistent message describing the context of the current view
  (older version, out of sync, read-only), shown for as long as the state applies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Automated accessibility checks report 0 WCAG 2.1 AA violations on every
  screen, in both themes, at 1280 px and 320 px width.
- **SC-002**: A tester using only the keyboard completes every core task without help.
  The core tasks are: read, edit and save; create and delete a page; view history and
  compare; resolve a conflict; start, reply to, resolve and reopen a discussion; manage
  the profile. Focus is never lost during these tasks.
- **SC-003**: The same core tasks can be completed at 320 px width with no horizontal
  scrolling of the screen.
- **SC-004**: In a usability test, at least 9 of 10 participants correctly state, within
  5 seconds of seeing the screen, whether the page they see is current, whether it may be
  outdated, and whether they can edit it.
- **SC-005**: Starting a discussion from a selection takes at most 2 interactions after
  selecting, and under 10 seconds for a first-time user (feature 001 target: 30 seconds).
- **SC-006**: 100% of failed saves keep the user's text and show a reason. 100% of merged
  saves name the other author.
- **SC-007**: An OS appearance change is reflected in the wiki within 1 second, without a
  reload.
- **SC-008**: Pages still display within the feature 001 target (under 2 seconds for
  pages up to 100 KB). Page information never delays the content.

## Assumptions

- The theme follows the operating system only; a manual light/dark switch inside the wiki
  is out of scope.
- The set of shortcuts is fixed. Users can turn off single-key shortcuts but cannot remap
  them.
- "Download" means the page's Markdown source. Export to other formats (PDF, HTML, print
  layouts) is out of scope.
- "Copy link" copies a link to the whole page or version. Links to individual headings or
  fragments are out of scope.
- Screen-width thresholds (1200 px and 768 px) are defaults chosen for common laptop,
  tablet and phone sizes. Exact values may be tuned during design as long as FR-009 and
  FR-010 hold.
- No new server-side data or features are introduced. Page information uses history
  information the wiki already has (feature 001, FR-014).
- The supported browsers, the English-only interface, and the restrictions on outside
  resources are those of the project constitution.
- Routes and links from feature 001 stay valid, so existing bookmarks and shared links
  keep working.
