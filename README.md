# Copernica

A self-hosted team wiki that stores pages as Markdown in git repositories and runs entirely
inside your organization.

> **Status:** first feature implemented
> ([spec](specs/001-git-backed-team-wiki/spec.md),
> [validation](specs/001-git-backed-team-wiki/checklists/validation.md)).
> It has not been validated against a real Azure DevOps organization yet.

## What it does

- **Spaces from git repositories:** one deployment serves several repositories, or folders
  inside them, as spaces. Pages are plain Markdown files, and git is the source of truth.
- **Editing:** every save becomes one commit authored by you and pushed with your own
  credentials. History and diffs come from git.
- **Concurrent edits:** changes to different parts of a page are merged automatically.
  Overlapping changes show a side-by-side view so you can resolve them, and nothing is ever
  overwritten silently.
- **Discussions on fragments:** select text in a page and start a discussion. Discussions
  support replies, editing and resolving. They follow the text when the page changes and
  are stored in the wiki's database, never in your repositories.
- **Permissions from your git platform:** on Azure DevOps you see and edit exactly what your
  repository permissions allow (see [docs/azure-devops.md](docs/azure-devops.md)).
- **Self-hosted, no egress:** no SaaS, no telemetry, no CDN. It runs as a single executable,
  in Docker, or on Kubernetes under the Pod Security Standard `restricted`. See
  [SECURITY.md](SECURITY.md).

## Quick start (local evaluation)

Requirements: .NET 10 SDK, Node.js 22.

```bash
npm --prefix src/web ci && npm --prefix src/web run build
dotnet build src/Copernica

# create a password hash for a local account
echo secret | dotnet run --project src/Copernica --no-build -- hash-password

export Copernica__Auth__Mode=Local
export Copernica__Auth__Local__Users__0__Name=me
export Copernica__Auth__Local__Users__0__PasswordHash='<hash from above>'
# a space backed by an existing repository (bare, or a working copy on another branch)
export Copernica__Spaces__0__Id=docs
export Copernica__Spaces__0__RemoteUrl=/path/to/repo.git
# a space whose repository lives only in the wiki's data directory
export Copernica__Spaces__1__Id=sandbox

dotnet run --project src/Copernica --no-build
# open http://127.0.0.1:8080
```

## Docker

```bash
docker build -f deploy/Dockerfile -t copernica .
echo secret | docker run -i --rm copernica hash-password
docker run -p 127.0.0.1:8080:8080 --read-only --tmpfs /tmp -v copernica-data:/data \
  -e Copernica__Auth__Mode=Local \
  -e Copernica__Auth__Local__Users__0__Name=me \
  -e Copernica__Auth__Local__Users__0__PasswordHash='<hash>' \
  -e Copernica__Spaces__0__Id=sandbox \
  copernica
```

`deploy/compose.yaml` contains the same setup for Docker Compose.

## Kubernetes

```bash
kubectl apply -k deploy/kubernetes
```

The manifests define:

- a namespace enforcing the Pod Security Standard `restricted`;
- one replica with a persistent volume;
- a non-root, read-only container with probes.

Adapt `ingress.example.yaml` and create the `copernica` secret from `secret.example.yaml`.
All settings are listed in
[contracts/configuration.md](specs/001-git-backed-team-wiki/contracts/configuration.md).

## Release builds

`scripts/publish.ps1` produces self-contained single-file executables for `win-x64`,
`osx-arm64`, `linux-x64` and `linux-arm64`, and smoke-tests the one for the current machine.

## Development

| What | Command |
|------|---------|
| .NET unit + integration tests | `dotnet test --solution Copernica.slnx` |
| Web unit tests | `npm --prefix src/web test` |
| End-to-end (one browser per run) | `cd tests/e2e && npx playwright test --project=chromium` |
| License check | `pwsh scripts/check-licenses.ps1` |
| Load check (SC-002/SC-008) | `node tests/perf/run.mjs` |

**Stack:**

- Backend: C# / ASP.NET Core on .NET 10, LibGit2Sharp, Markdig, HtmlSanitizer, EF Core
  with SQLite.
- Frontend: React + TypeScript, Vite, CodeMirror 6.

**Workflow:** work follows the Spec Kit flow
(`/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement`).
All project artifacts are written in English. Every plan must pass the Constitution Check in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## License

To be decided.
