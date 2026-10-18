# Copernica Constitution

## Core Principles

### I. English as the Project Language

- All project artifacts MUST be written in English: source code (identifiers, comments),
  specifications, plans, tasks, documentation, commit messages, issue/PR text, UI strings
  shipped by default, log messages and error messages.
- Conversation between a developer and an AI assistant or teammates MAY happen in the
  operator's preferred language (e.g. Polish). Anything that is persisted to the repository
  as a result of that conversation MUST be translated to English.
- Wiki *content* written by end users may be in any language; this rule governs the
  project itself, not the pages people author in the wiki.

**Rationale**: A single working language keeps the codebase reviewable by anyone in the
organization and avoids mixed-language specs that drift apart.

### II. Self-Hosted Inside the Organization

- The wiki's purpose is **knowledge sharing within a team**. It MUST work as a shared,
  multi-user instance that a team deploys on infrastructure it already controls: a VM, a
  server, Docker/Compose, or a Kubernetes cluster. Running it on a single workstation
  (for evaluation or development) MUST also work.
- The wiki MUST NOT introduce new external services: no SaaS of its own, public CDNs or
  third-party accounts. It MAY talk only to services the organization already uses and
  controls access to—its git hosting platform and its identity provider—whether
  self-hosted (e.g. Azure DevOps Server, GitLab, Gitea) or the organization's own cloud
  tenant (e.g. Azure DevOps Services with Microsoft Entra ID).
- The application MUST NOT make any other outbound connections: no telemetry, analytics,
  update checks, remote fonts/scripts or license servers. Integrations with the git
  hosting platform and identity provider MUST be off by default, enabled explicitly via
  configuration, and limited to the endpoints the deployer configures.
- All runtime assets (JS, CSS, fonts, icons) MUST be bundled with the application.
- A minimal instance MUST start with a single documented command (binary or
  `docker run`) and no additional infrastructure (no external database server, message
  broker or cache).
- The project MUST ship a container image and example Kubernetes manifests (or a Helm
  chart) that deploy a working instance with persistent storage.

**Rationale**: The value is a team wiki that any team can stand up inside the organization
on whatever platform it already uses, without waiting for new external services to be
approved. Talking to the git hosting and identity services the organization already
trusts with its code adds no new party that could see its data.

### III. Low-Friction Adoption by Design (NON-NEGOTIABLE)

The wiki is engineered so that deploying it fits within the policies that already govern
internal developer tools, so teams are not forced through a long dedicated security track
just to start sharing knowledge. This is achieved by minimizing and documenting risk,
never by hiding or circumventing controls:

- **Authentication**: when the service is reachable by anyone other than the local user,
  write access MUST require authentication. Supported modes: built-in local accounts,
  identity headers from the organization's reverse proxy / auth gateway, and optionally
  OIDC against the organization's identity provider (including the one used by its git
  hosting platform). Anonymous read access MUST be off by default.
- **Delegated access**: when the wiki acts on a user's behalf against the git hosting
  platform, it MUST request the minimum scopes needed, use the user's tokens only for
  that user's requests, keep them server-side only (never exposed to the browser),
  encrypt any persisted tokens at rest, and MUST NOT grant access the platform would
  deny the user.
- **Network exposure**: the standalone binary MUST bind to `127.0.0.1` by default. The
  container image MAY listen on all interfaces inside the container; exposure outside the
  cluster is controlled by the deployer (Service/Ingress), never opened by the app itself.
- **Least privilege**: the application and its container MUST run as a non-root user,
  require no Linux capabilities, no privileged mode, no host mounts other than the data
  volume, and MUST be compatible with the Kubernetes Pod Security Standard `restricted`
  and a read-only root filesystem.
- **Data residency**: all data stays in the configured data directory / volume and in the
  organization's git hosting platform (see Principles II and V).
- **Safe content**: user-authored content MUST be rendered safely (HTML sanitization, no
  execution of embedded scripts, safe handling of uploads—executable uploads blocked or
  served as attachments only).
- **Forbidden without amendment**: features that execute user-supplied code, plugin
  marketplaces or remote plugin loading, and any server-side fetching of arbitrary URLs.
- **Transparency**: the project MUST NOT include mechanisms intended to evade detection,
  monitoring or organizational policy. Documentation MUST state plainly what the
  application does, which ports it listens on, which files it writes, which outbound
  connections it can make (default: none), and how authentication works—so that anyone
  who does review it can finish quickly.

**Rationale**: "Usable inside the organization this week" requires a small, hardened,
well-documented footprint. That is what makes the honest answer to a security question
short.

### IV. Minimal, Auditable Dependencies

- Every third-party dependency MUST be justified in the plan for the feature that adds it
  (why it is needed, why the standard library is insufficient).
- Dependencies MUST use permissive, organization-friendly licenses (e.g. MIT, BSD,
  Apache-2.0, ISC). Copyleft licenses (GPL/AGPL) MUST NOT be introduced into the
  distributed artifact without an amendment. Libraries under GPL with an explicit linking
  exception (e.g. libgit2) MAY be used unmodified as dynamically linked libraries; each
  such use MUST be listed in `SECURITY.md` / third-party notices.
- This rule applies to everything shipped in the artifact: NuGet runtime packages and the
  npm packages bundled into the browser code. Build-only tooling (bundlers, linters, test
  frameworks) MUST also be pinned and permissively licensed, but is not shipped and does
  not require per-feature justification.
- Dependency versions MUST be pinned via committed lockfiles (`packages.lock.json` for
  NuGet, the npm lockfile for the frontend).
- The application and its container image MUST be buildable from vendored or internally
  mirrored packages and base images (offline / air-gapped build support). The container
  base image MUST be minimal (chiseled, distroless, Alpine or equivalent).

**Rationale**: Fewer, well-known dependencies keep the supply-chain surface small and make
internal license and vulnerability scanning trivial.

### V. Git-Backed Content and Simplicity

- Wiki pages MUST be stored as plain files (Markdown) in git repositories, and those
  repositories are the single source of truth for content. Page history is git history;
  the wiki MUST NOT keep a parallel, authoritative copy of content elsewhere.
- Every content change made through the wiki MUST become a git commit attributed to the
  authenticated user who made it. Content repositories MUST remain usable with ordinary
  git tooling (clone, edit, commit) without the wiki running.
- Concurrent edits—whether from multiple wiki users or from commits made outside the
  wiki—MUST NOT silently overwrite each other; conflicts MUST be detected and surfaced to
  the user.
- Non-content data (e.g. discussions, sessions, search indexes, caches) MUST be stored
  separately on the application's data volume (e.g. an embedded single-file store such as
  SQLite) and MUST NOT be committed to content repositories. Derived data (indexes, caches)
  MUST be rebuildable from the repositories.
- The supported production topology is a **single replica with a persistent volume**.
  Horizontal scaling (multiple replicas, external databases) is out of scope until a
  concrete need is specified and this constitution is amended.
- Distribution MUST be a single artifact per platform (one binary and one container image)
  with defaults that require no configuration to start.
- Features follow YAGNI: build the simplest thing that satisfies the spec; added
  complexity MUST be justified in the plan's Complexity Tracking section.

**Rationale**: Git gives teams history, review, backup and portability with tools they
already trust, so content is never locked into the wiki and no extra operational burden
is added, which reinforces Principles II and III.

## Security and Deployment Constraints

- All configuration MUST be possible via environment variables (container/Kubernetes
  friendly), optionally overridden by a config file. Secrets MUST come from environment
  variables or mounted files (e.g. Kubernetes Secrets); secrets MUST NOT be committed or
  logged. Git credentials (tokens, SSH keys) are secrets under this rule and MUST be scoped
  to the minimum access the wiki needs.
- Default configuration MUST be the safest configuration: authentication required for
  writes, anonymous read off, sanitized rendering, no outbound connections.
- The application MUST expose liveness and readiness endpoints and log structured output
  to stdout/stderr.
- TLS is expected to be terminated by the organization's ingress/reverse proxy; the
  application MAY support TLS directly for standalone use.
- The repository MUST contain a concise `SECURITY.md` describing: listening ports, files
  and directories written, possible outbound connections (default: none), authentication
  modes, container security context, and how to report vulnerabilities.
- The standalone binary MUST run on Windows, macOS and Linux without elevated privileges;
  the container image MUST support linux/amd64 and linux/arm64.
- The application MUST send a strict Content Security Policy: `script-src 'self'`, no
  inline scripts, no `eval`, no third-party origins.
- Markdown MUST be rendered to HTML and sanitized on the server, in one place. The
  frontend MUST NOT render raw user HTML from any other source; editor previews use the
  same server-side renderer.
- Diagram blocks written as text (e.g. Mermaid) MAY be drawn in the browser, but only
  when all of the following hold:
  - the server still emits them as escaped source inside its sanitized markup;
  - drawing happens in an isolated renderer: a sandboxed frame with an opaque origin
    (never `allow-same-origin`), no network access and its own restrictive Content
    Security Policy;
  - the result is shown in the application's document only as an image (e.g. an SVG
    `data:` image), never parsed into it as markup.

  Any other client-side rendering of user content remains forbidden. The isolated
  renderer's own policy MAY allow inline styles; it MUST NOT allow `eval`, inline
  scripts, network connections or third-party origins.

## Technology Stack

- **Backend**: C# on the current .NET LTS release with ASP.NET Core. Published as a
  self-contained, single-file executable per platform (Native AOT MAY be used where the
  chosen libraries support it).
- **Frontend**: React with TypeScript (strict mode), built with Vite. Production assets
  MUST be embedded in / served by the .NET application; no separate frontend server and no
  CDN at runtime.
- **Storage**: git repositories for content (via a .NET git library or the `git` CLI—the
  choice is made and justified in the plan); SQLite (`Microsoft.Data.Sqlite`) for
  non-content data.
- **Container**: based on the official .NET `runtime-deps` chiseled (or equivalent minimal,
  non-root) image.
- **Browser support**: the two latest versions of Chrome, Edge, Firefox and Safari.
- **Accessibility**: the UI MUST meet WCAG 2.1 AA.
- Replacing any of the above (language, runtime, UI framework, storage engine) requires an
  amendment to this constitution. Libraries within the stack are chosen per feature in the
  plan, subject to Principle IV.

## Development Workflow and Quality Gates

- Work follows the Spec Kit flow: `/speckit-specify` → `/speckit-clarify` (as needed) →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Every plan MUST include a Constitution Check that explicitly verifies Principles I–V,
  in particular: no new egress, no new privilege in the container, authentication impact,
  dependency/license review.
- Automated tests MUST cover content rendering/sanitization, authentication/authorization
  of write paths, concurrent-edit conflict handling, and storage read/write paths before a
  feature is considered done.
- A change that opens a new port, adds network egress, adds a dependency, changes
  authentication behavior, changes the container security context, or changes the storage
  format MUST call this out in its PR description and update `SECURITY.md`.

## Governance

- This constitution supersedes other project practices. Where a guideline conflicts with
  it, the constitution wins until amended.
- Amendments are made via `/speckit-constitution`, recorded in this file with a Sync Impact
  Report, and accompanied by a migration note when existing features are affected.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle,
  MINOR for adding a principle/section or materially expanding guidance, PATCH for
  clarifications and wording.
- Every plan and PR review MUST verify compliance with the Core Principles; deviations MUST
  be documented and justified in the plan's Complexity Tracking section or rejected.

**Version**: 1.3.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-18
