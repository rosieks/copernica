# Roadmap

A working plan, not a commitment. Each item becomes a feature specification under `specs/`
when work on it starts. Done features are listed in the README.

## Next

### 008 – Links to headings

Headings already get GitHub-style identifiers when rendered (`MarkdownRenderer`); what is
missing is everything the user sees:

- a "copy link to section" control next to each heading, usable with the keyboard and
  screen readers (002 rules);
- scrolling to `#anchor` on page load and on in-app navigation, including earlier versions
  of a page;
- choosing a section when inserting a link in the visual editor (extends the 005 page
  picker);
- possibly Azure DevOps `[[_TOC_]]` rendered as a table of contents (shown only as a
  placeholder in the visual editor today).

To check: the sanitizer keeps heading `id`s, duplicate headings get distinct anchors, and
anchors match Azure DevOps Wiki so links work in both places.

### 009 – Helm chart

Replaces the kustomize manifests in `deploy/kubernetes`; `helm template` remains the path
for deployers who do not use Helm.

- Spaces and other settings in `values.yaml`, rendered into a config file (ConfigMap)
  instead of indexed environment variables; secrets via `existingSecret`.
- `values.schema.json` so invalid values fail at install time (also used by 010).
- Safe defaults: Pod Security Standard `restricted`, a single replica (no autoscaling),
  persistent volume, ingress off by default.
- Offline / air-gapped use: overridable image registry, chart published as an OCI artifact
  to the organization's registry.
- CI: `helm lint`, `helm template` validated with kubeconform, optionally helm-unittest.

### 010 – Admin onboarding (setup CLI)

Subcommands of the existing executable (like `hash-password`), not a separate tool, to keep
one artifact per platform.

- `copernica setup`: interactive wizard (authentication mode, spaces, Azure DevOps / OIDC,
  public URL) that writes Helm values and a secret manifest; a non-interactive mode with
  flags. Docker Compose and standalone binary targets may follow.
- `copernica doctor`: validates an existing configuration (reusing
  `CopernicaOptionsValidator`) and optionally checks the configured OIDC and repository
  endpoints. It connects only to endpoints the deployer configured.

Depends on 009: the wizard produces values for the chart's schema.

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
