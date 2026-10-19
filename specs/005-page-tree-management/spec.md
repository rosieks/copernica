# Feature Specification: Managing the Page Tree

**Feature Branch**: `005-page-tree-management`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Dobra to teraz ogarnijmy zarzadzanie lista stron po lewej" (Now let's sort out managing the page list on the left.)

**Builds on**:
- [001](../001-git-backed-team-wiki/spec.md): spaces, page tree, creating and deleting pages,
  attributed commits, conflict detection, discussions following moved pages. 001 listed
  "page rename through the UI" as out of scope; this feature specifies it.
- [002](../002-accessible-wiki-ui/spec.md): accessible tree, keyboard operation,
  confirmations, notifications, responsive panels.

## Clarifications

### Session 2026-10-19

- Q: How are links in other pages handled when a page is renamed or moved? → A: Updated
  automatically in the same commit.
- Q: Is custom order supported, and how is it stored? → A: Yes, as an Azure DevOps
  Wiki-compatible `.order` file per folder, committed to the repository and editable from
  the UI.

## User Scenarios & Testing *(mandatory)*

Today the page tree on the left can only be browsed. Pages are created from a single
"New page" button by typing a path, deleted from the page's own actions, and cannot be
renamed or moved at all without leaving the wiki and using git. Folders cannot be managed.
This feature lets people with write access organize a space directly from the tree.

### User Story 1 - Rename and move a page (Priority: P1)

A team member notices a page is badly named or sits in the wrong folder. From the tree (or
from the page itself) they rename it or move it to another folder, enter a short change
description, and confirm. The page appears at its new place in the tree, its address
changes, the old address leads to the new one, and its history and discussions stay with
it.

**Why this priority**: Reorganizing content is the most common reason people currently
leave the wiki for git; without it, a space's structure decays as it grows.

**Independent Test**: Rename a page and move another to a different folder; verify each
change is one attributed commit, the tree shows the new locations, history and
discussions are still attached, and the old address leads to the new page.

**Acceptance Scenarios**:

1. **Given** a user with write access viewing a page, **When** they choose "Rename" for it,
   enter a new name and a change description and confirm, **Then** the page file is renamed
   in a single commit attributed to them and the tree and address bar show the new name.
2. **Given** a user with write access, **When** they choose "Move" for a page and pick a
   destination folder (including the space root), **Then** the page file is moved there in a
   single attributed commit and the tree shows it in the destination folder.
3. **Given** a renamed or moved page with open discussions, **When** anyone opens it at its
   new location, **Then** its discussions and full history (including commits made before
   the move) are shown as before.
4. **Given** a page that was renamed or moved, **When** someone opens its old address (for
   example from a bookmark), **Then** they are taken to the page at its new location and
   told that it has moved.
5. **Given** a new name or destination where a page with that name already exists, **When**
   the user confirms, **Then** nothing is changed and they are told the name is taken.
6. **Given** a page that someone else changed after the user started the rename or move,
   **When** they confirm, **Then** the change is still applied without losing the other
   person's edit, or, if that is not possible, a conflict is reported and nothing is
   overwritten.
7. **Given** other pages in the space that link to a page, **When** the user renames or
   moves it, **Then** those links are updated to the new location in the same commit, and
   the confirmation tells the user how many pages will be updated.
8. **Given** a page that links to other pages with relative links, **When** it is moved to
   another folder, **Then** its own links are adjusted so they still lead to the same pages.

---

### User Story 2 - Create pages and folders from the tree (Priority: P1)

A team member wants to add a page next to an existing one or inside a specific folder.
Instead of typing a full path, they open the actions of a folder (or of the space root) in
the tree and choose "New page here" or "New folder". A new folder is created together with
its first page, since git cannot hold empty folders.

**Why this priority**: Creating content in the right place is the everyday entry point;
the current path-typing dialog is error-prone and hides the structure.

**Independent Test**: From a folder's actions create a page in it; from the root's actions
create a new folder with a first page; verify both appear in the tree in the right place
after saving.

**Acceptance Scenarios**:

1. **Given** a user with write access, **When** they choose "New page here" on a folder in
   the tree, **Then** the new-page dialog opens with that folder preselected and the editor
   opens for a page in that folder.
2. **Given** a user with write access, **When** they choose "New folder" on a folder or on
   the space root and enter a folder name and a first page name, **Then** the editor opens
   for that first page, and after saving both the folder and the page appear in the tree.
3. **Given** a user who cancels the editor before saving a page in a new folder, **When**
   they look at the tree, **Then** no empty folder is left behind.
4. **Given** a user without write access, **When** they browse the tree, **Then** no
   creation, rename, move or delete actions are offered.

---

### User Story 3 - Rename, move and delete folders (Priority: P2)

A team member restructures a section of the space: they rename a folder, move it under
another folder, or delete a whole obsolete section. All pages inside follow (or are
removed) in a single change.

**Why this priority**: Needed for larger reorganizations, but less frequent than
single-page changes and riskier, so it follows the page-level operations.

**Independent Test**: Rename a folder containing nested pages and delete another folder;
verify each is a single attributed commit, all contained pages appear under the new folder
(or disappear), and their discussions and history follow.

**Acceptance Scenarios**:

1. **Given** a folder with nested pages, **When** a user renames or moves it and confirms,
   **Then** all pages and other files in it are moved in a single attributed commit and keep
   their history and discussions, and links to and from those pages are updated in the same
   commit.
2. **Given** a folder, **When** a user chooses "Delete folder", **Then** they see how many
   pages will be removed, must confirm explicitly, and on confirmation all pages in it are
   removed in a single attributed commit; they remain available in the repository history.
3. **Given** a move of a folder into itself or one of its own subfolders, **When** the user
   picks such a destination, **Then** it is not offered or is rejected with an explanation.

---

### User Story 4 - Reorganize by dragging, with a keyboard equivalent (Priority: P3)

A team member drags a page or folder in the tree onto another folder to move it. Keyboard
and screen-reader users get the same result through the "Move" action, so dragging is a
shortcut, never the only way.

**Why this priority**: Convenient for frequent organizers, but every outcome is already
available through the actions in User Stories 1–3.

**Independent Test**: Drag a page onto a folder, confirm the change description, and
verify the result equals using "Move".

**Acceptance Scenarios**:

1. **Given** a user with write access, **When** they drag a page or folder onto another
   folder (or the root) and drop it, **Then** the same confirmation as "Move" is shown,
   prefilled with the destination.
2. **Given** a drop target that is not allowed (the item's own folder, itself, its own
   subfolder), **When** the user drags over it, **Then** it is visibly marked as not
   accepting the drop.
3. **Given** a touch device, **When** a user long-presses or drags an item, **Then** the tree
   still scrolls normally and moving remains available through the item's actions.

---

### User Story 5 - Control the order of pages in the tree (Priority: P3)

A team wants an "Overview" page first and a "Getting started" section before the reference
pages, instead of strict alphabetical order. The order is kept in the repository the same
way Azure DevOps Wiki keeps it (an order file per folder), so a repository shared with an
Azure DevOps Wiki looks the same in both.

**Why this priority**: Improves navigation, but the tree is usable with alphabetical order.

**Independent Test**: Change the position of a page within its folder and verify everyone
sees the new order after reload, the order file in the repository reflects it, and a
repository with existing Azure DevOps Wiki order files is shown in that order.

**Acceptance Scenarios**:

1. **Given** a folder with several pages, **When** a user with write access chooses "Move
   up" or "Move down" on a page or subfolder, **Then** its position among its siblings
   changes in a single attributed commit and everyone sees the new order.
2. **Given** a user with write access, **When** they drag a page or folder between two
   siblings in the same folder, **Then** it is placed there, with the same result as the
   move up/down actions.
3. **Given** a repository whose folders already contain Azure DevOps Wiki order files,
   **When** a user opens the space, **Then** the tree shows items in that order.
4. **Given** a folder with an order file, **When** items not listed in it exist (for example
   added outside the wiki), **Then** they are shown after the listed items in alphabetical
   order; entries naming items that no longer exist are ignored.
5. **Given** a folder without an order file, **When** a user opens the space, **Then** items
   are shown alphabetically, as today, and an order file is created only when someone first
   changes the order.
6. **Given** a page that is created, renamed, moved or deleted in a folder that has an order
   file, **When** the change is committed, **Then** the order files of the affected folders
   are updated in the same commit so the item keeps (or takes) a sensible position.

---

### Edge Cases

- Two users rename or move the same page at the same time: the second change is rejected
  as a conflict and the user sees the current state; nothing is silently overwritten.
- A page is edited in one browser tab while it is renamed or moved in another: saving the
  edit detects that the page moved and does not recreate it at the old location.
- A page is reordered by one user while another adds a page to the same folder: both
  changes survive; the order file is not silently overwritten.
- A user has unsaved draft changes to a page that is then moved by someone else: the draft
  is not lost; the user is told the page moved and can still save to its new location.
- A move or rename that changes only letter case (e.g. `Setup.md` → `setup.md`): it is
  applied correctly regardless of the deployment's file system.
- Names containing characters that are invalid in file names, leading/trailing spaces,
  `.`/`..`, or `/` where a single name is expected: rejected with a clear message before
  anything is committed.
- A folder contains non-page files (images, attachments): they move or are deleted together
  with the folder, and images referenced by moved pages keep displaying.
- A page references images stored next to it with relative paths: after a single-page move
  its images still display (they are moved with it, or the references keep working).
- The space is read-only or out of sync: management actions are disabled with an
  explanation, as for editing.
- The repository rejects the push (branch policy, permissions): nothing changes in the tree
  and the user sees the reason, as for saving a page.
- The space's home page is renamed or moved: the space still opens on a sensible page.
- A very large folder (hundreds of pages) is moved or deleted: the operation completes as
  one change and the user sees progress or a busy state until it finishes.
- A page that links to the moved page was changed by someone else meanwhile: updating its
  links is covered by the same conflict detection; no edit is overwritten.
- Links to the moved page from other spaces, or written as absolute web addresses of the
  wiki: they are not rewritten; old addresses still redirect (FR-010).
- Links inside code blocks or inline code: they are not changed.
- A link targets a heading in the moved page (`page.md#section`): the anchor is kept.
- An order file is malformed or lists names in a different letter case: the tree still
  loads, using as much of the file as can be understood, with the rest alphabetical.
- An old address is opened after the page was moved again, or after it was deleted: a chain
  of moves still leads to the current location; a deleted page shows "not found" with a
  link to its history.

## Requirements *(mandatory)*

### Functional Requirements

**Actions in the tree**

- **FR-001**: Every page and folder in the tree, and the space root, MUST offer its
  management actions (for pages: open, rename, move, delete, new page next to it; for
  folders and root: new page here, new folder, rename, move, delete) through an actions
  menu that is reachable with mouse, touch and keyboard.
- **FR-002**: Management actions MUST be shown only to users with write access to the
  space, and MUST be disabled with an explanation while the space is read-only or out of
  sync.
- **FR-003**: Rename, move and delete of the current page MUST also be available from the
  page's own actions, consistent with the tree.

**Rename and move**

- **FR-004**: Users MUST be able to rename a page or folder and move it to any folder of the
  same space, including the root.
- **FR-005**: Every rename, move or delete (of a page or a whole folder), including the link
  and order-file updates it causes, MUST be recorded as exactly one commit attributed to the user, with a change description they can edit
  (prefilled with a sensible default such as "Move a.md to guides/a.md").
- **FR-006**: The system MUST record renames and moves so that the page's history continues
  across the change and the page's discussions stay attached to it.
- **FR-007**: The system MUST reject a rename or move whose target already exists, whose
  name is invalid, or that would move a folder into itself or its subfolders, without
  changing anything.
- **FR-008**: Concurrent changes MUST be detected: if the page or folder was changed or
  moved by someone else since the user loaded it, the operation MUST NOT overwrite that
  change; it is either safely combined or reported as a conflict.
- **FR-009**: After a successful rename or move, the user MUST stay on (or be taken to) the
  page at its new address, the tree MUST reflect the change, and other users MUST see the
  change in their tree without manual steps beyond the normal refresh.
- **FR-010**: Opening the old address of a renamed or moved page MUST lead to its current
  location with a notice that the page has moved, also after several successive moves.
- **FR-011**: When a page or folder is renamed or moved, links in other pages of the same
  space that point to the affected pages MUST be updated to the new location in the same
  commit; relative links inside the moved pages MUST be adjusted so they still point to the
  same targets. Link text, heading anchors and links inside code MUST be preserved, and the
  confirmation MUST state how many other pages will be changed.
- **FR-012**: Images and other files that a moved page references with relative paths MUST
  keep displaying after the move.

**Create**

- **FR-013**: Users MUST be able to start a new page in a chosen folder (or the root) from
  the tree, with the folder preselected and only a page name to enter.
- **FR-014**: Users MUST be able to create a new folder by giving its name and the name of
  its first page; the folder exists in the repository once that page is saved, and no empty
  folder remains if the user abandons the new page.

**Delete**

- **FR-015**: Deleting a folder MUST show the number of pages that will be removed and
  require explicit confirmation; the deletion MUST be a single commit, and the removed
  pages MUST remain recoverable from history.
- **FR-016**: Discussions of deleted pages MUST be handled as for single-page deletion in
  001.

**Drag and drop**

- **FR-017**: Users with write access MUST be able to move pages and folders by dragging
  them onto a folder or the root in the tree; dropping MUST open the same confirmation as
  "Move". Invalid targets MUST be visibly marked.
- **FR-018**: Every drag-and-drop result MUST also be achievable with the keyboard and with
  assistive technology through the actions menu; dragging MUST NOT interfere with scrolling
  the tree on touch devices.

**Order**

- **FR-019**: The order of pages and folders within a folder MUST be read from an order
  file in that folder, compatible with the Azure DevOps Wiki `.order` format; items not
  listed MUST follow the listed ones alphabetically, and folders without an order file MUST
  keep today's alphabetical order. Order files MUST NOT be shown as pages.
- **FR-020**: Users with write access MUST be able to change an item's position among its
  siblings with "Move up" / "Move down" actions and by dragging within the folder; each
  change MUST be one attributed commit that creates or updates the folder's order file.
- **FR-021**: Creating, renaming, moving or deleting pages and folders MUST keep the order
  files of the affected folders consistent in the same commit.

**Accessibility and feedback**

- **FR-022**: All new actions, dialogs and the drag-and-drop feedback MUST meet the
  accessibility requirements of 002: keyboard operable, labelled, announced to screen
  readers, with focus returned to a sensible element (the moved or renamed item, or its
  nearest neighbour after a deletion).
- **FR-023**: Success, conflict and failure of every operation MUST be reported with the
  notifications defined in 002, including the reason when the repository rejects a change.

### Key Entities

- **Page**: A Markdown file in a space; identified by its path. Renaming or moving changes
  its path but not its identity for history and discussions.
- **Folder**: A directory in the space containing pages and possibly other files; exists
  only while it contains at least one file.
- **Tree operation**: A rename, move, create or delete of a page or folder; becomes one
  attributed commit with a change description and a base version used for conflict
  detection.
- **Folder order**: The optional order file of a folder, listing its pages and subfolders in
  display order; stored in the repository and compatible with Azure DevOps Wiki.
- **Page move record**: The link from a page's former path to its current path, derived
  from repository history, used to redirect old addresses and keep discussions attached.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can rename or move a page from the tree in under 30 seconds, without
  leaving the wiki.
- **SC-002**: 100% of rename, move and delete operations produce exactly one attributed
  commit, and the repository remains usable with ordinary git tooling afterwards.
- **SC-003**: After a rename or move, 100% of the page's discussions and full history are
  still shown at the new location.
- **SC-004**: Old addresses of moved pages lead to the current page in 100% of cases where
  the page still exists.
- **SC-005**: Every tree management task can be completed using only the keyboard, and with
  a screen reader, as verified in the accessibility review.
- **SC-006**: Moving or deleting a folder of 500 pages completes within 10 seconds on a
  typical deployment, and the tree stays responsive meanwhile.
- **SC-007**: No concurrent-change scenario from the Edge Cases results in a lost edit.
- **SC-008**: After a rename or move, no link within the space that worked before points to
  the old location.
- **SC-009**: A repository with Azure DevOps Wiki order files shows the same order in the
  wiki as in Azure DevOps Wiki.

## Assumptions

- Operations are limited to a single space; moving pages between spaces (which may be
  different repositories) is out of scope.
- Who may manage the tree is the same as who may edit pages (write access to the space); no
  new permission level is introduced.
- Page titles shown in the tree continue to come from the page's first heading, otherwise
  the file name; "Rename" changes the file name (and thereby the address). Changing the
  heading remains a normal page edit. The rename dialog may offer to update the heading as
  a convenience, but is not required to.
- File names of new and renamed pages follow the existing convention of the new-page
  dialog (spaces become hyphens, `.md` is added).
- Old-address redirects are derived from repository history rather than stored as a
  separate authoritative list, consistent with git being the source of truth.
- The existing global "New page" button stays, in addition to the actions in the tree.
- Link updates cover Markdown links within the same space (relative, space-root and
  `wiki:` links to the same space). Links from other spaces are not rewritten; they rely on
  the old-address redirect.
- Other Azure DevOps Wiki conventions (e.g. a page with the same name as a folder acting as
  that folder's page) are not part of this feature.
- Bulk selection of several unrelated pages for a single operation is out of scope.
