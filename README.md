# Copernica

A self-hosted team wiki that stores pages as Markdown in git repositories and runs entirely
inside your organization.

> **Status:** early design phase. The project is developed spec-first with
> [Spec Kit](https://github.com/github/spec-kit); there is no runnable code yet.

## Why

Teams need a place to share knowledge, but adopting a SaaS wiki (or a heavyweight
self-hosted one) often means external data processing, vendor reviews and a long approval
process. Copernica aims to be a wiki a team can deploy on infrastructure it already
controls and start using right away, because its footprint is small, hardened and plainly
documented.

## Goals

- **Shared team wiki** – multi-user instance with authentication; also runs on a single
  workstation for evaluation.
- **Git as the source of truth** – pages are Markdown files in git repositories, edits
  become commits attributed to their authors, and one deployment can serve multiple
  repositories. Discussions and other non-content data are stored separately.
- **Self-hosted, no egress** – no SaaS dependencies, no telemetry, no CDN; all assets are
  bundled. Runs as a single executable, in Docker, or on Kubernetes.
- **Secure by default** – non-root container compatible with the Pod Security Standard
  `restricted`, strict Content Security Policy, server-side Markdown sanitization,
  anonymous access off by default.
- **Few, permissively licensed dependencies** – offline/air-gapped builds supported.

The full set of rules lives in the project constitution:
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Planned technology stack

| Area      | Choice                                                        |
|-----------|---------------------------------------------------------------|
| Backend   | C# / ASP.NET Core on the current .NET LTS                     |
| Frontend  | React + TypeScript, built with Vite, served by the backend    |
| Content   | Markdown in git repositories                                  |
| App data  | SQLite                                                        |
| Packaging | Self-contained single-file executable, chiseled container image |

## Contributing

Work follows the Spec Kit flow:

```text
/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement
```

All project artifacts (code, specs, docs, commit messages) are written in English.
Every plan must pass the Constitution Check before implementation.

## License

To be decided.
