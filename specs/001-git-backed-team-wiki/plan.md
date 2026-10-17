# Implementation Plan: Git-Backed Team Wiki

**Branch**: `001-git-backed-team-wiki` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-git-backed-team-wiki/spec.md`

## Summary

A shared team wiki that serves Markdown pages from several git repositories ("spaces") in
one deployment. An ASP.NET Core server keeps bare mirrors of the repositories on its data
volume, renders and sanitizes Markdown on the server, and exposes a JSON API to a React
single-page UI embedded in the same executable. Users sign in with the identity their git
hosting platform uses (Azure DevOps + Microsoft Entra ID first); the server checks their
repository permissions on their behalf and pushes their edits as commits made with their
own token, directly to the space's branch. Concurrent edits are detected by comparing the
edit's base commit with the branch tip and resolved with an in-memory three-way merge.
Discussions anchored to text fragments (quote + context + offsets) live in SQLite next to
the mirrors and are re-anchored when pages change.

## Technical Context

**Language/Version**: C# 14 / .NET 10 (LTS); TypeScript 5.x (strict)

**Primary Dependencies**: ASP.NET Core 10, LibGit2Sharp 0.32 (libgit2, GPLv2 + linking
exception), Markdig, HtmlSanitizer (AngleSharp), Microsoft.Identity.Web, EF Core 10
SQLite, diff-match-patch (vendored); React 19, React Router, TanStack Query, CodeMirror 6
(+ `@codemirror/merge`), Vite (build only)

**Storage**: Bare git mirrors (content, source of truth) + SQLite (discussions, users,
encrypted tokens, sync status) on one data volume

**Testing**: xUnit v3, Microsoft.AspNetCore.Mvc.Testing, Vitest + Testing Library,
Playwright (e2e)

**Target Platform**: Linux container (amd64/arm64, chiseled, non-root) on Kubernetes /
Docker; self-contained executable for Windows, macOS, Linux

**Project Type**: Web application (server + embedded SPA), single deployable artifact

**Performance Goals**: Page display < 2 s for pages up to 100 KB (SC-002); 50 concurrent
users; external changes visible within 2 min (SC-005)

**Constraints**: Single replica; no outbound connections except configured git hosts and
identity provider; strict CSP; read-only root FS; permission changes effective ≤ 5 min

**Scale/Scope**: Up to 20 spaces × 5,000 pages (SC-008); ~12 UI screens/panels

All former unknowns are resolved in [research.md](research.md) (R1–R10).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / rule | Status | Evidence |
|---|------------------|--------|----------|
| I | English for all artifacts | ✅ | Spec, plan, contracts, UI strings in English |
| II | Self-hosted; only org's git hosting + IdP; no other egress; bundled assets; single command; container + k8s manifests | ✅ | Outbound only to configured `RemoteUrl` hosts and IdP ([configuration.md](contracts/configuration.md)); SPA embedded; `deploy/` ships Dockerfile + manifests |
| III | Auth required; localhost default for binary; non-root, PSS `restricted`, read-only root FS; safe content; nothing forbidden added; transparency | ✅ | `Auth.Mode` mandatory off-loopback; chiseled UID 1654; server-side sanitization (R7); files served with `nosniff`/attachment; no plugins, no URL fetching; `SECURITY.md` task |
| III | Delegated access: minimal scopes, server-side only, encrypted at rest, never exceed platform rights | ✅ | Azure DevOps `.default` delegated scope; tokens in SQLite encrypted via Data Protection; pushes with the user's token so the platform enforces rights (R3, R4) |
| IV | Justified, permissive deps; lockfiles; offline builds; minimal base image | ✅ | Dependency table below; `packages.lock.json` + npm lockfile; chiseled base; libgit2 linking exception listed in `SECURITY.md` |
| V | Git is the source of truth; commits attributed; conflicts surfaced; non-content data separate; single replica; single artifact; YAGNI | ✅ | Bare mirrors + push per save (R5); discussions in SQLite only; per-space lock relies on single replica |
| Sec | Env-var config, secrets from env/files, health endpoints, stdout logs, strict CSP, server-side Markdown | ✅ | [configuration.md](contracts/configuration.md), [openapi.yaml](contracts/openapi.yaml), R7, R9 |
| Stack | .NET LTS + ASP.NET Core; React + TS + Vite embedded; git + SQLite; chiseled image; WCAG 2.1 AA; target browsers | ✅ | R1, R8, R9; automated a11y checks in e2e (tool TBD in tasks: axe-core is MPL-2.0, which the build-tooling rule does not list as permissive — needs a decision) |
| QG | Tests for rendering/sanitization, auth on write paths, conflict handling, storage | ✅ | See test layout below |

**Shipped dependency justification (Principle IV)**

| Dependency | License | Why the standard library is insufficient |
|------------|---------|------------------------------------------|
| LibGit2Sharp + libgit2 | MIT / GPLv2 + linking exception | No git implementation in .NET |
| Markdig | BSD-2 | No Markdown parser in .NET |
| HtmlSanitizer (+ AngleSharp) | MIT | Safe HTML allow-listing; AngleSharp also yields DOM-identical text for anchors |
| Microsoft.Identity.Web | MIT | OIDC + on-behalf token acquisition and caching for Entra |
| EF Core SQLite | MIT | Schema migrations for the app database |
| diff-match-patch (vendored) | Apache-2.0 | Fuzzy text matching for re-anchoring |
| React, React DOM, React Router | MIT | Mandated UI framework + routing |
| TanStack Query | MIT | Server-state caching/invalidation; avoids hand-written cache logic |
| CodeMirror 6 + @codemirror/merge | MIT | Accessible code editor and diff/merge view |

**Post-design re-check (after Phase 1)**: ✅ No violations. Contracts expose no endpoint
that fetches arbitrary URLs; `/files` serves only repository content with safe headers;
`404` for unreadable spaces avoids disclosing repositories.

## Project Structure

### Documentation (this feature)

```text
specs/001-git-backed-team-wiki/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── openapi.yaml     # HTTP API between UI and server
│   └── configuration.md # Configuration, process and deployment interface
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
Copernica.slnx
Directory.Build.props            # nullable, warnings-as-errors, lock files
src/
├── Copernica/                   # ASP.NET Core host — the single deployable
│   ├── Program.cs
│   ├── Spaces/                  # config, mirrors, sync BackgroundService, status
│   ├── Git/                     # LibGit2Sharp wrapper: read tree/blob, history, save + merge
│   ├── Hosting/                 # IHostingProvider; AzureDevOps/, Git/
│   ├── Auth/                    # EntraId, Oidc, Local modes; token store; permission cache
│   ├── Rendering/               # Markdig pipeline, link rewriting, sanitizer, plain text
│   ├── Discussions/             # entities, anchoring, endpoints
│   ├── Data/                    # EF Core DbContext + migrations
│   ├── Api/                     # minimal API endpoint groups per contracts/openapi.yaml
│   └── Web/                     # static file serving of embedded SPA, CSP headers
└── web/                         # React + TypeScript + Vite
    ├── src/
    │   ├── api/                 # typed client generated from openapi.yaml
    │   ├── pages/               # SpaceList, PageView, PageEdit, History, Conflict
    │   ├── components/          # Tree, Editor, DiffView, DiscussionPanel, Highlights
    │   └── main.tsx
    └── package.json
tests/
├── Copernica.Tests/             # unit: rendering, sanitization, anchoring, merge, permissions
├── Copernica.IntegrationTests/  # HTTP + temp bare "remote" repos + fake hosting provider
└── e2e/                         # Playwright scenarios from quickstart.md (+ a11y checks)
deploy/
├── Dockerfile                   # multi-stage: node build → dotnet publish → chiseled
├── kubernetes/                  # Deployment (1 replica), PVC, Service, Ingress example, Secret example
└── compose.yaml
SECURITY.md
```

**Structure Decision**: One backend project (feature folders) plus one frontend package;
the backend embeds the frontend build so the release is one executable / one image
(Principle V). Splitting backend into several projects is deferred until a second
consumer of the domain code exists (YAGNI). Test projects are separate so unit tests stay
fast and integration tests can own temp repositories.

## Delivery increments

Each increment maps to a spec user story and is independently demonstrable.

1. **Foundation + US1 (P1)**: configuration, `Local` auth + plain `Git` spaces,
   mirrors + sync, tree, rendering/sanitization, files, SPA shell, container + manifests.
2. **Azure DevOps Services**: Entra sign-in, token store, permission checks (US1 access
   scenarios), sync identity.
3. **US2 (P2)**: editor with preview, save/create/delete with user-token push, history,
   diff.
4. **US3 (P3)**: base tracking, three-way merge, conflict view.
5. **US4 (P4)**: discussions, anchoring + re-anchoring, highlights, resolve/reopen.
6. **Azure DevOps Server**: generic OIDC sign-in + per-user PAT.

## Complexity Tracking

No constitution violations to justify.
