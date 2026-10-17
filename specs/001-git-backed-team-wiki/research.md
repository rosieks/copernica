# Research: Git-Backed Team Wiki

Facts verified on 2026-10-17; sources linked per item.

## R1. Runtime and packaging

- **Decision**: .NET 10 (LTS, support until 2028-11) with ASP.NET Core 10. Self-contained,
  single-file publish per RID (`win-x64`, `osx-arm64`, `linux-x64`, `linux-arm64`) with
  `IncludeNativeLibrariesForSelfExtract=true`. Container on
  `mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled` with
  `InvariantGlobalization=true`.
- **Rationale**: Constitution Technology Stack mandates current .NET LTS; .NET 8/9 reach end
  of support 2026-11-10. The chiseled image is non-root (UID 1654), shell-less, and ships
  `libssl3` + `ca-certificates`, which libgit2 needs (R2). No ICU/tzdata is needed: titles
  are sorted ordinally, timestamps are UTC and formatted in the browser.
- **Alternatives**: Native AOT — rejected for now; LibGit2Sharp, EF Core and
  Microsoft.Identity.Web are not fully AOT-compatible. Framework-dependent publish —
  rejected; requires a pre-installed runtime (Principle II "single command").
- **Risk**: single-file + native libgit2 has a history of load failures (libgit2sharp
  #1798, #1914). Mitigation: CI smoke test that starts each published artifact and opens a
  repository; fallback is a self-contained *folder* publish shipped as one archive.
- Sources: https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core,
  https://github.com/dotnet/dotnet-docker/blob/main/src/runtime-deps/10.0/noble-chiseled/amd64/Dockerfile

## R2. Git access library

- **Decision**: LibGit2Sharp 0.32.x (MIT) with bundled libgit2 native binaries
  (GPLv2 **with linking exception**, unmodified, dynamically loaded — allowed by
  Constitution IV; recorded in `SECURITY.md` and third-party notices).
  Repositories are kept as **bare mirrors** on the data volume (no working tree).
- **Rationale**: In-process, no `git` executable needed in the chiseled image or on
  Windows workstations. Native binaries exist for every target RID (incl. linux-arm64,
  osx-arm64). `FetchOptions.CustomHeaders` / `PushOptions.CustomHeaders` allow
  `Authorization: Bearer <token>` per operation (R3). `ObjectDatabase.MergeCommits`
  gives an in-memory three-way merge with conflict information (R5). Bare repositories
  fit a read-only root FS and avoid working-tree races.
- **Alternatives**: `git` CLI — rejected: adds a GPL binary and its dependencies to the
  image, needs process spawning, harder to make concurrent-safe. Hosting REST APIs
  (e.g. Azure DevOps "Pushes – Create") for writes — rejected as the primary path: ties
  editing to one platform; kept as a possible optimization behind the provider interface.
- Sources: https://www.nuget.org/packages/LibGit2Sharp,
  https://github.com/libgit2/libgit2sharp.nativebinaries,
  https://github.com/libgit2/libgit2/blob/main/COPYING

## R3. Identity, delegated access and Azure DevOps

- **Decision (Azure DevOps Services)**: Sign-in with Microsoft Entra ID (OIDC,
  authorization code + PKCE, confidential client) via Microsoft.Identity.Web (MIT).
  Request the delegated scope `499b84ac-1321-427f-aa17-267ca6975798/.default` (Azure
  DevOps). Tokens are cached server-side in SQLite, encrypted with ASP.NET Core Data
  Protection (keys on the data volume). Git push/fetch on the user's behalf uses
  `Authorization: Bearer <token>` via `CustomHeaders`.
- **Decision (Azure DevOps Server, on-premises)**: Entra delegated tokens are not
  supported there. Users sign in with the organization's OIDC provider (e.g. AD FS) or
  local accounts, and register a personal access token (scopes: Code Read & Write) on
  their profile page; it is stored encrypted like other tokens and used as Basic
  credentials. Delivered after the Azure DevOps Services path (see plan increments).
- **Decision (sync identity)**: Background fetches use a deployment-level, **read-only**
  identity (service principal, managed identity or PAT with Code: Read). It is never used
  for writes or for answering a user's permission question.
- **Rationale**: Pushing with the user's own token makes the platform enforce repository
  permissions and branch policies (spec FR-009, FR-013) and records the user as pusher.
  Microsoft documents Entra bearer tokens as usable wherever PATs are, including git over
  HTTPS. Tokens must not be parsed or their lifetime assumed — always obtain via the
  token cache (`GetAccessTokenForUserAsync`).
- **Alternatives**: Wiki-wide service account with write access + author field set to the
  user — rejected: bypasses platform permissions (violates Constitution III "Delegated
  access" and FR-009). Reverse-proxy identity headers — kept for a later feature; they
  carry no token to act on the user's behalf.
- Sources: https://learn.microsoft.com/en-us/azure/devops/repos/git/auth-overview,
  https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra

## R4. Permission checks (FR-009, FR-009b)

- **Decision**: Provider interface `IHostingProvider.GetPermissionsAsync(user, space)`.
  Azure DevOps implementation calls Security "Has Permissions" with the user's token:
  `GET {org}/_apis/permissions/2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87/{bits}?tokens=…&api-version=7.1`
  - read: bit `GenericRead` (2) on token `repoV2/{projectId}/{repoId}`
  - write: bit `GenericContribute` (4) on `repoV2/{projectId}/{repoId}/refs/heads/{hex}`,
    where each branch path segment is hex-encoded UTF-16LE (e.g. `main` →
    `6d00610069006e00`).
  Bit values are verified at startup against `_apis/securitynamespaces` (they come from
  community documentation). Results cached in memory per (user, space), TTL 2 min.
  Any error → deny (spec edge case).
- **Rationale**: One call answers both questions for the caller; the push itself is still
  enforced by the platform, so the check only drives UI and early rejection.
- **Alternatives**: Probe `GET _apis/git/repositories/{id}` — answers read only.
- Sources: https://learn.microsoft.com/en-us/rest/api/azure/devops/security/permissions/has-permissions,
  https://learn.microsoft.com/en-us/azure/devops/organizations/security/namespace-reference,
  https://devblogs.microsoft.com/devops/git-repo-tokens-for-the-security-service/

## R5. Save flow and conflict detection (FR-011..FR-017)

- **Decision**: Per-space write lock (single replica, Principle V). On save:
  1. Fetch the branch with the user's token (also refreshes the mirror).
  2. Create commit **C** = base commit's tree with the page blob replaced, parent =
     `base.commitId`, author = user, committer = user (name/email from identity).
  3. If the branch tip is still `base.commitId` → push C.
     Otherwise `ObjectDatabase.MergeCommits(C, tip)`; if the merged tree has no conflicts
     → create a commit on top of the tip with the merged tree (single-parent, linear
     history; the user's commit message), push, respond `merged: true`. If conflicts →
     respond `409 edit-conflict` with base/theirs/mine sources; nothing is pushed.
  4. Push via `PushOptions.CustomHeaders` (bearer). Non-fast-forward rejection (someone
     pushed meanwhile) → repeat from 1 (max 3 attempts). Permission/policy rejection →
     `403 push-rejected` with the platform message. Local mirror refs are updated only
     after a successful push.
- **Rationale**: Linear history keeps the repository readable for people using plain git
  and the "one save = one commit" rule (FR-011). Three-way merge at file level gives the
  "non-overlapping changes merged automatically" behaviour required by FR-016. Nothing
  is ever force-pushed.
- **Alternatives**: Merge commits — rejected (two commits per save, noisy history).
  Pessimistic page locking — rejected (stale locks, doesn't cover edits outside the wiki).

## R6. Discussion anchoring (FR-018, FR-023)

- **Decision**: W3C Web Annotation–style anchor (quote + 32-char prefix/suffix + text
  offsets + commit id) over the **plain text of the sanitized HTML** (text nodes of the
  article, as `textContent`). The server computes the same text from sanitized HTML with
  AngleSharp (already a dependency of HtmlSanitizer), so offsets match the browser.
  Re-anchoring when the page's head differs from the anchor's commit:
  1. exact match of `Exact` — if several, pick the one whose prefix/suffix match best,
     ties broken by distance to the old offset;
  2. otherwise fuzzy match (diff-match-patch `match_main`, threshold 0.3, pattern up to
     its 32-char bit limit applied to the quote start/end) with similarity ≥ 0.75 of the
     full quote;
  3. otherwise mark `Outdated` and keep `OriginalExact`.
  Results are persisted so each discussion is re-anchored once per page version.
- **Rationale**: Robust against edits elsewhere on the page (SC-006 ≥ 95 %), deterministic
  and testable on the server, independent of the editor.
- **Alternatives**: Anchoring in Markdown source offsets — rejected: selection happens in
  rendered text, mapping back is lossy. Block/paragraph IDs embedded in Markdown —
  rejected: pollutes repository content (Principle V).
- **Frontend highlight**: CSS Custom Highlight API (`CSS.highlights` + `::highlight()` with
  `background-color`) — supported in all target browsers (Chrome/Edge 105+, Safari 17.2+,
  Firefox 140+; Firefox's "partial" `::highlight()` status concerns text-decoration, not
  background). No DOM mutation of the sanitized content.
- **Library**: diff-match-patch (Apache-2.0), vendored single file for C# (and the npm
  package for any client-side use).

## R7. Markdown rendering and sanitization

- **Decision**: Markdig (BSD-2-Clause) with pipe tables, task lists, auto-links,
  emphasis extras, auto-identifiers; raw HTML allowed in input but always passed through
  HtmlSanitizer (Ganss.Xss, MIT) with an allow-list. Link rewriting in the Markdig
  pipeline: relative `.md` links → wiki routes; `wiki:<spaceId>/<path>` → cross-space
  route; relative images → `/api/spaces/{id}/files/...`; external links get
  `rel="noopener noreferrer"`. Rendering cached by (space, blob id).
- **Rationale**: One server-side pipeline (Constitution: server-side sanitization; editor
  preview uses `/api/render`).
- **Alternatives**: Client-side rendering (react-markdown) — rejected by constitution.

## R8. Application database

- **Decision**: SQLite via EF Core 10 (`Microsoft.EntityFrameworkCore.Sqlite`, MIT) with
  migrations applied at startup; WAL mode.
- **Rationale**: Single file on the volume (Principle V), first-party library, migrations.
- **Alternatives**: Dapper + hand-written SQL — fewer abstractions but manual migrations;
  acceptable fallback if EF Core size becomes a concern.

## R9. Frontend

- **Decision**: React 19 + TypeScript (strict) + Vite; React Router; TanStack Query for
  server state; CodeMirror 6 (MIT) as the Markdown editor; `@codemirror/merge` for history
  diff and the conflict resolution view. Plain CSS modules, no UI kit. Build output is
  embedded in the server assembly (`Microsoft.Extensions.FileProviders.Embedded`) and
  served with a strict CSP (`default-src 'self'; script-src 'self'; style-src 'self';
  style-src-attr 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'`).
  *Amended during implementation:* CodeMirror positions elements with inline `style`
  attributes, which `style-src 'self'` blocks. `style-src-attr 'unsafe-inline'` allows only
  style attributes; `<style>` elements and all inline/`eval` scripts stay blocked, and user
  content is sanitized without style attributes, so the risk added is minimal.
- **Rationale**: Constitution Technology Stack; CodeMirror is light, accessible and
  CSP-friendly (no `eval`). Avoids large component libraries to keep the shipped npm
  dependency list short (Principle IV).
- **Alternatives**: Monaco — rejected (size, workers needing CSP relaxations). MUI/Fluent
  UI — rejected (dependency weight); revisit if accessibility work becomes costly.

## R10. Testing

- **Decision**: xUnit v3 (Apache-2.0) with built-in assertions (FluentAssertions v8+ is
  commercially licensed — not allowed); `Microsoft.AspNetCore.Mvc.Testing` for HTTP
  integration tests against temporary bare repositories acting as "remotes"; a fake
  `IHostingProvider` for permissions/tokens. Frontend: Vitest + Testing Library.
  End-to-end: Playwright (Apache-2.0) against a server with `Local` spaces.
- **Rationale**: Constitution quality gates — rendering/sanitization, auth on write paths,
  conflict handling, storage read/write — are covered without any external service.
  A separate, manually triggered test suite runs against a real Azure DevOps test
  organization.
