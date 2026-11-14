# Roadmap

A working plan, not a commitment. Each item becomes a feature specification under `specs/`
when work on it starts. Done features are listed in the README.

## Next

### 008 – Helm chart (implemented)

Specified in [specs/008-helm-chart](../specs/008-helm-chart/spec.md). Replaces the
kustomize manifests in `deploy/kubernetes`; `helm template` remains the path for deployers
who do not use Helm.

- Settings in `values.yaml` grouped by meaning (spaces as a list of entries) instead of
  indexed environment variables; credentials only as Secret references, or generated when
  the wiki owns them and nothing is given.
- Extension points for unforeseen needs: image registry and pull secrets, extra
  labels/annotations, volumes, sidecars and manifests, and a free-form application-settings
  section.
- Validation at install time (also used by 011).
- Safe defaults: Pod Security Standard `restricted`, a single replica (no autoscaling),
  persistent volume, ingress off by default.

### 009 – Links to headings (implemented)

Specified in [specs/009-heading-links](../specs/009-heading-links/spec.md).

- A copy-link button on H1–H3, usable with the keyboard and screen readers.
- Section links open at the heading on first load, in-app navigation, Back/Forward and in
  earlier versions; links in the Azure DevOps Wiki form are accepted.
- The visual editor's link dialog can target a section.
- Ids in user content are prefixed with `user-content-`; section addresses are unchanged.

Left for later: Azure DevOps `[[_TOC_]]` as a generated table of contents, and updating
links when a heading is renamed.

### 010 – Page front matter (implemented)

Specified in [specs/010-page-front-matter](../specs/010-page-front-matter/spec.md).

- The leading YAML block of a page is no longer rendered as text; it is parsed on the
  server with bounded resources (YamlDotNet, event parser only).
- `title` names the page; `description`, `tags`, `owner`/`authors` and a `status` banner
  are shown above the content; other fields are under a collapsed Properties section.
- Renaming a page rewrites only its `title` value; both editors keep the block byte for
  byte, and the visual editor shows it as a read-only card.

Left for later: browsing pages by tag, page order from `order`/`weight`/`sidebar_position`,
using `aliases` for links, and TOML (`+++`) front matter.

### 011 – Admin onboarding (setup CLI)

Subcommands of the existing executable (like `hash-password`), not a separate tool, to keep
one artifact per platform.

- `copernica setup`: interactive wizard (authentication mode, spaces, Azure DevOps / OIDC,
  public URL) that writes Helm values and a secret manifest; a non-interactive mode with
  flags. Docker Compose and standalone binary targets may follow.
- `copernica doctor`: validates an existing configuration (reusing
  `CopernicaOptionsValidator`) and optionally checks the configured OIDC and repository
  endpoints. It connects only to endpoints the deployer configured.

Depends on 008: the wizard writes values for `deploy/helm/copernica/values.schema.json`
(credentials as Secret references, spaces as a list).

## Before a wider rollout

- Validate against a real Azure DevOps organization (Services with Entra ID, and Server):
  permissions, branch policies, pushes with user tokens.
- Load test against 001 SC-008 (50 concurrent users, 20 spaces of 5,000 pages).
- Versioned releases, backup and restore of the data volume, database migrations between
  versions.

## Later candidates

- **Full-text search** on SQLite FTS5 (derived index, rebuildable from repositories).
- **Backlinks** and a "recent changes" view per space.
- **@mentions, watching pages and in-app notifications.** Email notifications would need a
  constitution amendment: SMTP is an outbound connection that Principle II does not allow
  today.
- **Review branches and pull requests** instead of committing directly to the space branch.
- **Non-image attachments** and **export to PDF / print layout**.
- **More git platforms:** GitLab, Gitea, GitHub.
- **End-user onboarding** (first-run content and hints in an empty space).

## Not planned

Real-time collaborative editing, multiple replicas, a manual light/dark switch, moving
pages between spaces.
