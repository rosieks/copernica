# Quickstart & Validation: Git-Backed Team Wiki

Runnable scenarios proving the feature end-to-end. API shapes:
[contracts/openapi.yaml](contracts/openapi.yaml); settings:
[contracts/configuration.md](contracts/configuration.md); entities:
[data-model.md](data-model.md).

## Prerequisites

- .NET 10 SDK, Node.js LTS, Docker (for the container scenario)
- git (only to prepare test repositories and inspect results)
- For scenario B: an Azure DevOps Services test organization, an Entra app registration
  (web, redirect `https://<host>/signin-oidc`, delegated permission *Azure DevOps →
  user_impersonation*), two test users with different repository permissions

## A. Local evaluation (no external services)

```bash
# 1. Prepare two "remote" repositories
git init --bare /tmp/remotes/handbook.git
git init --bare /tmp/remotes/service.git
# push a few Markdown files with nested folders, relative links, an image,
# and a page containing <script>alert(1)</script>; service.git gets a docs/ folder

# 2. Build and run
dotnet run --project src/Copernica -- \
  --Copernica:Auth:Mode=Local \
  --Copernica:Auth:Local:Users:0:Name=alice --Copernica:Auth:Local:Users:0:PasswordHash=<hash> \
  --Copernica:Auth:Local:Users:1:Name=bob   --Copernica:Auth:Local:Users:1:PasswordHash=<hash> \
  --Copernica:Spaces:0:Id=handbook --Copernica:Spaces:0:Provider=Git \
  --Copernica:Spaces:0:RemoteUrl=/tmp/remotes/handbook.git \
  --Copernica:Spaces:1:Id=service --Copernica:Spaces:1:Provider=Git \
  --Copernica:Spaces:1:RemoteUrl=/tmp/remotes/service.git --Copernica:Spaces:1:Folder=docs
# open http://127.0.0.1:8080
```

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| A1 | Open the URL without signing in | Sign-in page, no content; `GET /api/spaces` → 401 | US1-5, FR-008 |
| A2 | Sign in as alice | Both spaces listed; trees mirror folders; `service` shows only `docs/` | US1-1/2, FR-001..003 |
| A3 | Follow a relative link and a `wiki:handbook/...` link | Target pages open in the wiki | US1-3, FR-005 |
| A4 | Open the page with `<script>` | No alert; script absent from DOM; no CSP violations in console | US1-4, FR-006 |
| A5 | Push a commit to `handbook.git` with plain git | Change visible within 2 min, no restart | US1-7, FR-007, SC-005 |
| A6 | Edit a page as alice, save with message "Fix typo" | `git log` on the bare remote: new commit, author alice, message "Fix typo" | US2-1, FR-011, SC-003 |
| A7 | Create `guides/new.md`, then delete it | Two commits; page appears then disappears; visible in history | US2-2/3 |
| A8 | Open history, view an old version, compare two versions | List with author/date/message; diff view | US2-4, FR-014 |
| A9 | alice and bob open the same page; alice edits section 1 and saves; bob edits section 3 and saves | Both changes present; bob sees "merged" notice; one commit per save | US3-1, FR-016 |
| A10 | Both edit the same line; alice saves, then bob saves | bob gets the conflict view (mine / theirs / base); after resolving, saved content = resolution; nothing lost | US3-2, FR-017, SC-004 |
| A11 | bob is editing; a commit to the same lines is pushed with plain git; bob saves | Conflict view as in A10 | US3-3 |
| A12 | alice selects a sentence and comments; bob replies; alice edits her comment; bob resolves | Highlight visible to both; reply in order; "edited" marker; resolved hidden by default, listable, reopenable | US4-1..4, 8 |
| A13 | Edit a different paragraph of that page; then delete the commented sentence | Discussion stays on the sentence; after deletion it is "outdated" with original quote | US4-5/6, FR-023 |
| A14 | `git clone` the remote and grep for discussion text | Not found | US4-7, FR-024 |
| A15 | Stop `service.git` access (rename the directory) | `service` shows "out of sync", saves rejected; `handbook` unaffected | FR-026 |

## B. Azure DevOps Services

Configure `Auth:Mode=EntraId`, the sync credential (read-only), and two spaces pointing
to repositories where **user R** has read-only access to repo 1, and **user W** can
contribute to repo 1 and has no access to repo 2.

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| B1 | Sign in as R | Only space 1 listed; space 2 URLs → 404 incl. its discussions and files | FR-009/009b, SC-009 |
| B2 | R opens a page | No edit actions; `PUT` → 403 `no-write-permission` | US2-5 |
| B3 | W edits a page | Commit in Azure DevOps with W as author **and** pusher | US2-6, FR-009a |
| B4 | Add a branch policy requiring PRs on space 1's branch; W saves | 403 `push-rejected` with the policy reason; editor keeps W's text | US2-7, FR-013 |
| B5 | Grant R contribute rights in Azure DevOps | R can edit within 5 minutes without signing out | FR-009b |
| B6 | Inspect the database file | Tokens present only as encrypted blobs | Constitution III |

## C. Container and Kubernetes

```bash
docker build -f deploy/Dockerfile -t copernica:dev .
docker run --rm -p 8080:8080 --read-only --cap-drop=ALL --user 1654 \
  -v copernica-data:/data -e Copernica__Auth__Mode=Local ... copernica:dev
kubectl apply -k deploy/kubernetes   # in a namespace enforcing PSS "restricted"
```

| # | Expected |
|---|----------|
| C1 | Container starts with read-only root FS and no capabilities; `/health/live` and `/health/ready` return 200 |
| C2 | Pod admitted under `pod-security.kubernetes.io/enforce: restricted`; data survives pod restart (PVC) |
| C3 | Network capture during A-scenarios shows connections only to configured remotes/IdP |
| C4 | Response headers include the strict CSP and `X-Content-Type-Options: nosniff` |

## Automated checks

```bash
dotnet test                       # unit + integration (temp bare repos, fake hosting provider)
npm --prefix src/web test         # Vitest
npx --prefix tests/e2e playwright test   # scenarios A1–A15 + automated WCAG 2.1 AA checks
```
