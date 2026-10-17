# Feature Specification: Git-Backed Team Wiki

**Feature Branch**: `001-git-backed-team-wiki`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Shared team wiki serving Markdown pages from multiple git repositories in one deployment, with authenticated editing (commits attributed to users), conflict detection, and page discussions stored outside the repositories. Discussions should refer to specific fragments of text and should allow replies."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and read pages from multiple repositories (Priority: P1)

A team member signs in to the team's wiki and sees a list of the knowledge spaces
available in this deployment—one per configured git repository (or folder within a
repository). They open a space, navigate its page tree, and read pages rendered from
Markdown. Links between pages work, including links to pages in other spaces, and images
stored in the repository are displayed.

**Why this priority**: Reading shared knowledge is the core value of a wiki. With only this
story, a team can already publish its existing Markdown documentation from several
repositories in one place.

**Independent Test**: Configure a deployment with two repositories containing Markdown
files, sign in, and verify that both spaces are listed, pages render correctly, and
relative and cross-space links navigate to the right pages.

**Acceptance Scenarios**:

1. **Given** a deployment configured with repositories A and B, **When** a signed-in user
   opens the wiki, **Then** they see both spaces with their display names.
2. **Given** a space whose repository contains nested folders of Markdown files, **When**
   the user opens the space, **Then** they see a navigable page tree mirroring the folder
   structure and can open any page.
3. **Given** a page that links to another page with a relative path, **When** the user
   follows the link, **Then** the target page opens in the wiki (not as a raw file).
4. **Given** a page containing embedded HTML or script content, **When** it is displayed,
   **Then** no script is executed and unsafe markup is removed.
5. **Given** a user who is not signed in, **When** they open any wiki URL, **Then** they
   are asked to sign in and no page content is shown.
6. **Given** a signed-in user who has no access to repository B in the git hosting
   platform, **When** they open the wiki, **Then** space B is not listed and its pages,
   files and discussions cannot be opened.
7. **Given** a page that was changed by a commit made outside the wiki, **When** the
   change has been picked up from the repository, **Then** users see the new content.

---

### User Story 2 - Edit and create pages with attributed history (Priority: P2)

A signed-in team member edits an existing page in a Markdown editor with a preview, or
creates a new page in a chosen folder of a space. When they save with a short change
description, the change is recorded in the repository's history under their own name, and
other users see the updated page. Users can view a page's history and the content of any
earlier version.

**Why this priority**: Editing in place turns a documentation viewer into a wiki. It
depends on Story 1 for navigation but is otherwise self-contained.

**Independent Test**: Edit a page through the wiki, then inspect the repository with
ordinary git tooling and verify a new commit exists with the user as author, the change
description as message, and the expected file content.

**Acceptance Scenarios**:

1. **Given** a user with write access to a space, **When** they edit a page and save it
   with a change description, **Then** the repository contains a new commit with the
   user's name and email as author and the description as the commit message.
2. **Given** a user with write access, **When** they create a new page with a title in a
   chosen folder, **Then** a new Markdown file appears in that folder of the repository
   and in the page tree.
3. **Given** a user with write access, **When** they delete a page and confirm, **Then**
   the file is removed in a new attributed commit and the page disappears from the tree,
   while it remains visible in history.
4. **Given** a page with several past changes, **When** the user opens its history,
   **Then** they see each change with author, date and description, and can view any
   earlier version and the difference between two versions.
5. **Given** a user who can read but not push to the repository, **When** they view a
   page in the space, **Then** no editing actions are offered and any attempt to save is
   rejected.
6. **Given** a space backed by the organization's git hosting platform, **When** a save
   completes, **Then** the commit is on the space's branch in that platform, made with the
   user's own identity.
7. **Given** a branch the user is not allowed to push to (e.g. protected), **When** they
   try to save, **Then** the save is rejected with the reason and their edited text is
   kept.

---

### User Story 3 - Concurrent edits never overwrite each other (Priority: P3)

Two team members edit the same page at the same time, or someone pushes a change to the
repository while a team member is editing in the wiki. When the second person saves, the
wiki detects that the page changed since they started editing. Changes that do not
overlap are combined automatically; overlapping changes are shown side by side so the
user can resolve them before saving. Nobody's work is silently lost.

**Why this priority**: Without conflict detection, a shared wiki loses data. It extends
Story 2 and can be tested independently once editing exists.

**Independent Test**: Open the same page in two sessions, save different changes to the
same paragraph in both, and verify the second save is stopped with both versions shown and
that the final content reflects the user's resolution.

**Acceptance Scenarios**:

1. **Given** users X and Y opened the same page version, **When** X saves and then Y saves
   a change to a different section, **Then** both changes are present in the result and
   Y is informed that the page was merged with X's change.
2. **Given** users X and Y changed the same lines, **When** Y saves after X, **Then** Y's
   save is not applied; Y sees their version, the current version and the differences,
   and can resolve and save again.
3. **Given** a user is editing a page, **When** a commit changing that page arrives from
   outside the wiki, **Then** the same detection and resolution rules apply on save.
4. **Given** a conflict screen, **When** the user abandons the edit, **Then** their unsaved
   text remains available to copy until they leave the page.

---

### User Story 4 - Discuss specific fragments of a page (Priority: P4)

While reading a page, a team member selects a fragment of text and starts a discussion
about it. The fragment is highlighted for other readers, who can open the discussion and
reply. Participants can edit or delete their own comments, and anyone with access can mark
the discussion as resolved (and reopen it). Discussions are stored by the wiki, never in
the repository, and follow the fragment when the page changes.

**Why this priority**: Fragment-level discussion is the main collaboration feature beyond
editing, but the wiki delivers value without it.

**Independent Test**: Select a sentence on a page, start a discussion, reply from a second
account, resolve it, then edit an unrelated part of the page and verify the discussion is
still attached to the same sentence and that the repository contains no discussion data.

**Acceptance Scenarios**:

1. **Given** a signed-in user reading a page, **When** they select text and add a comment,
   **Then** a discussion is created, anchored to that fragment, and the fragment is
   visibly marked for all readers of the page.
2. **Given** an open discussion, **When** another user replies, **Then** the reply appears
   in the discussion in chronological order with author and time.
3. **Given** a comment authored by the current user, **When** they edit or delete it,
   **Then** the change is shown to others and an edited comment is marked as edited.
4. **Given** an open discussion, **When** a user resolves it, **Then** it is hidden from
   the default view and its highlight removed, but it can be listed and reopened.
5. **Given** a discussion anchored to a fragment, **When** the page is edited elsewhere,
   **Then** the discussion stays attached to the same fragment.
6. **Given** a discussion whose fragment was changed or removed, **When** the page is
   shown, **Then** the discussion is kept, marked as outdated, and shows the original
   fragment text.
7. **Given** any discussion activity, **When** the repository is inspected, **Then** it
   contains no discussion data.
8. **Given** a page, **When** a user opens its discussion list, **Then** they see all open
   discussions and can switch to see resolved and outdated ones.

---

### Edge Cases

- A configured repository is unreachable at startup or during synchronization: other
  spaces keep working; the affected space shows its last known content with a visible
  "out of sync" notice; saves to it are rejected with a clear message.
- A repository contains non-Markdown files: they are not shown as pages; images and other
  files referenced from pages are served safely (never executed, downloaded as
  attachments when not an image).
- A page file is renamed or moved outside the wiki: the page appears at its new location;
  its discussions follow it when the move is detectable from history, otherwise they are
  listed as outdated on the space.
- Two spaces define the same display name: each remains distinguishable by its unique
  identifier.
- A link points to a page that does not exist: it is shown as a broken link and, for users
  with write access, offers to create the page.
- A very large page or repository: the wiki remains usable within the targets in Success
  Criteria; files above a configured size limit are not rendered and are offered as
  downloads.
- A user's identity has no email address: commits use a configured fallback address that
  still identifies the user.
- The user's sign-in session expires while editing: they can sign in again without losing
  the edited text.
- The git hosting platform is temporarily unavailable for permission checks: the wiki
  denies access rather than guessing, and shows a clear message.
- A user loses access to a repository while they have the space open: the next request
  after the change takes effect is denied.
- A user is removed from the identity source: their past commits and comments remain,
  showing their name.
- Malformed Markdown: the page still renders as well as possible; it never fails to load.

## Requirements *(mandatory)*

### Functional Requirements

**Spaces and reading**

- **FR-001**: The system MUST serve pages from multiple git repositories configured for a
  single deployment; each configured source is presented as a separate space.
- **FR-002**: Each space MUST be defined by the deployer with: a repository location, a
  branch, an optional folder within the repository, a display name and a unique
  identifier.
- **FR-003**: The system MUST present each space's Markdown files as a page tree that
  mirrors the folder structure, with readable titles.
- **FR-004**: The system MUST render Markdown, including tables, code blocks, task lists
  and images stored in the repository.
- **FR-005**: The system MUST resolve relative links between Markdown files as wiki
  navigation and MUST support links to pages in other spaces.
- **FR-006**: The system MUST remove unsafe content (scripts, event handlers, unsafe URLs)
  from rendered pages.
- **FR-007**: The system MUST pick up changes committed to a space's repository outside
  the wiki without a restart, within a configurable interval (default: 1 minute).

**Access**

- **FR-008**: The system MUST require users to sign in before showing any content.
- **FR-009**: Access to a space MUST mirror the signed-in user's own permissions on the
  underlying repository in the organization's git hosting platform: permission to read the
  repository grants reading the space; permission to push to the space's branch grants
  editing it. The wiki MUST NOT grant any access the user does not have in the git
  hosting platform.
- **FR-009a**: Users MUST sign in with the same organizational identity that the git
  hosting platform uses, and the wiki MUST act on the user's behalf (with that identity)
  when checking permissions and when saving changes.
- **FR-009b**: Users MUST see only the spaces they can read; changes of permissions in the
  git hosting platform MUST take effect in the wiki within 5 minutes.
- **FR-009c**: A space without a git hosting platform (a repository that exists only on
  the wiki's own storage) MUST be readable and editable by all signed-in users, and the
  deployer MUST be warned about this in the configuration documentation.

**Editing and history**

- **FR-010**: Users with write access MUST be able to edit, create and delete pages, and
  to provide a change description for each save.
- **FR-011**: Every save MUST produce exactly one commit with the signed-in user recorded
  as author (name and email) and the change description as the message.
- **FR-012**: Saved changes MUST be committed directly to the space's configured branch;
  review branches and merge requests are out of scope for this feature.
- **FR-013**: A save MUST be reported as successful only after the git hosting platform
  has accepted the change. If it is rejected (missing permission, protected branch,
  platform unavailable), the user MUST see the reason and MUST keep their edited text.
- **FR-014**: Users MUST be able to see a page's history (author, date, description), view
  any earlier version, and compare two versions.

**Conflict detection**

- **FR-015**: The system MUST record which version of a page an edit started from and
  MUST detect, on save, whether the page changed since then (from the wiki or from outside).
- **FR-016**: Non-overlapping concurrent changes MUST be combined automatically and the
  user informed; overlapping changes MUST stop the save and present the user's version,
  the current version and their differences for manual resolution.
- **FR-017**: The system MUST NOT overwrite a newer version of a page without the user
  having seen and resolved the difference.

**Discussions**

- **FR-018**: Signed-in users who can read a page MUST be able to start a discussion
  anchored to a selected fragment of its text.
- **FR-019**: Discussions MUST support replies, displayed in chronological order with
  author and timestamp.
- **FR-020**: Authors MUST be able to edit and delete their own comments; edited comments
  MUST be marked as edited.
- **FR-021**: Users MUST be able to resolve and reopen discussions; resolved discussions
  MUST be hidden by default and listable on demand.
- **FR-022**: Anchored fragments MUST be visibly marked on the page, and selecting a mark
  MUST open its discussion.
- **FR-023**: When a page changes, the system MUST keep each discussion attached to its
  fragment if the fragment still exists; otherwise the discussion MUST be kept, marked as
  outdated, and show the originally quoted text.
- **FR-024**: Discussions MUST be stored by the wiki separately from the repositories and
  MUST NOT be written to any repository.
- **FR-025**: Discussions MUST be visible only to users who can read the page.

**Operation**

- **FR-026**: A failure of one space (unreachable repository, invalid configuration) MUST
  NOT prevent other spaces from working, and MUST be visible to users of that space.
- **FR-027**: Deployers MUST be able to add or remove spaces through configuration;
  removing a space MUST NOT delete its repository or its discussions without an explicit
  action.

### Key Entities

- **Space**: A configured source of pages—repository location, branch, optional folder,
  display name, unique identifier, synchronization status.
- **Page**: A Markdown file within a space; identified by space and path; has a title,
  content and version history.
- **Page Version**: A specific state of a page as recorded in repository history—author,
  date, change description.
- **User**: A signed-in person—identifier, display name, email; author of commits and
  comments.
- **Repository Permission**: The user's read/push rights on a space's repository, as
  reported by the git hosting platform for the user's identity; not managed in the wiki.
- **Discussion**: A thread attached to a page—anchor (quoted fragment and its position in
  a specific page version), state (open, resolved, outdated), creation time.
- **Comment**: An entry in a discussion—author, text, creation time, edited flag; the first
  comment opens the discussion, others are replies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer can bring up a wiki serving three repositories in under 30 minutes
  using only the documentation.
- **SC-002**: A user can open any page from the space list in no more than three
  navigation steps, and pages of typical size (up to 100 KB of text) display in under
  2 seconds.
- **SC-003**: 100% of saves made through the wiki appear in the repository history with
  the correct author and change description.
- **SC-004**: In concurrent editing tests, 0 changes are silently lost.
- **SC-005**: Changes committed outside the wiki are visible in the wiki within 2 minutes
  under default settings.
- **SC-006**: After edits elsewhere on a page, at least 95% of discussions remain attached
  to their original fragment, and 100% of discussions are retained (anchored or outdated).
- **SC-007**: A user can start a discussion on a text fragment in under 30 seconds on the
  first attempt.
- **SC-008**: The deployment serves at least 50 concurrent users and 20 spaces of up to
  5,000 pages each without exceeding the display target in SC-002.
- **SC-009**: In access tests, 0 users can see a space, page or discussion of a repository
  they cannot read in the git hosting platform, and permission changes take effect within
  5 minutes.

## Assumptions

- Spaces are defined by the deployer in configuration; managing spaces through the user
  interface is out of scope for this feature.
- Repositories are hosted on the organization's git hosting platform and are copied to
  the wiki's own storage for fast reading; a space MAY also point to a repository that
  exists only on the wiki's storage (no platform), e.g. for evaluation.
- The first supported git hosting platform is Azure DevOps (cloud service and on-premises
  server), with sign-in through the identity provider the organization uses for Azure
  DevOps. Other platforms (GitLab, GitHub, Gitea, Bitbucket) are expected later and the
  design must not prevent them.
- Changes are pushed with the signed-in user's own identity, so the git hosting platform
  enforces its own permissions and branch policies. Keeping the wiki's copy of the
  repositories up to date uses a deployment-level identity with read access only.
- User identity provides at least a name and preferably an email.
- Discussions have a single level of replies (a flat thread under the opening comment),
  as in common document-collaboration tools.
- Notifications (email, chat), @mentions, full-text search, page rename through the UI,
  and uploading attachments through the wiki are out of scope for this feature and will be
  specified separately.
- Pages are standard Markdown (CommonMark with common extensions such as tables and task
  lists); diagram rendering is out of scope.
- The UI and all system texts are in English; page content may be in any language.
