# Data Model: Git-Backed Team Wiki

Two stores, per Constitution Principle V:

- **Git repositories** (bare clones on the data volume, mirrored from the git hosting
  platform) — the source of truth for pages and their history. Nothing below marked
  *(git)* is duplicated authoritatively anywhere else.
- **Application database** (single SQLite file on the data volume) — discussions, user
  profiles, delegated tokens, sync status, caches. Never written to repositories.

Identifiers: `SpaceId` is a deployer-chosen slug (`^[a-z0-9][a-z0-9-]{1,62}$`). Page paths
are repository-relative, `/`-separated, case-sensitive, always ending in `.md`, and
relative to the space's folder.

---

## Space *(configuration)*

Defined in configuration (environment variables / config file), loaded at startup and on
configuration reload. Not stored in the database except for its runtime status.

| Field | Type | Rules |
|-------|------|-------|
| `Id` | string | Unique slug; stable—used in URLs and as the discussion foreign key |
| `DisplayName` | string | 1–100 chars; need not be unique |
| `Provider` | enum | `AzureDevOps` \| `Git` (plain git remote or wiki-local repository, no hosting integration; extensible: `GitLab`, `GitHub`, … later) |
| `RemoteUrl` | string? | Required for `AzureDevOps`; for `Git` optional — HTTPS URL or filesystem path; absent ⇒ repository created and kept only on the data volume |
| `Branch` | string | Default `main`; must exist on the remote |
| `Folder` | string? | Optional sub-folder that is the space root (e.g. `docs`) |
| `Hosting` | object? | Provider-specific: for Azure DevOps `Organization`, `Project`, `RepositoryId` (resolved at startup if not given) |

**Validation**: duplicate `Id` → startup error for that space only (FR-026); unreachable
remote → space status `Unavailable`, other spaces continue.

## SpaceStatus *(database, table `space_status`)*

| Field | Type | Notes |
|-------|------|-------|
| `SpaceId` | string (PK) | |
| `State` | enum | `Initializing` → `Ready` ⇄ `OutOfSync`; any → `Unavailable` (config/auth error) |
| `HeadCommit` | string? | Commit id of the branch tip in the local mirror |
| `LastSyncAt` | timestamp? | Last successful fetch |
| `LastError` | string? | Human-readable reason, shown to users of the space |

State transitions: `Initializing` (first clone) → `Ready`. A failed fetch keeps the last
content and moves to `OutOfSync`; a successful fetch returns to `Ready`. Saves are rejected
unless `Ready` (spec edge case "repository unreachable").

## Page *(git, derived view)*

| Field | Source |
|-------|--------|
| `SpaceId`, `Path` | Location in the space |
| `Title` | First level-1 heading; fallback: file name without extension, `-`/`_` → spaces |
| `Content` | Blob at the requested commit |
| `Version` | Commit id of the branch tip at read time **and** blob id of the file — both sent to the editor as the edit base |

Page tree = all `*.md` blobs under `Folder` at `HeadCommit`, cached per commit id.
Non-Markdown files are served only as referenced assets (images inline, others as
`Content-Disposition: attachment`). Files above `MaxRenderBytes` (default 1 MiB) are not
rendered.

## PageVersion *(git, derived view)*

| Field | Source |
|-------|--------|
| `CommitId` | Commit touching the page (path-filtered history, rename-aware) |
| `AuthorName`, `AuthorEmail`, `AuthoredAt` | Commit author |
| `Message` | Commit message (change description) |

## User *(database, table `users`)*

Created on first sign-in; updated on each sign-in.

| Field | Type | Rules |
|-------|------|-------|
| `Id` | string (PK) | Stable subject from the identity provider (Entra `oid`, or local account name) |
| `DisplayName` | string | Required |
| `Email` | string? | Used as commit author email; fallback `{Id}@{FallbackEmailDomain}` (config) |
| `LastSeenAt` | timestamp | |

Users are never deleted when they leave the identity source; their commits and comments
keep showing the stored name (spec edge case).

## DelegatedToken *(database, table `user_tokens`)*

Server-side cache of the tokens the wiki uses to act on the user's behalf (Constitution
III "Delegated access"). Implemented as the distributed token cache of Microsoft.Identity.Web
(Entra tokens) and as the store for Azure DevOps Server personal access tokens.

| Field | Type | Rules |
|-------|------|-------|
| `CacheKey` | string (PK) | MSAL account key (`{oid}.{tid}` based) for Entra tokens; `pat:{userId}` for personal access tokens |
| `Value` | bytes | **Encrypted** with ASP.NET Core Data Protection, purpose `Copernica.UserTokens` (keys on the data volume) |
| `ExpiresAt` | timestamp? | Expired entries are treated as missing and removed |
| `UpdatedAt` | timestamp | |

Never returned by any API; deleted on sign-out.

## RepositoryPermission *(in-memory cache, not persisted)*

| Field | Type | Notes |
|-------|------|-------|
| `UserId`, `SpaceId` | key | |
| `CanRead`, `CanWrite` | bool | From the hosting platform using the user's token |
| `CheckedAt` | timestamp | Entry TTL 2 min (FR-009b requires ≤ 5 min) |

Platform unreachable → no entry → access denied (spec edge case). `Git` spaces:
`CanRead = CanWrite = true` for every signed-in user (FR-009c).

## Discussion *(database, table `discussions`)*

| Field | Type | Rules |
|-------|------|-------|
| `Id` | GUID (PK) | |
| `SpaceId` | string | Index (`SpaceId`, `PagePath`) |
| `PagePath` | string | Updated when a rename is detected in history |
| `State` | enum | `Open`, `Resolved` |
| `AnchorStatus` | enum | `Anchored`, `Outdated` |
| `Anchor` | embedded | See *TextAnchor* |
| `CreatedBy`, `CreatedAt` | | First comment's author/time |
| `ResolvedBy`, `ResolvedAt` | nullable | Set on resolve, cleared on reopen |

State transitions:

```text
Open ──resolve──▶ Resolved ──reopen──▶ Open
AnchorStatus: Anchored ──(fragment not found on re-anchor)──▶ Outdated
              Outdated  ──(user re-anchors manually — later feature)──▶ Anchored
```

`State` and `AnchorStatus` are independent: an outdated discussion can still be open.

## TextAnchor *(embedded in Discussion)*

Modelled on W3C Web Annotation `TextQuoteSelector` + `TextPositionSelector`, computed over
the **plain text of the rendered, sanitized page** (the concatenated text nodes of the
article element—identical on server and in the browser).

| Field | Type | Rules |
|-------|------|-------|
| `Exact` | string | Selected text, 1–2,000 chars, non-whitespace |
| `Prefix` | string | Up to 32 chars before the selection |
| `Suffix` | string | Up to 32 chars after the selection |
| `Start`, `End` | int | Offsets in the plain text at `CommitId` |
| `CommitId` | string | Page version the offsets refer to |
| `OriginalExact` | string | Immutable copy of the first `Exact`, shown when outdated |

Re-anchoring (on read, when the page's current commit ≠ `CommitId`): see research.md R6.
Successful re-anchor updates `Start`, `End`, `Prefix`, `Suffix`, `CommitId`.

## Comment *(database, table `comments`)*

| Field | Type | Rules |
|-------|------|-------|
| `Id` | GUID (PK) | |
| `DiscussionId` | GUID (FK) | Cascade delete with discussion |
| `AuthorId` | string (FK users) | |
| `Body` | string | 1–10,000 chars, Markdown, rendered with the same sanitizer as pages |
| `CreatedAt` | timestamp | Ordering key |
| `EditedAt` | timestamp? | Non-null ⇒ shown as "edited" (FR-020) |
| `DeletedAt` | timestamp? | Soft delete: shown as "comment deleted" to keep thread context |

Rules: only the author may edit/delete (FR-020). The first comment cannot be deleted
while replies exist (it is soft-deleted instead). A discussion whose comments are all
deleted is removed.

## Relationships

```text
Space (config) 1 ── * Page (git) 1 ── * PageVersion (git)
Space 1 ── 1 SpaceStatus
Page  1 ── * Discussion 1 ── * Comment * ── 1 User
User  1 ── * DelegatedToken
User  * ── * Space  via RepositoryPermission (cache, from hosting platform)
```

Discussions reference pages by (`SpaceId`, `PagePath`) — a soft reference, so removing a
space from configuration keeps its discussions (FR-027).
