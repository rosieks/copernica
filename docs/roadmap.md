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
- Validation at install time (also used by 010).
- Safe defaults: Pod Security Standard `restricted`, a single replica (no autoscaling),
  persistent volume, ingress off by default.

### 009 – Links to headings

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

### 010 – Admin onboarding (setup CLI)

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
