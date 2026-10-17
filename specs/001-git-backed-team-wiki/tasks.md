---

description: "Task list for 001-git-backed-team-wiki"
---

# Tasks: Git-Backed Team Wiki

**Input**: Design documents from `specs/001-git-backed-team-wiki/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The constitution (Development Workflow and Quality Gates) requires
automated tests for rendering/sanitization, authentication/authorization of write paths,
concurrent-edit conflict handling and storage read/write paths. Write each story's tests
first and make sure they fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested
and demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US4)
- Paths follow plan.md: backend `src/Copernica/`, frontend `src/web/`, tests `tests/`,
  deployment `deploy/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository, solution and toolchain skeleton

- [X] T001 Create `Copernica.slnx`, `global.json` (pin .NET SDK 10.0.x, `rollForward: latestFeature`), `.editorconfig`, and `Directory.Build.props` with `TargetFramework=net10.0`, `Nullable=enable`, `ImplicitUsings=enable`, `TreatWarningsAsErrors=true`, `RestorePackagesWithLockFile=true`, `InvariantGlobalization=true` at repository root
- [X] T002 Create ASP.NET Core project `src/Copernica/Copernica.csproj` (Microsoft.NET.Sdk.Web) referencing LibGit2Sharp 0.32.*, Markdig, HtmlSanitizer, Microsoft.Identity.Web, Microsoft.EntityFrameworkCore.Sqlite 10.*, Microsoft.EntityFrameworkCore.Design (PrivateAssets=all), Microsoft.Extensions.FileProviders.Embedded; commit the generated `src/Copernica/packages.lock.json`
- [X] T003 [P] Create test projects `tests/Copernica.Tests/Copernica.Tests.csproj` and `tests/Copernica.IntegrationTests/Copernica.IntegrationTests.csproj` using xunit.v3 and (integration only) Microsoft.AspNetCore.Mvc.Testing; use xUnit built-in assertions only (FluentAssertions v8+ is commercially licensed — do not add it); add both to `Copernica.slnx`
- [X] T004 [P] Scaffold the frontend in `src/web/` with Vite + React 19 + TypeScript: `package.json` (deps: react, react-dom, react-router, @tanstack/react-query, codemirror, @codemirror/lang-markdown, @codemirror/merge; devDeps: vite, @vitejs/plugin-react, typescript, vitest, @testing-library/react, jsdom, eslint, openapi-typescript), `tsconfig.json` with `"strict": true`, `vite.config.ts` (build to `src/web/dist`, dev proxy `/api` and `/auth` to `http://127.0.0.1:8080`), committed `package-lock.json`
- [X] T005 [P] Create Playwright project in `tests/e2e/` (`package.json`, `playwright.config.ts` with Chromium, Firefox and WebKit projects, base URL `http://127.0.0.1:8080`, committed lockfile)
- [X] T006 [P] Add `.gitattributes` (`* text=auto eol=lf`) and extend `.gitignore` with `bin/`, `obj/`, `node_modules/`, `src/web/dist/`, `data/`, `playwright-report/`, `test-results/`
- [X] T007 Add MSBuild targets to `src/Copernica/Copernica.csproj` that run `npm ci` and `npm run build` in `src/web` before build in Release (skippable with `-p:SkipWebBuild=true`) and embed `src/web/dist/**` as `EmbeddedResource` with `GenerateEmbeddedFilesManifest=true`
- [X] T008 [P] Add `src/web/package.json` script `gen:api` that runs openapi-typescript on `specs/001-git-backed-team-wiki/contracts/openapi.yaml` into `src/web/src/api/schema.d.ts`, and commit the generated file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Configuration, hosting, persistence, authentication skeleton, git mirror access, rendering core and SPA shell needed by every story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 Implement `CopernicaOptions` in `src/Copernica/Configuration/CopernicaOptions.cs` bound to section `Copernica` with defaults from contracts/configuration.md: `DataDirectory` (`./data`, `/data` when `DOTNET_RUNNING_IN_CONTAINER=true`), `PublicBaseUrl`, `SyncInterval` = `00:01:00`, `PermissionCacheTtl` = `00:02:00` ("Must be ≤ 5 min (FR-009b); higher values rejected at startup"), `MaxRenderBytes` = `1048576`, `FallbackEmailDomain` = `users.noreply.invalid`, `ForwardedHeaders.KnownProxies`; validate on start with `ValidateOnStart`
- [X] T010 [P] Implement `_FILE` secret indirection (any key ending in `_FILE` loads the referenced file's trimmed content into the key without the suffix) as a configuration source in `src/Copernica/Configuration/FileSecretsConfigurationExtensions.cs`
- [X] T011 [P] Implement `SpaceOptions` in `src/Copernica/Spaces/SpaceOptions.cs` with validation from data-model.md: `Id` matches `^[a-z0-9][a-z0-9-]{1,62}$`, `DisplayName` "1–100 chars; need not be unique" (default = `Id`), `Provider` enum `AzureDevOps | Git`, `RemoteUrl` "Required for `AzureDevOps`; for `Git` optional — HTTPS URL or filesystem path; absent ⇒ repository created and kept only on the data volume", `Branch` default `main`, optional `Folder`, optional `Credential.Token` for `Git` HTTPS remotes; an invalid or duplicate space is reported as `Unavailable` without affecting other spaces (FR-026)
- [X] T012 Configure host in `src/Copernica/Program.cs`: Kestrel URLs default `http://127.0.0.1:8080` (binary) / `http://+:8080` (container); refuse to start when listening on a non-loopback address and `Copernica:Auth:Mode` is not set; forwarded headers limited to `KnownProxies`; JSON console logging to stdout; RFC 9457 ProblemDetails; health checks `GET /health/live` (always 200) and `GET /health/ready` (200 when database is open and configuration loaded, else 503), both anonymous
- [X] T013 Create `CopernicaDbContext` in `src/Copernica/Data/CopernicaDbContext.cs` using SQLite file `{DataDirectory}/copernica.db` with WAL mode, applying migrations at startup
- [X] T014 [P] Create `User` entity in `src/Copernica/Data/User.cs` (table `users`): `Id` string PK "Stable subject from the identity provider (Entra `oid`, or local account name)", `DisplayName` required, `Email` nullable, `LastSeenAt` timestamp; users are never deleted
- [X] T015 [P] Create `SpaceStatus` entity in `src/Copernica/Data/SpaceStatus.cs` (table `space_status`): `SpaceId` PK, `State` enum `Initializing | Ready | OutOfSync | Unavailable`, `HeadCommit`, `LastSyncAt`, `LastError`
- [X] T016 Add initial EF Core migration for `users` and `space_status` in `src/Copernica/Data/Migrations/`
- [X] T017 Persist ASP.NET Core Data Protection keys to `{DataDirectory}/keys` in `src/Copernica/Program.cs`
- [X] T018 [P] Implement `SecurityHeadersMiddleware` in `src/Copernica/Web/SecurityHeadersMiddleware.cs` adding `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` to every response
- [X] T019 Implement authentication core in `src/Copernica/Auth/AuthenticationSetup.cs`: cookie authentication (HttpOnly, Secure when HTTPS, SameSite=Lax), antiforgery with header `X-XSRF-TOKEN` required on all state-changing `/api` requests, fallback authorization policy requiring an authenticated user for everything except health endpoints, static assets and sign-in routes; `/api/*` returns 401 instead of redirecting
- [X] T020 Implement `ICurrentUser` and `UserService` (upsert `users` row on sign-in, update `LastSeenAt`, commit email fallback `{Id}@{FallbackEmailDomain}`) in `src/Copernica/Auth/UserService.cs`
- [X] T021 Implement `Local` auth mode in `src/Copernica/Auth/Local/LocalAuthentication.cs`: accounts from `Copernica:Auth:Local:Users:N:Name/PasswordHash`, `POST /auth/login` and `POST /auth/logout`, verification with `PasswordHasher<T>`; add `hash-password` command-line verb to `src/Copernica/Program.cs` that prints a hash for a password read from stdin
- [X] T022 Define the hosting abstraction in `src/Copernica/Hosting/IHostingProvider.cs`: `GetPermissionsAsync(user, space)` → `RepositoryPermission(CanRead, CanWrite)`, `GetUserGitCredentialsAsync(user, space)` (custom headers or basic credentials for fetch/push on the user's behalf), `GetSyncGitCredentialsAsync(space)`
- [X] T023 [P] Implement `GitHostingProvider` in `src/Copernica/Hosting/Git/GitHostingProvider.cs`: `CanRead = CanWrite = true` for every signed-in user (FR-009c); push/fetch credentials from the space's `Credential.Token` (Basic, any user name) or none for filesystem remotes
- [X] T024 Implement `PermissionService` in `src/Copernica/Auth/PermissionService.cs`: in-memory cache keyed by (`UserId`, `SpaceId`) with TTL `PermissionCacheTtl`; any provider exception → deny and do not cache; helpers `RequireReadAsync` (returns 404 problem for unreadable or unknown spaces) and `RequireWriteAsync` (403 problem type `no-write-permission`)
- [X] T025 Implement `MirrorRepository` in `src/Copernica/Git/MirrorRepository.cs` with LibGit2Sharp: init bare repository at `{DataDirectory}/mirrors/{spaceId}.git` (or a local-only repository with an initial empty commit when `RemoteUrl` is absent), fetch the space branch with given credentials via `FetchOptions.CustomHeaders` or `CredentialsProvider`, resolve branch tip, read blob by (commit, path), enumerate tree under `Folder`; all reads take an explicit commit id
- [X] T026 Implement `SpaceRegistry` and per-space `SemaphoreSlim` write locks in `src/Copernica/Spaces/SpaceRegistry.cs`, and `SpaceSyncService` (BackgroundService) in `src/Copernica/Spaces/SpaceSyncService.cs`: on start and every `SyncInterval` fetch each space with sync credentials; state transitions `Initializing → Ready`, failed fetch → `OutOfSync` keeping last content, configuration/auth error → `Unavailable` with human-readable `LastError`; one space's failure never stops others
- [X] T027 Implement `MarkdownRenderer` in `src/Copernica/Rendering/MarkdownRenderer.cs` (Markdig with pipe tables, task lists, auto-links, emphasis extras, auto-identifiers) and `HtmlSanitizerFactory` in `src/Copernica/Rendering/HtmlSanitizerFactory.cs` (allow-list: standard text, headings, lists, tables, code, images, links, `input[type=checkbox][disabled]` for task lists; drop scripts, event handlers, `style`, iframes, forms; URL schemes `http`, `https`, `mailto`, relative); render result cached by (`spaceId`, `blobId`)
- [X] T028 Implement embedded SPA serving in `src/Copernica/Web/SpaHosting.cs`: serve files from the embedded manifest provider, long cache for hashed assets, `index.html` fallback for non-`/api`, non-`/auth`, non-`/health` routes
- [X] T029 [P] Create frontend shell: `src/web/src/main.tsx` (React Router + QueryClientProvider), `src/web/src/api/client.ts` (fetch wrapper sending `X-XSRF-TOKEN` from cookie, parsing `application/problem+json`, redirecting to sign-in on 401), `src/web/src/App.tsx` layout with header showing the current user from `GET /api/me`
- [X] T030 [P] Implement sign-in page `src/web/src/pages/SignIn.tsx` (username/password form for `Local` mode; for OIDC modes a "Sign in" button that navigates to `/auth/challenge`)
- [X] T031 Create integration test infrastructure in `tests/Copernica.IntegrationTests/Infrastructure/`: `CopernicaFactory.cs` (WebApplicationFactory with temp `DataDirectory`, `Local` auth users `alice` and `bob`), `TestRemote.cs` (creates temp bare repositories with given files and pushes commits "from outside"), `FakeHostingProvider.cs` (per-user, per-space permissions and injectable push failures), `ApiClient.cs` (signs in and handles antiforgery)
- [X] T032 [P] Unit tests for `SpaceOptions` and `CopernicaOptions` validation (invalid id, duplicate id, `PermissionCacheTtl` > 5 min rejected, `AzureDevOps` without `RemoteUrl`) in `tests/Copernica.Tests/Configuration/OptionsValidationTests.cs`
- [X] T033 [P] Integration tests for security headers on API and SPA responses and for anonymous health endpoints in `tests/Copernica.IntegrationTests/Web/SecurityHeadersTests.cs`

**Checkpoint**: Foundation ready — server starts, signs in local users, mirrors repositories and serves the SPA shell

---

## Phase 3: User Story 1 — Browse and read pages from multiple repositories (Priority: P1) 🎯 MVP

**Goal**: Signed-in users see the spaces they can read, navigate page trees and read safely rendered pages with working links and images; changes pushed outside the wiki appear automatically

**Independent Test**: quickstart.md scenarios A1–A5 and A15 with two `Git` spaces

### Tests for User Story 1 ⚠️

- [X] T034 [P] [US1] Sanitization tests in `tests/Copernica.Tests/Rendering/SanitizationTests.cs`: `<script>`, `onerror=`, `javascript:` links, `<iframe>`, `<style>` and inline `style` removed; tables, task lists, code blocks and images retained
- [X] T035 [P] [US1] Link rewriting tests in `tests/Copernica.Tests/Rendering/WikiLinkRewriterTests.cs`: relative `.md` links (incl. `../`), `wiki:<spaceId>/<path>` cross-space links, relative images → files endpoint with version, external links get `rel="noopener noreferrer"`, links escaping the space folder are left unresolved
- [X] T036 [P] [US1] Page title and tree tests in `tests/Copernica.Tests/Spaces/PageTreeTests.cs`: title = first level-1 heading, fallback file name without extension with `-`/`_` → spaces; only `*.md` under `Folder`; folders first, ordinal sort
- [X] T037 [P] [US1] Reading integration tests in `tests/Copernica.IntegrationTests/Spaces/ReadingTests.cs`: unauthenticated `GET /api/spaces` → 401; both spaces listed with state; tree respects `Folder`; page returns sanitized HTML and `version {commitId, blobId}`; commit pushed to the remote becomes visible after a sync cycle; space with unreachable remote is `outOfSync`/`unavailable` while the other still serves pages; a space the fake provider denies is absent from the list and its page, tree and file URLs return 404
- [X] T038 [P] [US1] Files endpoint tests in `tests/Copernica.IntegrationTests/Spaces/FilesTests.cs`: PNG served inline, SVG served with `Content-Security-Policy: sandbox`, other files as `application/octet-stream` with `Content-Disposition: attachment`, `nosniff` always, path traversal (`..`, absolute paths, outside `Folder`) → 404

### Implementation for User Story 1

- [X] T039 [P] [US1] Implement `PageTitle` resolution in `src/Copernica/Spaces/PageTitle.cs`
- [X] T040 [US1] Implement `PageTreeService` in `src/Copernica/Spaces/PageTreeService.cs` producing `TreeNode` (contracts/openapi.yaml) from `*.md` blobs under `Folder` at `HeadCommit`, cached per commit id
- [X] T041 [P] [US1] Implement `WikiLinkRewriter` Markdig extension in `src/Copernica/Rendering/WikiLinkRewriter.cs` (routes: page `/s/{spaceId}/{path}`, file `/api/spaces/{spaceId}/files/{path}?version={commitId}`); mark links to missing pages with class `broken-link`
- [X] T042 [US1] Implement `PageService.GetPageAsync(space, path, version?, includeSource)` in `src/Copernica/Spaces/PageService.cs`: reads at given commit or head, returns `Page` with `title`, sanitized `html`, `version {commitId, blobId}`, `isCurrent`, and `tooLarge = true` without rendering when the blob exceeds `MaxRenderBytes`
- [X] T043 [US1] Implement endpoints in `src/Copernica/Api/SpacesEndpoints.cs`: `GET /api/me`, `GET /api/spaces` (only spaces with `CanRead`; fields `id`, `displayName`, `state`, `lastSyncAt`, `message`, `canWrite`), `GET /api/spaces/{spaceId}/tree`, `GET /api/spaces/{spaceId}/pages/{**path}` per contracts/openapi.yaml, all guarded by `PermissionService.RequireReadAsync`
- [X] T044 [US1] Implement `GET /api/spaces/{spaceId}/files/{**path}` in `src/Copernica/Api/FilesEndpoints.cs` with the content-type, disposition, SVG sandbox and traversal rules tested in T038
- [X] T045 [P] [US1] Implement `SpaceList` page in `src/web/src/pages/SpaceList.tsx` (cards with display name, state badge and out-of-sync/unavailable message)
- [X] T046 [P] [US1] Implement accessible page tree component in `src/web/src/components/PageTree.tsx` (ARIA `tree`/`treeitem`, arrow-key navigation, expand/collapse, current page highlighted)
- [X] T047 [US1] Implement `SpaceLayout` and `PageView` in `src/web/src/pages/SpaceLayout.tsx` and `src/web/src/pages/PageView.tsx`: route `/s/:spaceId/*`, render server-sanitized `html` (the only place using `dangerouslySetInnerHTML`), intercept clicks on internal links for client-side navigation, show out-of-sync banner, show download link when `tooLarge`
- [X] T048 [P] [US1] Create `deploy/Dockerfile`: stage 1 `node:lts` builds `src/web`; stage 2 `mcr.microsoft.com/dotnet/sdk:10.0` publishes self-contained `linux-x64`/`linux-arm64` (via `TARGETARCH`) with `-p:SkipWebBuild=true` using stage 1 output; final stage `mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled`, `USER 1654`, `VOLUME /data`, `EXPOSE 8080`
- [X] T049 [P] [US1] Create Kubernetes manifests in `deploy/kubernetes/` (`kustomization.yaml`, `deployment.yaml` with `replicas: 1`, `strategy: Recreate`, `runAsNonRoot`, `runAsUser: 1654`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault`, PVC at `/data`, `emptyDir` at `/tmp`, liveness/readiness probes; `pvc.yaml`, `service.yaml`, `ingress.example.yaml`, `secret.example.yaml`, namespace label `pod-security.kubernetes.io/enforce: restricted`) and `deploy/compose.yaml`
- [X] T109 [US1] Support local repositories as `Git` space remotes (user request 2026-10-17): `RemoteUrl` may be a filesystem path to a bare **or non-bare** repository; integration tests in `tests/Copernica.IntegrationTests/Spaces/LocalRepositoryTests.cs` cover reading from a working-copy repository and picking up local commits; saving to a branch that is checked out in a non-bare repository is rejected with problem type `push-rejected` and a message suggesting a bare repository or another branch (no silent working-tree divergence) — enforced in `src/Copernica/Git/PageWriter.cs` when US2 lands
- [X] T050 [US1] Playwright scenarios A1–A5 and A15 in `tests/e2e/us1-reading.spec.ts` (server started with two `Git` spaces from temp bare repositories)

**Checkpoint**: MVP — a team can publish Markdown from several repositories and read it safely

---

## Phase 4: User Story 1 (continued) — Access through Azure DevOps Services (Priority: P1)

**Goal**: Users sign in with Microsoft Entra ID and see exactly the Azure DevOps repositories they can read (FR-009, FR-009a, FR-009b)

**Independent Test**: quickstart.md scenarios B1, B5, B6

### Tests ⚠️

- [X] T051 [P] [US1] Unit tests for Azure DevOps URL parsing and security tokens in `tests/Copernica.Tests/Hosting/AzureDevOpsTokenTests.cs`: `https://dev.azure.com/{org}/{project}/_git/{repo}` and `https://{org}.visualstudio.com/{project}/_git/{repo}`; branch token `repoV2/{projectId}/{repoId}/refs/heads/6d00610069006e00` for `main`; `feature/x` → two hex-encoded UTF-16LE segments separated by `/`
- [X] T052 [P] [US1] Integration tests with a stub HTTP handler for Azure DevOps in `tests/Copernica.IntegrationTests/Hosting/AzureDevOpsPermissionTests.cs`: read/write mapped from Has Permissions response, HTTP error or timeout → denied, results cached for `PermissionCacheTtl` then re-checked
- [X] T053 [P] [US1] Token store tests in `tests/Copernica.IntegrationTests/Auth/EncryptedTokenCacheTests.cs`: stored `CacheBlob` is not plaintext, round-trips, deleted on sign-out, never present in any API response

### Implementation

- [X] T054 [P] [US1] Create `DelegatedToken` entity in `src/Copernica/Data/DelegatedToken.cs` (table `user_tokens`: `UserId` FK, `Provider` enum `AzureDevOps`, `CacheBlob` bytes "encrypted with ASP.NET Core Data Protection", `UpdatedAt`) and migration in `src/Copernica/Data/Migrations/`
- [X] T055 [US1] Implement `EncryptedTokenCache` in `src/Copernica/Auth/EncryptedTokenCache.cs` as the Microsoft.Identity.Web token cache provider storing MSAL cache blobs in `user_tokens`, protected with `IDataProtector` purpose `Copernica.UserTokens`
- [X] T056 [US1] Implement `EntraId` auth mode in `src/Copernica/Auth/EntraId/EntraIdAuthentication.cs`: OIDC authorization code + PKCE as confidential client (`TenantId`, `ClientId`, `ClientSecret` from configuration), request scope `499b84ac-1321-427f-aa17-267ca6975798/.default`, `GET /auth/challenge`, `POST /auth/logout` (clears tokens), user upsert from `oid`, `name`, `email`/`preferred_username`
- [X] T057 [P] [US1] Implement `AzureDevOpsRepositoryUrl` parser in `src/Copernica/Hosting/AzureDevOps/AzureDevOpsRepositoryUrl.cs` and `SecurityTokens` (repository and branch tokens) in `src/Copernica/Hosting/AzureDevOps/SecurityTokens.cs`
- [X] T058 [US1] Implement `AzureDevOpsClient` in `src/Copernica/Hosting/AzureDevOps/AzureDevOpsClient.cs`: resolve project and repository ids at startup with the sync credential; `HasPermissionsAsync(token, namespace 2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87, bits, tokens)` with `api-version=7.1`; at startup verify via `_apis/securitynamespaces/2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87` that `GenericRead` = 2 and `GenericContribute` = 4, otherwise mark Azure DevOps spaces `Unavailable`
- [X] T059 [US1] Implement sync credentials in `src/Copernica/Hosting/AzureDevOps/SyncCredentialProvider.cs` for `ServicePrincipal` (MSAL confidential client), `ManagedIdentity` (MSAL managed identity) and `Pat` (Basic), configured under `Copernica:AzureDevOps:SyncCredential`; used only for fetching
- [X] T060 [US1] Implement `AzureDevOpsHostingProvider` in `src/Copernica/Hosting/AzureDevOps/AzureDevOpsHostingProvider.cs`: permissions via user token (read: bit 2 on repository token; write: bit 4 on branch token); user git credentials as `Authorization: Bearer <token>` custom header obtained via `ITokenAcquisition.GetAccessTokenForUserAsync` (never parse tokens or assume lifetime)
- [X] T061 [US1] Register providers by `Space.Provider` and select auth mode by `Copernica:Auth:Mode` in `src/Copernica/Program.cs`; document required Entra app registration settings in `docs/azure-devops.md`

**Checkpoint**: Azure DevOps Services deployments show each user only their repositories

---

## Phase 5: User Story 2 — Edit and create pages with attributed history (Priority: P2)

**Goal**: Users with push rights edit, create and delete pages; each save is one commit authored and pushed as the user; history and diffs are browsable

**Independent Test**: quickstart.md scenarios A6–A8 (and B2–B4 on Azure DevOps)

### Tests for User Story 2 ⚠️

- [X] T062 [P] [US2] Editing integration tests in `tests/Copernica.IntegrationTests/Editing/SaveTests.cs`: save → exactly one new commit on the remote branch with author name/email of the user and the change description as message; create with no `base` adds the file under `Folder`; create on existing path → 409 `page-exists`; delete creates one commit and keeps history; read-only user → 403 `no-write-permission` and no commit; injected push rejection → 403 `push-rejected` with platform message and no local ref change; `message` empty or > 500 chars and `markdown` > 1048576 bytes → 400; paths with `..`, not ending in `.md`, or outside `Folder` → 400; space not `Ready` → 503 `space-unavailable`
- [X] T063 [P] [US2] History and diff integration tests in `tests/Copernica.IntegrationTests/Editing/HistoryTests.cs`: newest first, cursor pagination with `limit` default 50 and maximum 200, rename-aware history, `GET /pages/{path}?version=` returns the old content with `isCurrent = false`, diff returns both sources
- [X] T064 [P] [US2] Render preview tests in `tests/Copernica.IntegrationTests/Editing/RenderEndpointTests.cs`: `POST /api/render` output is identical to the page pipeline for the same Markdown and requires antiforgery header

### Implementation for User Story 2

- [X] T065 [US2] Implement `CommitAuthorFactory` in `src/Copernica/Git/CommitAuthorFactory.cs` (name = `DisplayName`, email = `Email` or `{Id}@{FallbackEmailDomain}`, UTC timestamp; used as author and committer)
- [X] T066 [US2] Implement `PageWriter` in `src/Copernica/Git/PageWriter.cs` following research.md R5 steps 1, 2 and 4: take the space write lock; fetch with the user's credentials; build commit C from the base commit's tree with the page blob added, replaced or removed, parent = `base.commitId`; if the branch tip equals `base.commitId` push C via `PushOptions.CustomHeaders`/credentials, else return a "base outdated" result (handled in US3); retry from fetch on non-fast-forward up to 3 attempts; map permission/policy rejections to `push-rejected` with the platform message; update mirror refs only after a successful push; never force-push
- [X] T067 [US2] Implement validation for `SavePageRequest` in `src/Copernica/Api/PageWriteValidation.cs`: `message` 1–500 chars, `markdown` ≤ 1048576 bytes, space-relative path ending in `.md`, no `..` segments, inside `Folder`
- [X] T068 [US2] Implement `PUT` and `DELETE /api/spaces/{spaceId}/pages/{**path}` and `POST /api/render` in `src/Copernica/Api/PageWriteEndpoints.cs` per contracts/openapi.yaml, guarded by `RequireWriteAsync`; until US3 a changed base returns 409 `edit-conflict` with the conflict body
- [X] T069 [US2] Implement `HistoryService` (path-filtered, rename-following history with cursor pagination) in `src/Copernica/Git/HistoryService.cs` and endpoints `GET /api/spaces/{spaceId}/history/{**path}` and `GET /api/spaces/{spaceId}/diff/{**path}` in `src/Copernica/Api/HistoryEndpoints.cs`
- [X] T070 [P] [US2] Implement `MarkdownEditor` component in `src/web/src/components/MarkdownEditor.tsx` (CodeMirror 6 with Markdown language, line wrapping, accessible label, no `eval`-based extensions)
- [X] T071 [US2] Implement `PageEdit` page in `src/web/src/pages/PageEdit.tsx`: loads source with `?source=true`, side-by-side preview via debounced `POST /api/render`, required change description, save via `PUT` sending `base`; keeps the edited text on any error (also in `sessionStorage`, wrapped in try/catch) and shows the problem `detail`; on 401 stores the draft, signs in again and restores it
- [X] T072 [P] [US2] Implement create-page dialog and delete confirmation in `src/web/src/components/NewPageDialog.tsx` and `src/web/src/components/DeletePageDialog.tsx`; show edit/create/delete actions only when `canWrite`; offer "create this page" on broken links when `canWrite`
- [X] T073 [P] [US2] Implement `History` page and `DiffView` component in `src/web/src/pages/History.tsx` and `src/web/src/components/DiffView.tsx` (`@codemirror/merge` unified view, select two versions to compare, open old version read-only)
- [X] T074 [US2] Playwright scenarios A6–A8 in `tests/e2e/us2-editing.spec.ts`, verifying commits in the temp bare remote with plain git

**Checkpoint**: The wiki is editable; every change is a commit by its author

---

## Phase 6: User Story 3 — Concurrent edits never overwrite each other (Priority: P3)

**Goal**: Saves on an outdated base are merged automatically when changes don't overlap and stopped with a conflict view when they do; nothing is lost

**Independent Test**: quickstart.md scenarios A9–A11

### Tests for User Story 3 ⚠️

- [X] T075 [P] [US3] Merge unit tests in `tests/Copernica.Tests/Git/PageMergeTests.cs` using temp repositories: non-overlapping edits merge cleanly into one single-parent commit on top of the tip; same-line edits produce a conflict with base/theirs/mine sources; delete vs edit → conflict; external commit touching another file only → clean merge
- [X] T076 [P] [US3] Concurrency integration tests in `tests/Copernica.IntegrationTests/Editing/ConcurrencyTests.cs`: alice and bob save from the same base (different sections → both changes present, bob gets `merged: true`; same lines → bob gets 409 `edit-conflict` with `theirsAuthors` containing alice and nothing pushed); a commit pushed with `TestRemote` while editing behaves the same; parallel saves never lose either change (SC-004)

### Implementation for User Story 3

- [X] T077 [US3] Extend `PageWriter` in `src/Copernica/Git/PageWriter.cs` with research.md R5 step 3: when the tip differs from `base.commitId`, run `ObjectDatabase.MergeCommits(C, tip)`; clean result → create one commit with the merged tree, parent = tip, the user's message and author, push and return `merged: true`; conflicts → return `EditConflict` (`baseSource`, `theirsSource`, `theirsVersion`, `theirsAuthors` = authors of commits between base and tip touching the path, `mineSource`) without pushing
- [X] T078 [US3] Return `EditConflict` problem details (`type` suffix `edit-conflict`, status 409) and `merged` flag from `src/Copernica/Api/PageWriteEndpoints.cs`
- [X] T079 [US3] Implement `ConflictView` in `src/web/src/pages/ConflictView.tsx`: `@codemirror/merge` view of mine vs theirs with base available, editable result, save with `base = theirsVersion`; "abandon" keeps the user's text visible and copyable until leaving the page
- [X] T080 [P] [US3] Show a non-blocking "merged with changes by …" notice after `merged: true` saves in `src/web/src/components/SaveNotice.tsx`
- [X] T081 [US3] Playwright scenarios A9–A11 in `tests/e2e/us3-conflicts.spec.ts` (two browser contexts as alice and bob)

**Checkpoint**: Concurrent editing is safe

---

## Phase 7: User Story 4 — Discuss specific fragments of a page (Priority: P4)

**Goal**: Users start discussions on selected text, reply, edit/delete own comments, resolve/reopen; discussions follow the text and live outside the repositories

**Independent Test**: quickstart.md scenarios A12–A14

### Tests for User Story 4 ⚠️

- [X] T082 [P] [US4] Plain-text parity tests in `tests/Copernica.Tests/Rendering/PlainTextExtractorTests.cs` and `src/web/src/discussions/textAnchor.test.ts`: for a shared fixture set of sanitized HTML, the server text equals the browser `textContent` of the article (fixtures in `tests/fixtures/anchoring/`)
- [X] T083 [P] [US4] Re-anchoring unit tests in `tests/Copernica.Tests/Discussions/ReanchorTests.cs`: unique exact match; multiple matches resolved by prefix/suffix then distance to old offset; fuzzy match accepted at similarity ≥ 0.75; deleted fragment → `Outdated` keeping `OriginalExact`; corpus test of edits elsewhere on the page keeps ≥ 95 % anchored (SC-006)
- [X] T084 [P] [US4] Discussions integration tests in `tests/Copernica.IntegrationTests/Discussions/DiscussionTests.cs`: create with anchor not matching the page at `commitId` → 422 `anchor-not-found`; replies ordered by `CreatedAt`; only the author may edit/delete (403 `not-comment-author`); edited comment has `editedAt`; deleting the first comment with replies soft-deletes it; deleting all comments removes the discussion; resolve/reopen sets/clears `ResolvedBy`/`ResolvedAt`; `state=open|resolved|all` filter; unreadable space → 404; after any activity the remote repository contains no new commits or discussion text; comment `body` returned only to its author

### Implementation for User Story 4

- [X] T085 [P] [US4] Create entities in `src/Copernica/Discussions/Discussion.cs` and `src/Copernica/Discussions/Comment.cs` with owned `TextAnchor`, per data-model.md: `Discussion` (`Id` GUID, `SpaceId`, `PagePath`, `State` `Open | Resolved`, `AnchorStatus` `Anchored | Outdated`, `CreatedBy`, `CreatedAt`, `ResolvedBy`, `ResolvedAt`; index (`SpaceId`, `PagePath`)); `TextAnchor` (`Exact` "1–2,000 chars, non-whitespace", `Prefix`/`Suffix` "Up to 32 chars", `Start`, `End`, `CommitId`, immutable `OriginalExact`); `Comment` (`Id` GUID, `DiscussionId` FK cascade, `AuthorId` FK users, `Body` "1–10,000 chars, Markdown", `CreatedAt`, `EditedAt`, `DeletedAt`); add migration in `src/Copernica/Data/Migrations/`
- [X] T086 [P] [US4] Implement `PlainTextExtractor` in `src/Copernica/Rendering/PlainTextExtractor.cs` (AngleSharp, concatenated text nodes of the rendered article exactly like DOM `textContent`)
- [X] T087 [P] [US4] Vendor diff-match-patch (Apache-2.0, keep license header) as `src/Copernica/Discussions/DiffMatchPatch.cs`
- [X] T088 [US4] Implement `Reanchorer` in `src/Copernica/Discussions/Reanchorer.cs` per research.md R6 (exact → prefix/suffix/distance tie-break → fuzzy `match_main` threshold 0.3 on quote start/end with full-quote similarity ≥ 0.75 → `Outdated`); persist the new `Start`, `End`, `Prefix`, `Suffix`, `CommitId` so each discussion is re-anchored once per page version; when the page path no longer exists, follow a rename found in history and update `PagePath`, otherwise mark `Outdated`
- [X] T089 [US4] Implement `DiscussionService` in `src/Copernica/Discussions/DiscussionService.cs`: create (validate the anchor against the plain text at `commitId`), reply, edit/delete own comment with the soft-delete rules, resolve/reopen, list by page and state with re-anchoring for the current head; comment HTML rendered with `MarkdownRenderer` + sanitizer
- [X] T090 [US4] Implement endpoints in `src/Copernica/Api/DiscussionsEndpoints.cs`: `GET/POST /api/spaces/{spaceId}/discussions`, `POST /api/discussions/{id}/comments`, `PATCH/DELETE /api/discussions/{id}/comments/{commentId}`, `PUT /api/discussions/{id}/state` per contracts/openapi.yaml; every call checks `RequireReadAsync` on the discussion's space (FR-025)
- [X] T091 [P] [US4] Implement `textAnchor.ts` in `src/web/src/discussions/textAnchor.ts`: convert a DOM `Selection` inside the article to `{exact, prefix (≤ 32), suffix (≤ 32), start, end}` over text nodes, and offsets back to DOM `Range`s
- [X] T092 [P] [US4] Implement `useHighlights` in `src/web/src/discussions/useHighlights.ts` with the CSS Custom Highlight API (`CSS.highlights`, `::highlight(discussion)` with `background-color` only); clicking or pressing Enter on highlighted text opens its discussion
- [X] T093 [US4] Implement `DiscussionPanel` in `src/web/src/discussions/DiscussionPanel.tsx`: "Comment" action on text selection (also reachable by keyboard), new discussion form, thread with replies (author, time, "edited", "comment deleted"), edit/delete own comments, resolve/reopen, filter open/resolved/all, outdated discussions showing `originalExact`
- [X] T094 [US4] Playwright scenarios A12–A14 in `tests/e2e/us4-discussions.spec.ts`

**Checkpoint**: All four user stories work independently

---

## Phase 8: Azure DevOps Server (on-premises) support

**Purpose**: Spec assumption "Azure DevOps (cloud service and on-premises server)"; research.md R3 — generic OIDC sign-in plus per-user personal access tokens

- [X] T095 [US1] Add `GET/PUT/DELETE /api/me/tokens/azure-devops` (PUT body `{ token }`, never returned) to `specs/001-git-backed-team-wiki/contracts/openapi.yaml` and regenerate `src/web/src/api/schema.d.ts`
- [X] T096 [US1] Implement `Oidc` auth mode (generic authority, e.g. AD FS) in `src/Copernica/Auth/Oidc/OidcAuthentication.cs`
- [X] T097 [US1] Store user PATs encrypted in `user_tokens` (same Data Protection purpose) and implement the token endpoints in `src/Copernica/Api/UserTokenEndpoints.cs`
- [X] T098 [US1] Support Azure DevOps Server URLs `https://{server}/{collection}/{project}/_git/{repo}` in `src/Copernica/Hosting/AzureDevOps/AzureDevOpsRepositoryUrl.cs`, and use the user's PAT (Basic) for permission checks and git operations when `Copernica:AzureDevOps:Server:UserPat=true` in `src/Copernica/Hosting/AzureDevOps/AzureDevOpsHostingProvider.cs`
- [X] T099 [P] [US2] Add a profile page for registering/removing the PAT in `src/web/src/pages/Profile.tsx`, with a prompt from `PageEdit` when no PAT is registered
- [X] T100 [P] [US1] Tests for PAT storage (encrypted, never returned) and Server URL parsing in `tests/Copernica.IntegrationTests/Auth/UserPatTests.cs` and `tests/Copernica.Tests/Hosting/AzureDevOpsServerUrlTests.cs`

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T101 [P] Write `SECURITY.md`: listening port, files written (only `DataDirectory` + temp), possible outbound connections (configured git hosts and identity provider only, default none), authentication modes, delegated token handling, container security context, libgit2 GPLv2-with-linking-exception notice, vulnerability reporting
- [X] T102 [P] Add `scripts/check-licenses.ps1` that lists shipped NuGet packages (`dotnet list package --include-transitive`) and production npm packages and fails on licenses outside the allow-list (MIT, BSD-2/3, Apache-2.0, ISC, plus the documented libgit2 exception); generate `THIRD-PARTY-NOTICES.md`
- [ ] T103 Decide the automated WCAG 2.1 AA check tool (axe-core is MPL-2.0 — either amend the constitution's build-tooling rule or choose another tool), then add accessibility assertions to every spec in `tests/e2e/`
- [X] T104 [P] Add `scripts/publish.ps1` producing self-contained single-file executables for `win-x64`, `osx-arm64`, `linux-x64`, `linux-arm64` with `IncludeNativeLibrariesForSelfExtract=true`, plus a smoke test that starts each artifact, opens a `Git` space and calls `/health/ready` (research.md R1 risk; fall back to folder publish if it fails)
- [X] T105 [P] Add CI workflow `.github/workflows/ci.yml`: `dotnet restore --locked-mode`, build, `dotnet test`, `npm ci`, lint, Vitest, Playwright, license check, multi-arch (`linux/amd64`, `linux/arm64`) image build
- [X] T106 [P] Add performance check in `tests/perf/` generating 20 spaces × 5,000 pages and verifying page display < 2 s for 100 KB pages with 50 concurrent users (SC-002, SC-008)
- [X] T107 [P] Update `README.md` with run instructions (binary, Docker, Kubernetes) and link `docs/azure-devops.md`
- [X] T108 Run all quickstart.md scenarios (A, B, C), including the network capture check C3, and record results in `specs/001-git-backed-team-wiki/checklists/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup — blocks all stories
- **US1 (Phase 3)**: after Foundational — MVP
- **US1 Azure DevOps (Phase 4)**: after Phase 3 (reuses spaces/permission plumbing)
- **US2 (Phase 5)**: after Foundational; needs Phase 3 UI (PageView) for the editor entry point
- **US3 (Phase 6)**: after Phase 5 (extends `PageWriter`)
- **US4 (Phase 7)**: after Phase 3 (reads rendered pages); independent of US2/US3
- **Azure DevOps Server (Phase 8)**: after Phase 4 and Phase 5
- **Polish (Phase 9)**: after the desired stories

### User Story Dependencies

```text
Setup → Foundational → US1 ─┬─→ US1/AzDO Services ─┐
                            ├─→ US2 → US3 ─────────┼─→ AzDO Server → Polish
                            └─→ US4 ───────────────┘
```

### Within Each User Story

- Tests first, failing
- Entities → services → endpoints → UI → e2e
- `PageWriter` changes (T066, T077) are sequential — same file

### Parallel Opportunities

- Setup: T003–T006, T008 in parallel after T001–T002
- Foundational: T010, T011, T014, T015, T018, T023, T029, T030, T032, T033 in parallel
- After Phase 3: Phase 4, Phase 5 and Phase 7 can be staffed in parallel
- Within stories: all `[P]` tests together; backend and frontend `[P]` tasks together

---

## Parallel Example: User Story 1

```text
# Tests together:
T034 SanitizationTests  |  T035 WikiLinkRewriterTests  |  T036 PageTreeTests
T037 ReadingTests       |  T038 FilesTests

# Then independent implementation pieces:
T039 PageTitle  |  T041 WikiLinkRewriter  |  T045 SpaceList  |  T046 PageTree
T048 Dockerfile |  T049 Kubernetes manifests
```

## Parallel Example: User Story 4

```text
T082 parity tests  |  T083 ReanchorTests  |  T084 DiscussionTests
T085 entities      |  T086 PlainTextExtractor  |  T087 diff-match-patch
T091 textAnchor.ts |  T092 useHighlights
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 + Phase 2
2. Phase 3 (US1 with `Git` spaces and local accounts)
3. **Stop and validate** with quickstart A1–A5, A15 and container scenarios C1–C2
4. Demo: read-only team wiki over several repositories

### Incremental Delivery

1. MVP → 2. Azure DevOps Services access → 3. Editing (US2) → 4. Conflict handling (US3)
→ 5. Discussions (US4) → 6. Azure DevOps Server → 7. Polish
Each increment is demonstrable on its own and keeps earlier stories working.

---

## Notes

- `[P]` = different files, no dependency on incomplete tasks
- Commit after each task or logical group (English commit messages, Constitution I)
- Any task adding a shipped dependency not listed in plan.md must add a justification row
  to plan.md (Constitution IV)
- Any change to ports, egress, authentication, container security context or storage
  format must update `SECURITY.md` (Constitution, Quality Gates)
