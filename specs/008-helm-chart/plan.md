# Implementation Plan: Helm Chart for Kubernetes Deployments

**Branch**: `008-helm-chart` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-helm-chart/spec.md`

## Summary

A Helm chart at `deploy/helm/copernica/` replaces the kustomize manifests in
`deploy/kubernetes/`.

1. **Values organized by meaning.** `wiki.*` holds the application settings in their
   real hierarchy: authentication per mode, Azure DevOps, attachments, and spaces as a list
   of entries. The chart renders them into one JSON configuration document in a ConfigMap,
   which the application loads through a new `COPERNICA_CONFIG_FILE` variable
   ([R1](research.md#r1-how-settings-reach-the-application)).
2. **Credentials only as Secret references.** Each reference is mounted through one
   projected volume and wired to the existing `<Setting>_FILE` keys, so no credential value
   is ever rendered outside a Secret
   ([R2](research.md#r2-credentials-secret-references)). The one exception is the initial
   local account: when the deployer gives none, the chart generates its password once
   into its own Secret ([R3](research.md#r3-generated-credential-initial-local-account)).
   For that, the application accepts a local-account `Password` (from a file) in addition
   to `PasswordHash`.
3. **Validation before anything is deployed.** `values.schema.json` makes modeled groups
   strict, so typos and plain-string credentials are rejected. Template checks cover
   duplicate identifiers, `replicaCount`, the cache lifetime limit, and conflicts between
   the free-form section and modeled settings
   ([R4](research.md#r4-validation-schema-plus-template-checks),
   [R5](research.md#r5-free-form-application-settings-and-conflicts)).
4. **Room for the unforeseen.**
   - Kubernetes pass-through settings: image registry and pull secrets, labels and
     annotations, scheduling, security context additions.
   - Pod additions: extra env and envFrom, volumes, mounts, init containers, sidecars.
   - `extraManifests`.
   - `wiki.extraSettings`, a free-form part of the application configuration, for
     settings the chart does not model yet (for example a future database).
5. **Safe lifecycle.**
   - `Recreate` with one replica.
   - A checksum annotation restarts the pod on any setting or reference change.
   - The PVC and the generated Secret are kept on uninstall
     ([R6](research.md#r6-restart-on-change-update-strategy-uninstall)).
6. **Verification in CI.** A new `helm` job runs `scripts/test-helm.ps1`: lint, render
   every example, kubeconform, the invalid-values cases, and a credential-leak scan. It
   then installs and upgrades the chart in kind under an enforcing `restricted` namespace
   ([R9](research.md#r9-verification-tooling-build-only-constitution-iv)).

There are no new runtime dependencies and no new outbound connections. Two small,
additive application changes are described in
[contracts/application.md](contracts/application.md).

## Technical Context

**Language/Version**:
- Helm 3 chart (Go templates, JSON Schema draft-07 for `values.schema.json`).
- C# / .NET 10 for the two application changes.
- PowerShell 7 for the test script.

**Primary Dependencies**:
- None shipped. The chart has no chart dependencies.
- Build and test only, pinned: Helm 3.12+, kubeconform, kind (all Apache-2.0).

**Storage**: Unchanged. One PVC mounted at `/data` holds the SQLite database, git mirrors
and data-protection keys. A ConfigMap holds the configuration document. Credentials are in
the deployer's Secrets, plus the chart-generated initial-user Secret.

**Testing**:
- `scripts/test-helm.ps1`: render, kubeconform, invalid-values cases, credential-leak scan,
  and install and upgrade in kind.
- xUnit unit tests for the configuration-file loading and the `Password` handling, in the
  existing `tests/Copernica.Tests`.

**Target Platform**: Kubernetes 1.27+ with Pod Security admission, and Helm 3.12+
([R10](research.md#r10-kubernetes-version-support)). The image is unchanged: linux
amd64/arm64, chiseled.

**Project Type**: Deployment packaging for the existing web service, plus small
web-service changes.

**Performance Goals**:
- Install to Ready in under 2 minutes on an empty cluster with a local image.
- Rendering with 100 spaces stays well under the 1 MiB ConfigMap limit (about 300 bytes per
  space).

**Constraints**:
- Pod Security `restricted` with defaults and with every example.
- Read-only root filesystem.
- No credential outside Secrets.
- Installs offline from the directory or a packaged archive.
- Single replica.

**Scale/Scope**:
- One chart, about 12 templates.
- A schema covering every 001 and 003 setting.
- 4 example values files and about 12 invalid-values cases.
- 2 application changes.
- Documentation updates: README, SECURITY.md and the 001 configuration contract.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. English | Chart, comments, messages, docs and spec artifacts are in English. | ✅ |
| II. Self-hosted | The constitution requires "a container image and example Kubernetes manifests (or a Helm chart)", and the chart delivers it. No chart dependencies are pulled from public repositories. All templates are bundled. No new outbound connections. Images come from a registry the deployer chooses. | ✅ |
| III. Low-friction adoption | Defaults: no ingress, `wiki.auth.mode` required (the chart refuses to install without it), anonymous read off (unchanged). Non-root UID 1654, `drop: [ALL]`, read-only root FS, `seccompProfile: RuntimeDefault`, no service-account token. Verified against `restricted` admission in CI. Secrets are mounted as files and never in ConfigMaps. NOTES and README state ports, files and outbound connections. | ✅ |
| IV. Minimal, auditable dependencies | No runtime dependency added. Build-only tools (Helm, kubeconform, kind) are Apache-2.0 and pinned by version in CI. The chart builds and installs offline. | ✅ |
| V. Git-backed, simplicity | Content stays in git. The configuration document holds only settings, never content. Single replica enforced (`replicaCount` must be 1, `Recreate`). One chart, no subcharts, no library chart. | ✅ |
| Security & deployment constraints | Configuration via environment variables still works and still overrides the file. Secrets come from mounted files (`_FILE`). Liveness and readiness probes are kept, plus a startup probe for long first clones. Logs go to stdout as before. | ✅ |

**Post-design re-check**: still passes. The two application changes add no ports,
endpoints or egress. `COPERNICA_CONFIG_FILE` reads one file only when the variable is set,
and `SECURITY.md` "Files" says so. The plain `Password` is read from a mounted file and
hashed in memory. It is never logged or persisted. There are no Complexity Tracking
entries.

## Project Structure

### Documentation (this feature)

```text
specs/008-helm-chart/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── values.md          # values reference, rendered resources, mounted paths, messages
│   └── application.md     # COPERNICA_CONFIG_FILE and local Password
├── checklists/
│   └── requirements.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
deploy/
├── Dockerfile                          # unchanged
├── compose.yaml                        # unchanged
├── kubernetes/                         # DELETED (replaced by the chart)
└── helm/copernica/
    ├── Chart.yaml                      # version 0.1.0, appVersion 0.1.0, no dependencies
    ├── values.yaml                     # documented defaults (contracts/values.md)
    ├── values.schema.json              # strict modeled groups, SecretReference, if/then per mode
    ├── README.md                       # values reference generated from values.yaml comments
    ├── examples/
    │   ├── local.yaml
    │   ├── entra-id-azure-devops.yaml
    │   ├── oidc-azure-devops-server.yaml
    │   └── extensions.yaml
    └── templates/
        ├── _helpers.tpl                # names, labels, image, publicBaseUrl derivation
        ├── _config.tpl                 # builds the configuration document from wiki.*
        ├── _credentials.tpl            # collects SecretReferences → projected sources + _FILE keys
        ├── _validate.tpl               # duplicate ids, replicaCount, TTL, extraSettings conflicts
        ├── configmap.yaml
        ├── deployment.yaml
        ├── service.yaml
        ├── ingress.yaml
        ├── pvc.yaml
        ├── serviceaccount.yaml
        ├── secret-initial-user.yaml    # lookup + keep
        ├── extra-manifests.yaml
        └── NOTES.txt

src/Copernica/
├── Program.cs                          # insert COPERNICA_CONFIG_FILE source before env vars
├── Configuration/
│   ├── ConfigFileConfigurationExtensions.cs   # new: AddCopernicaConfigFile()
│   └── CopernicaOptions.cs             # LocalUserOptions.Password
└── Auth/Local/
    └── LocalAuthentication.cs          # hash Password at startup (PostConfigure) + validation

tests/
├── Copernica.Tests/Configuration/      # config file precedence, _FILE in file, Password rules
└── helm/
    └── invalid/                        # one mistake per file, "# expect: <message>" header

scripts/
└── test-helm.ps1                       # render, kubeconform, invalid cases, leak scan, kind install/upgrade

.github/workflows/ci.yml                # new "helm" job
README.md                               # Kubernetes section → Helm; migration from kustomize
SECURITY.md                             # Container section points at the chart; config file line
specs/001-git-backed-team-wiki/contracts/configuration.md   # COPERNICA_CONFIG_FILE, Password
docs/roadmap.md                         # mark 008 as in progress / done
```

**Structure Decision**: The chart lives under `deploy/`, next to the Dockerfile and
Compose file, as one self-contained chart. The application changes stay in the existing
`Configuration` and `Auth/Local` areas. Chart tests are a script plus data files, so the
.NET test projects do not depend on Helm.

## Complexity Tracking

No constitution violations to justify.
