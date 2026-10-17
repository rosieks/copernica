# Validation Results: Git-Backed Team Wiki

**Date**: 2026-10-17 · **Build**: branch `001-git-backed-team-wiki` · **Machine**: Windows 11,
.NET SDK 10.0.401, Node 22.18, Docker 20.10

Scenarios from [quickstart.md](../quickstart.md). "Automated" names the test that covers the
scenario on every run.

## A. Local evaluation

| # | Result | Evidence |
|---|--------|----------|
| A1 | Pass | e2e `us1-reading.spec.ts` A1; integration `ReadingTests.Anonymous_users_get_401` |
| A2 | Pass | e2e A2 (incl. keyboard navigation); `ReadingTests.Tree_respects_the_space_folder` |
| A3 | Pass | e2e A3; unit `WikiLinkRewriterTests` |
| A4 | Pass | e2e A4 (no script execution, no CSP violations); unit `SanitizationTests` |
| A5 | Pass | e2e A5; `ReadingTests.Commits_pushed_outside_the_wiki_become_visible_after_sync` |
| A6 | Pass | e2e `us2-editing.spec.ts` A6 (author and message checked with `git log`); `SaveTests` |
| A7 | Pass | e2e A7; `SaveTests.Creating_*`, `Deleting_*` |
| A8 | Pass | e2e A8; `HistoryTests` |
| A9 | Pass | e2e `us3-conflicts.spec.ts` A9; `ConcurrencyTests`, unit `PageMergeTests` |
| A10 | Pass | e2e A10 (resolve, and discard keeps the text); `ConcurrencyTests.Overlapping_*` |
| A11 | Pass | e2e A11; `ConcurrencyTests.Commit_pushed_outside_the_wiki_is_detected` |
| A12 | Pass | e2e `us4-discussions.spec.ts` A12; `DiscussionTests` |
| A13 | Pass | e2e A13; unit `ReanchorTests` (≥ 95 % corpus check for SC-006) |
| A14 | Pass | e2e A14; `DiscussionTests.Discussions_never_touch_the_repository` |
| A15 | Pass | integration `ReadingTests.Unreachable_space_does_not_affect_others` (no e2e) |

**Browsers** (each on a fresh server):

| Browser | Result | Notes |
|---------|--------|-------|
| Chromium | 16/16 | |
| Firefox | 16/16 | |
| WebKit (Playwright build on Windows) | 14/16 | The two-context tests A10 and A12 exceed the 90 s timeout because input is very slow in this build. Recheck on macOS/Linux CI. |

**Local repositories (T109):**

- Bare and working-copy repositories are read correctly.
- Saving to a branch that is checked out in a working copy is refused with an explanation.

Covered by `LocalRepositoryTests`.

## B. Azure DevOps Services

**Not run against a real organization.** No Azure DevOps organization or Entra app
registration was available. What is covered by automated tests:

| # | Coverage |
|---|----------|
| B1 | `AzureDevOpsPermissionTests`: stubbed Azure DevOps REST. Read/write mapping, hidden spaces, 404s, errors deny access, 2-minute cache then re-check |
| B2 | `SaveTests.Read_only_user_cannot_save` (generic permission path) |
| B3 / B4 | Push uses the user's credentials (`AzureDevOpsHostingProvider`). Rejection handling is covered by `LocalRepositoryTests` (`push-rejected`). Branch-policy messages from Azure DevOps are **not verified** |
| B5 | Covered by the cache TTL test |
| B6 | `EncryptedTokenCacheTests`, `UserPatTests`: tokens stored only encrypted |

**Manual follow-up required:** run B1–B6 with a test organization and two users, following
[docs/azure-devops.md](../../../docs/azure-devops.md).

## C. Container and Kubernetes

| # | Result | Evidence |
|---|--------|----------|
| C1 | Pass | `docker run --read-only --cap-drop=ALL --security-opt no-new-privileges` as UID 1654. Health endpoints return 200, sign-in and a git-backed space work |
| C2 | Not run | No Kubernetes cluster available. Manifests in `deploy/kubernetes` follow PSS `restricted` but have not been admitted by a real API server |
| C3 | Not run | Network capture not performed. By design, outbound traffic goes only to the configured remotes and identity provider (see `SECURITY.md`) |
| C4 | Pass | `SecurityHeadersTests`: CSP, `nosniff`, `Referrer-Policy` on API, SPA and health responses |

## Other checks

| Check | Result |
|-------|--------|
| .NET unit + integration tests | 192/192 |
| Web unit tests (Vitest) | 8/8 |
| License check (`scripts/check-licenses.ps1`) | 81 shipped dependencies, all allowed (libgit2: documented linking exception) |
| Single-file publish + smoke test (`scripts/publish.ps1`, win-x64) | Pass: ~122 MB executable, libgit2 loads, page created |
| Load check (`tests/perf/run.mjs`, 20 spaces × 5,000 pages, 50 users, 60 s) | Pass. Normal pages p95 273 ms; 100 KB pages p95 383 ms; page tree p95 367 ms; 0 errors. Cold trees for all 20 spaces build in 10.6 s |
| Automated WCAG 2.1 AA checks (T103) | **Open**: waiting for the tool/license decision |
