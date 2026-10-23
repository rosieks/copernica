# Research: Helm Chart for Kubernetes Deployments

Decisions for [plan.md](plan.md). Each entry: decision, rationale, alternatives.

## R1. How settings reach the application

**Decision**: The chart renders the modeled application settings and the free-form section
into **one JSON configuration document** in a ConfigMap. The ConfigMap is mounted
read-only at `/etc/copernica/copernica.json`. A new environment variable
`COPERNICA_CONFIG_FILE` tells the application to load that file. The application adds the
file as an optional JSON configuration source **before** the environment-variable source,
so `extraEnv` still overrides it. That keeps the usual .NET order: files, then
environment, then command line.

**Rationale**:
- The JSON document keeps the hierarchy the user asked for. Lists of spaces are JSON
  arrays, not `__0__` keys.
- The configuration file is easy to inspect (`kubectl get cm`) and is reviewable in
  `helm template` output.
- The free-form section (FR-013) becomes a deep merge into the same document, at the same
  place in the hierarchy as the application's own configuration.

**Finding**: the 001 configuration contract says settings can be given "in
`copernica.json` in the data directory", but `Program.cs` never loads such a file. Today
only `appsettings*.json` from `/app`, environment variables and the command line are
read. This feature corrects the contract: the configuration file is the one named by
`COPERNICA_CONFIG_FILE`, and it is never in the data directory.

**Alternatives considered**:
- *Environment variables generated from values* (`Copernica__Spaces__0__Id`). Rejected:
  it renders the same flat structure the user wants to leave behind, makes conflict
  detection with the free-form section awkward, and fills `kubectl describe` with noise.
- *Mount the file over `/app/appsettings.Production.json` with `subPath`*. Rejected: it
  ties the chart to the hosting environment name, and it silently stops working when a
  deployer sets `ASPNETCORE_ENVIRONMENT`.
- *Load `<DataDirectory>/copernica.json` as the contract says*. Rejected: the data
  directory is a persistent volume, and the chart cannot place a file there without an
  init container writing to the volume.

## R2. Credentials: Secret references

**Decision**: Every modeled credential is a **Secret reference** object
`{ secretName, key }`. The chart mounts all referenced keys through one `projected`
volume at `/var/run/secrets/copernica/`. Each key gets a fixed logical path, for example
`auth/entra-id/client-secret` or `spaces/<id>/token`. The configuration document then sets
the existing `<Setting>_FILE` keys to those paths, for example
`Copernica:Auth:EntraId:ClientSecret_FILE`. The application already resolves `_FILE`
keys (`FileSecretsConfigurationExtensions`).

**Rationale**:
- The configuration document holds only file paths. No credential value is ever in a
  ConfigMap, annotation or label (FR-007, SC-006).
- Secrets as files do not show up in the process environment or in
  `kubectl describe pod`.
- It reuses the `_FILE` mechanism that 001 introduced for exactly this purpose. The
  existing Secret keys stay readable by the deployer's own tooling (External Secrets,
  Sealed Secrets, SOPS), which only needs to produce an ordinary Secret.
- A missing Secret leaves the pod in `ContainerCreating`, with an event that names the
  Secret (spec edge case). Projected volumes are allowed by the `restricted` standard.

**Plain values rejected (FR-008)**: in `values.schema.json`, a modeled credential field
has type `object` with required `secretName` and `key`. A string such as
`clientSecret: abc` fails schema validation at that path. If the free-form section sets a
credential the chart models, that is a conflict under R5, and installation fails.

**Alternatives considered**:
- *`env.valueFrom.secretKeyRef`*. Rejected: the values end up in the environment, and the
  list of variables would again be flat and indexed.
- *A single `existingSecret` holding every key as environment variables* (today's
  manifest). Rejected: this is the flat format again, and it mixes secrets with ordinary
  settings.

## R3. Generated credential: initial local account

**Decision**:
- When `auth.mode` is `local` and `auth.local.users` is empty, the chart creates a Secret
  `<fullname>-initial-user` with a key `password`. The value comes from `randAlphaNum 24`.
- It also configures one account (default name `admin`, configurable as
  `auth.local.initialUser.name`) whose new `Password_FILE` setting points at that key.
- The Secret is created only if it does not exist yet. On upgrade the template reads the
  existing Secret with `lookup` and reuses its value. The Secret carries the annotation
  `helm.sh/resource-policy: keep`, so uninstalling and reinstalling keeps the password.
- `NOTES.txt` shows the `kubectl get secret … | base64 -d` command for reading the
  password.

**Application change**: `LocalUserOptions` gets `Password`, a plain password intended to
be supplied through `Password_FILE`.
- At startup, a user with `Password` and no `PasswordHash` is hashed once in memory with
  the same hasher as `hash-password`. Login verification is unchanged.
- The validator rejects a user that has both settings or neither.

**Rationale**: The application's hash format (ASP.NET Core Identity v3, PBKDF2) cannot be
computed in Helm templates. Helm only offers bcrypt through `htpasswd`. The image is
chiseled and has no shell, so an init container cannot pipe a file into
`copernica hash-password`. Accepting a password from a file is the smallest change, and it
removes the need for an init container and a shared `emptyDir`.

**Known limitation (documented)**: `lookup` returns nothing under `helm template` and in
GitOps tools that render without cluster access (for example Argo CD). There, the
generated value changes on every render. Deployers who use those tools set
`auth.local.users` with their own Secret reference. This follows the clarified rule, and
the values reference says so next to the setting.

**Alternatives considered**:
- *Init container running `hash-password --input/--output`*. Rejected: it needs CLI
  changes as well as an init container, an `emptyDir` and more pod surface, so it is
  larger than the `Password` setting.
- *The application generates the password on first start and logs it*. Rejected: the
  password would end up in log storage, and it contradicts the clarification (the chart
  generates it and stores it in a Secret).
- *Supporting bcrypt hashes in the application*. Rejected: it adds a second hash format
  and a dependency only to suit a template function.

## R4. Validation: schema plus template checks

**Decision**: Validation has two layers, and both run on `install`, `upgrade`, `template`
and `lint`.
1. **`values.schema.json`** (JSON Schema draft-07, built into Helm 3). It covers types,
   enumerations, required fields per authentication mode (`if/then`) and Secret-reference
   shape. Modeled groups use `additionalProperties: false`, so typos are reported with
   their path. Free-form groups (`wiki.extraSettings`, `extraManifests`, Kubernetes
   pass-through objects such as `affinity`, `resources` and `extraVolumes`) are open.
2. **Template checks** (`templates/_validate.tpl`, `fail`), for rules JSON Schema cannot
   express with a clear message:
   - duplicate space identifiers;
   - `replicaCount` other than 1, with the explanation;
   - `permissionCacheTtl` above `00:05:00`;
   - free-form conflicts (R5);
   - reserved settings (R5).

**Rationale**: Helm reports schema errors with the value path, which meets FR-009. Template
checks cover cross-field rules and print messages in the project's own words.

**Alternatives considered**:
- *Validation only in the application at startup*. Rejected: it fails after resources are
  created, which is exactly what User Story 3 wants to avoid. Application validation stays
  as a second line (User Story 3, scenario 4).
- *Schema with `additionalProperties: false` at every level, including Kubernetes
  objects*. Rejected: it would require copying Kubernetes schemas into the chart and
  would break with each Kubernetes release.

## R5. Free-form application settings and conflicts

**Decision**:
- `wiki.extraSettings` is an object relative to the **root** of the application
  configuration, so it can also set `Logging`. Example:
  `{ Copernica: { MaxRenderBytes: 2097152 }, Logging: { LogLevel: { Default: Warning } } }`.
- The template flattens both the modeled document and `extraSettings` into leaf paths,
  compared **case-insensitively** because .NET configuration keys are case-insensitive. A
  path present in both is a conflict, and the error names both places.
- Reserved paths can never be set from `extraSettings`: `Copernica:DataDirectory`,
  `Copernica:Urls`, and anything under `Copernica:Auth` or `Copernica:Spaces` when the
  chart models that part. After the checks, `extraSettings` is deep-merged into the
  document.
- A prefix overlap is also a conflict, so `extraSettings` cannot replace a modeled object
  or list as a whole. For example `Copernica:Spaces` given as a whole while the chart
  models spaces.

**Rationale**: Nothing is overridden silently (FR-014), and a new application setting
needs no chart release (FR-013, SC-008).

**Alternatives considered**: *Free-form wins* or *modeled wins*. Rejected: either way an
override is silent, which the spec rules out.

## R6. Restart on change, update strategy, uninstall

**Decision**:
- The pod template carries the annotation `checksum/config`. It holds the SHA-256 of the
  rendered configuration document plus the list of projected Secret sources (name, key,
  path), so a change to any setting or Secret reference restarts the pod (FR-016).
- The Deployment uses `strategy: Recreate`, `replicas: 1` and
  `revisionHistoryLimit: 3`.
- The created PVC carries `helm.sh/resource-policy: keep` when
  `persistence.keepOnUninstall` is true, which is the default (FR-017).
- With `persistence.existingClaim`, the chart creates no claim.

**Rationale**: These are the standard Helm patterns. `Recreate` guarantees that only one
process opens the SQLite database and the git mirrors (Constitution V).

**Not covered**: a change to the *contents* of a deployer's Secret does not restart the
pod, because Helm cannot see it. The values reference documents
`kubectl rollout restart`. The spec only requires restarts for Secret *references*.

## R7. Image and air-gapped installs

**Decision**:
- `image.registry`, `image.repository` (default `copernica`), `image.tag` (default
  `.Chart.AppVersion`), `image.digest` (wins over the tag when set), `image.pullPolicy`
  and top-level `imagePullSecrets`.
- The chart has no dependencies (`Chart.yaml` lists none) and no library chart. It can be
  installed from the directory or from a `helm package` archive without network access
  (FR-021).
- Chart `version` starts at `0.1.0`, and `appVersion` at `0.1.0`. The project has no
  application version yet. Release versioning belongs to the roadmap's release work.

## R8. Location, and replacing kustomize

**Decision**:
- The chart lives at `deploy/helm/copernica/`. `deploy/kubernetes/` is deleted.
- Example values files live in `deploy/helm/copernica/examples/`:
  - `local.yaml`;
  - `entra-id-azure-devops.yaml`;
  - `oidc-azure-devops-server.yaml`;
  - `extensions.yaml`, which exercises User Story 4 and 5.
- Migration: the kustomize claim was named `copernica-data`, so migrating means
  `persistence.existingClaim: copernica-data`. The kustomize Deployment, Service and
  Secret are deleted first. The steps are in README and quickstart.
- Deployers who apply plain manifests use
  `helm template copernica deploy/helm/copernica -f values.yaml`. Under `helm template`,
  `lookup` cannot see the cluster, so the generated password would change on every render
  (R3). The docs therefore recommend `auth.local.users` with a Secret reference for that
  path.

## R9. Verification tooling (build-only, Constitution IV)

**Decision**:
- **Helm 3** (Apache-2.0), pinned version: `lint`, `template` and the schema.
- **kubeconform** (Apache-2.0), pinned version with checksum: validates rendered
  manifests against the Kubernetes schemas with `-strict`.
- **kind** (Apache-2.0) through `helm/kind-action`, with the Kubernetes version pinned. It
  provides a disposable cluster with a namespace labelled
  `pod-security.kubernetes.io/enforce=restricted`.
- **`scripts/test-helm.ps1`** (pwsh, like the existing scripts) runs:
  - render and kubeconform for the defaults and every example;
  - every case in `tests/helm/invalid/*.yaml`, each expected to fail with the message in
    its `# expect:` header comment;
  - a scan of rendered non-Secret resources for credential sentinels.
- **Pod Security check**: a server-side dry run of every example into the enforcing
  namespace, which fails on any `restricted` violation. A real install of
  `examples/local.yaml` must reach `Ready`, and an upgrade with a changed setting must
  replace the pod and keep the same PVC.

**Alternatives considered**:
- *helm-unittest plugin*. Not needed: rendering plus targeted checks in the script cover
  the requirements without another tool.
- *kube-score or Polaris for Pod Security*. Rejected: Kubernetes' own Pod Security
  admission in kind is the authoritative check.
- *chart-testing (`ct`)*. Rejected: it targets multi-chart repositories with version-bump
  policing that this repository does not need.

## R10. Kubernetes version support

**Decision**: Kubernetes **1.27+**. That covers the Pod Security admission `restricted`
standard (GA in 1.25), `networking.k8s.io/v1` Ingress, and `seccompProfile` in the
security context. Helm **3.12+**. CI pins one current kind image, and kubeconform
validates against both the oldest and newest supported versions.
