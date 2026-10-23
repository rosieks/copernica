---

description: "Task list for 008 Helm Chart for Kubernetes Deployments"
---

# Tasks: Helm Chart for Kubernetes Deployments

**Input**: Design documents from `specs/008-helm-chart/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/values.md](contracts/values.md),
[contracts/application.md](contracts/application.md), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution's Quality Gates require automated tests for
authentication and storage paths, and the application changes touch both: the
configuration source and local-account passwords. SC-004, SC-005 and SC-006 need
automated checks. Chart checks live in `scripts/test-helm.ps1` plus data files under
`tests/helm/`. Application checks are xUnit tests in `tests/Copernica.Tests`.

**Organization**: Tasks are grouped by user story in spec priority order: US1, US2 (P1),
US3, US4, US5 (P2), US6 (P3). The configuration-document pipeline and Secret-reference
projection are foundational, because every story renders through them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to

Conventions:
- the chart is `deploy/helm/copernica/`, shortened to `chart/` in descriptions only where
  the full path is given once in the same task;
- values keys are camelCase; configuration-document keys are the application's PascalCase
  ([data-model.md](data-model.md));
- every template error starts with `copernica: ` and names the values path, as in
  [contracts/values.md](contracts/values.md#error-messages-examples);
- each invalid-values case is one file in `tests/helm/invalid/` whose first line is
  `# expect: <substring of the error>`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Chart skeleton and test harness.

- [X] T001 Create `deploy/helm/copernica/Chart.yaml`: `apiVersion: v2`, `name: copernica`, `version: 0.1.0`, `appVersion: "0.1.0"`, `kubeVersion: ">=1.27.0-0"`, description, no `dependencies`. Also create `deploy/helm/copernica/.helmignore`, excluding `examples/` from packaging only if Helm requires it. Keep `examples/` in the package, because FR-021 requires the offline package to be self-contained.
- [X] T002 [P] Create `scripts/test-helm.ps1` (pwsh 7, `Set-StrictMode`, `$ErrorActionPreference='Stop'`). Parameters: `-RenderOnly`, `-KubeVersions` (default `1.27.0`, `1.31.0`), `-ImageTag` (default `dev`). Skeleton functions:
  - `Invoke-Render($valuesFiles)`: runs `helm template`, returns YAML text;
  - `Test-Kubeconform`: `kubeconform -strict -summary` per Kubernetes version;
  - `Test-InvalidCases`: loops `tests/helm/invalid/*.yaml`, expects a non-zero exit and that stderr contains the `# expect:` text;
  - `Test-NoCredentialLeak`: fails if the sentinel `CREDENTIAL-SENTINEL` appears in any rendered document whose `kind` is not `Secret`;
  - `Invoke-KindChecks`: install, upgrade and uninstall steps, filled by later tasks.

  Exit with a non-zero code on the first failure, printing the case name.
- [X] T003 [P] Create the `tests/helm/invalid/` and `tests/helm/valid/` directories, each with a `README.md` that explains the `# expect:` header convention and that `valid/` files must render, used for targeted assertions.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The application can read a configuration file. The chart can render a
configuration document, mount Secret references, and deploy a pod with the restricted
defaults. Every story builds on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Application: configuration file (contracts/application.md §1)

- [X] T004 [P] Write failing tests in `tests/Copernica.Tests/Configuration/ConfigFileConfigurationTests.cs`:
  - (a) with `COPERNICA_CONFIG_FILE` unset, configuration is unchanged;
  - (b) a JSON file with `{"Copernica":{"MaxRenderBytes":2048,"Spaces":[{"Id":"a"},{"Id":"b"}]}}` binds `CopernicaOptions.MaxRenderBytes == 2048` and two spaces;
  - (c) an environment variable `Copernica__MaxRenderBytes=4096` overrides the file (precedence: "`appsettings*.json` < **this file** < environment variables < command line");
  - (d) a `ClientSecret_FILE` key inside the file is resolved by `AddFileSecrets`;
  - (e) a missing file or invalid JSON throws an exception whose message contains the file path.
- [X] T005 Implement `src/Copernica/Configuration/ConfigFileConfigurationExtensions.cs` with `AddCopernicaConfigFile(this ConfigurationManager)`. It reads `COPERNICA_CONFIG_FILE`. When the variable is set, it inserts a non-optional `JsonConfigurationSource` into `configuration.Sources` immediately **before** the first `EnvironmentVariablesConfigurationSource`, or appends it if there is none. It wraps load failures in an `InvalidOperationException` that names the file. Make T004 pass.
- [X] T006 Call `builder.Configuration.AddCopernicaConfigFile()` in `src/Copernica/Program.cs` **before** `builder.Configuration.AddFileSecrets()`, so that `_FILE` keys from the file are resolved.

### Chart: names, labels, configuration document, credentials

- [X] T007 [P] Create `deploy/helm/copernica/templates/_helpers.tpl` with:
  - `copernica.name`, `copernica.fullname` (honouring `nameOverride` / `fullnameOverride`, truncated to 63);
  - `copernica.labels` (`app.kubernetes.io/{name,instance,version,managed-by}`, `helm.sh/chart`, plus `commonLabels`);
  - `copernica.selectorLabels` (`name` and `instance` only);
  - `copernica.image` (`registry/repository:tag`, `@digest` wins over the tag, tag defaults to `.Chart.AppVersion`);
  - `copernica.serviceAccountName`.
- [X] T008 [P] Create `deploy/helm/copernica/templates/_credentials.tpl`. Define `copernica.credentials`, which walks `wiki` and returns a dict (serialized with `toJson` / `fromJson`) of `{ projected: [ {secretName, key, path} ], files: { "<config path>_FILE": "/var/run/secrets/copernica/<path>" } }`. Use the fixed paths from [contracts/values.md](contracts/values.md#mounted-paths-in-the-container):
  - `auth/local/<i>/password-hash`;
  - `auth/entra-id/client-secret`;
  - `auth/oidc/client-secret`;
  - `azure-devops/client-secret`;
  - `azure-devops/pat`;
  - `spaces/<id>/token`.

  At this stage only the structure is needed; US2 adds the generated initial user.
- [X] T009 Create `deploy/helm/copernica/templates/_config.tpl` with `copernica.configDocument`. It builds the JSON document from `wiki.*` using the mapping tables in [data-model.md](data-model.md#wiki-application-settings):
  - camelCase to PascalCase keys;
  - enum values mapped (`entraId`→`EntraId`, `azureDevOps`→`AzureDevOps`, `servicePrincipal`→`ServicePrincipal`, `managedIdentity`→`ManagedIdentity`, `pat`→`Pat`, `none`→`None`, `local`→`Local`, `oidc`→`Oidc`, `git`→`Git`);
  - **unset optional fields omitted**;
  - spaces rendered as a JSON array in list order;
  - the `_FILE` entries from `copernica.credentials` merged at their paths;
  - `PublicBaseUrl` defaulted to `https://<ingress.hosts[0].host>` (or `http://` when `ingress.tls` is empty) when `ingress.enabled` and `wiki.publicBaseUrl` is empty.

  Output with `toPrettyJson`.
- [X] T010 [P] Create `deploy/helm/copernica/templates/configmap.yaml`: ConfigMap `<fullname>-config`, key `copernica.json` = `include "copernica.configDocument"`, chart labels.
- [X] T011 Create `deploy/helm/copernica/templates/deployment.yaml`:
  - `replicas: 1`, `strategy: Recreate`, `revisionHistoryLimit: 3`, selector from `copernica.selectorLabels`;
  - pod annotation `checksum/config` = `sha256sum` of the configuration document concatenated with `toJson` of the projected list (research R6);
  - `automountServiceAccountToken: {{ .Values.serviceAccount.automountToken }}`;
  - pod security context = the fixed defaults (`runAsNonRoot: true`, `runAsUser: 1654`, `runAsGroup: 1654`, `fsGroup: 1654`, `seccompProfile: {type: RuntimeDefault}`) merged with `podSecurityContext`;
  - container security context = `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: {drop: [ALL]}` merged with `securityContext`;
  - port `http` 8080;
  - env `COPERNICA_CONFIG_FILE=/etc/copernica/copernica.json`;
  - liveness `/health/live`, readiness `/health/ready`, startup `/health/live` with timings from `probes.*`;
  - `resources`;
  - mounts: `/data` (claim `<fullname>-data` or `persistence.existingClaim`), `/tmp` (`emptyDir`), `/etc/copernica` (the ConfigMap, read-only), and `/var/run/secrets/copernica` (a `projected` volume built from `copernica.credentials`, read-only, rendered only when the list is non-empty).
- [X] T012 [P] Create `deploy/helm/copernica/templates/service.yaml` (`service.type`, `service.port` → `targetPort: http`, labels, annotations) and `deploy/helm/copernica/templates/pvc.yaml`:
  - rendered only when `persistence.existingClaim` is empty;
  - `accessModes: [persistence.accessMode]`, `resources.requests.storage: persistence.size`;
  - `storageClassName` omitted when `""`, set to `""` when `"-"`;
  - annotation `helm.sh/resource-policy: keep` when `persistence.keepOnUninstall`.
- [X] T013 Create `deploy/helm/copernica/values.yaml` with every key and default from [contracts/values.md](contracts/values.md#defaults-abridged-valuesyaml), each with a `# --` comment giving its meaning and an example. State in the comment on `wiki.extraSettings` that it is "NOT for secrets".
- [X] T014 Create `deploy/helm/copernica/values.schema.json` (draft-07):
  - the top level and all modeled groups (`wiki` and below, except `extraSettings`; `image`; `serviceAccount`; `probes`; `service`; `ingress`; `persistence`) use `additionalProperties: false`;
  - pass-through objects (`resources`, `affinity`, `nodeSelector`, `podSecurityContext`, `securityContext`) are open `object`s;
  - free-form lists (`extraEnv`, `extraEnvFrom`, `extraVolumes`, `extraVolumeMounts`, `initContainers`, `sidecars`, `extraManifests`, `tolerations`, `topologySpreadConstraints`, `imagePullSecrets`) are `array`s of open items;
  - a `$defs/secretReference` = `{type: object, required: [secretName, key], additionalProperties: false, properties: {secretName: {type: string, pattern: DNS-1123 subdomain}, key: {type: string, minLength: 1}}}`, used (nullable) by every credential field;
  - `wiki.auth.mode` has `enum [local, entraId, oidc]`;
  - spaces have `provider: enum [git, azureDevOps]` and `required: [id]`.
- [X] T015 Create `deploy/helm/copernica/templates/_validate.tpl` with `copernica.validate`, included at the top of `configmap.yaml`. Implement the first rule, `wiki.auth.mode` empty → `fail "copernica: wiki.auth.mode is required (local, entraId or oidc). The container listens on all interfaces, and the wiki refuses to start without authentication."`. Later stories add more rules.
- [X] T016 Fill `Invoke-Render` and `Test-Kubeconform` in `scripts/test-helm.ps1`. Add the case "defaults with `--set wiki.auth.mode=local`" plus every file in `deploy/helm/copernica/examples/`, and run `helm lint` on each. Add the invalid case `tests/helm/invalid/01-no-auth-mode.yaml` (`# expect: wiki.auth.mode is required`, empty values).

**Checkpoint**: `pwsh scripts/test-helm.ps1 -RenderOnly` passes with the defaults, and the
application loads a configuration file.

---

## Phase 3: User Story 1 - Install a working wiki from a short values file (Priority: P1) 🎯 MVP

**Goal**: A short, hierarchical values file installs a single-replica wiki with persistent
storage that serves its spaces, under `restricted`.

**Independent Test**: Install `examples/local.yaml` (two spaces, local accounts referenced
from a Secret) into a kind namespace that enforces `restricted`. The pod becomes Ready,
both spaces are listed, and a page can be saved.

### Tests for User Story 1

- [X] T017 [P] [US1] Add `tests/helm/valid/us1-structure.yaml`: Entra ID, two Azure DevOps spaces, one with `folder: docs` and `attachments: { path: images }`, and `CREDENTIAL-SENTINEL` used only as a Secret *name*. In `scripts/test-helm.ps1`, assert on the rendered `copernica.json`:
  - `Copernica.Spaces[1].Folder == "docs"`;
  - `Copernica.Spaces[1].Attachments.Path == "images"`;
  - `Copernica.Auth.Mode == "EntraId"`;
  - no key matching `__\d+__` anywhere (SC-002, User Story 1 scenario 2);
  - unset settings such as `SyncInterval` are absent.
- [X] T018 [P] [US1] Add `tests/helm/valid/us1-ingress.yaml` (ingress on, host `wiki.example.internal`, TLS). Assert that `Copernica.PublicBaseUrl == "https://wiki.example.internal"`. Add a variant without TLS that gives `http://`, and one with an explicit `wiki.publicBaseUrl` that wins (User Story 1 scenario 4).

### Implementation for User Story 1

- [X] T019 [P] [US1] Create `deploy/helm/copernica/templates/ingress.yaml` (`networking.k8s.io/v1`, rendered only when `ingress.enabled`; `className`, labels, annotations, `hosts[].paths[]` → the service's `http` port, `tls`).
- [X] T020 [P] [US1] Create `deploy/helm/copernica/templates/serviceaccount.yaml` (only when `serviceAccount.create`; annotations; `automountServiceAccountToken` from `serviceAccount.automountToken`).
- [X] T021 [US1] Complete the space and general-setting mapping in `deploy/helm/copernica/templates/_config.tpl`:
  - `syncInterval`, `permissionCacheTtl`, `maxRenderBytes`, `fallbackEmailDomain`, `forwardedHeaders.knownProxies`;
  - `attachments.{path,maxBytes,maxPendingBytesPerUser}`;
  - each space's `id`, `displayName`, `provider`, `remoteUrl`, `branch`, `folder`, `attachments.path`, `credential.username`;
  - `auth.entraId.{instance,tenantId,clientId}`, `auth.oidc.{authority,clientId}`;
  - `azureDevOps.syncCredential.{type,tenantId,clientId,managedIdentityClientId}`, `azureDevOps.server.userPat`.

  Make T017 and T018 pass.
- [X] T022 [P] [US1] Create `deploy/helm/copernica/examples/local.yaml`:
  - `wiki.auth.mode: local`;
  - one user `alice` with `passwordHash: { secretName: wiki-local-users, key: alice }`;
  - two `git` spaces without `remoteUrl` (`handbook`, `sandbox`);
  - a comment showing the `kubectl create secret` command with a hash from `copernica hash-password`.
- [X] T023 [P] [US1] Create `deploy/helm/copernica/examples/entra-id-azure-devops.yaml` (Entra ID, `syncCredential.type: pat`, three Azure DevOps spaces, ingress with TLS) and `deploy/helm/copernica/examples/oidc-azure-devops-server.yaml` (OIDC, `server.userPat: true`, two spaces). All credentials are Secret references.
- [X] T024 [US1] Create `deploy/helm/copernica/templates/NOTES.txt`. It shows how to reach the wiki (port-forward, or the ingress URL), the public address in use, and a warning when `wiki.spaces` is empty: "No spaces configured; add entries under wiki.spaces" (FR-019, edge case "No spaces configured").
- [X] T025 [US1] Fill the install part of `Invoke-KindChecks` in `scripts/test-helm.ps1`:
  - label namespace `wiki` with `pod-security.kubernetes.io/enforce=restricted`;
  - create Secret `wiki-local-users` with a hash produced by `docker run --rm -i copernica:<tag> hash-password`;
  - `helm install` `examples/local.yaml` with `image.repository=copernica` and `image.tag=<tag>`;
  - `kubectl rollout status --timeout=180s`;
  - port-forward, then `GET /health/ready` returns 200 and `GET /api/spaces` (signed in as alice) lists `handbook` and `sandbox`.
- [X] T026 [US1] Add the Pod Security dry-run to `scripts/test-helm.ps1`: for the defaults and every example, run `helm template … | kubectl apply --dry-run=server -n wiki -f -` into the enforcing namespace, and fail on any `violate PodSecurity` warning (SC-005).

**Checkpoint**: The MVP. A deployer can install from an example and use the wiki.

---

## Phase 4: User Story 2 - Keep secrets out of the values file (Priority: P1)

**Goal**: Credentials are only Secret references. Missing required credentials are
rejected. The initial local account is generated when nothing is given, and stays stable
across upgrades.

**Independent Test**: Install with Secret references for the identity provider, the sync
credential and a space token. Sign-in and sync work, and no credential value appears in
any non-Secret resource. Install `local` mode without users: an `admin` account with a
generated password works, and the password is the same after an upgrade.

### Tests for User Story 2

- [X] T027 [P] [US2] Write failing tests in `tests/Copernica.Tests/Configuration/LocalPasswordTests.cs`:
  - (a) a user with `Password` (no hash) can be verified with that password via `LocalAuthentication.Verify`;
  - (b) after options are built, the user's `Password` is null and `PasswordHash` is set;
  - (c) a user with both `Password` and `PasswordHash` fails validation, with a message naming the user;
  - (d) a user with neither fails validation;
  - (e) `Password_FILE` resolves through `AddFileSecrets`.
- [X] T028 [P] [US2] Add invalid cases:
  - `tests/helm/invalid/10-plain-client-secret.yaml` (`wiki.auth.entraId.clientSecret: abc`; `# expect: Invalid type`);
  - `11-entra-missing-secret.yaml` (mode `entraId` without `clientSecret`; `# expect: clientSecret`);
  - `12-oidc-missing-authority.yaml` (`# expect: authority`);
  - `13-pat-missing.yaml` (`syncCredential.type: pat` without `pat`; `# expect: pat`);
  - `14-space-plain-token.yaml` (`credential.token: abc`; `# expect: Invalid type`).
- [X] T029 [P] [US2] Add `tests/helm/valid/us2-secrets.yaml`, with every credential field referencing Secret `CREDENTIAL-SENTINEL` under key `CREDENTIAL-SENTINEL-KEY`. In `scripts/test-helm.ps1`, assert:
  - each reference appears exactly once among the `projected` sources, at the path from contracts/values.md;
  - `copernica.json` contains only `_FILE` paths for credentials;
  - `Test-NoCredentialLeak` passes, since the sentinel may appear only in volume definitions, never in ConfigMap data (SC-006).

### Implementation for User Story 2

- [X] T030 [US2] Add `Password` to `LocalUserOptions` in `src/Copernica/Configuration/CopernicaOptions.cs`. In `src/Copernica/Auth/Local/LocalAuthentication.cs` (or its registration in `AuthenticationSetup.cs`), add:
  - an `IPostConfigureOptions<CopernicaOptions>` that hashes `Password` with `HashPassword` and clears it;
  - validation in `CopernicaOptionsValidator` (`src/Copernica/Configuration/CopernicaOptionsValidator.cs`) for `Auth.Mode == Local`: each user has exactly one of `Password` / `PasswordHash`, with the message `Copernica:Auth:Local:Users:<i> (<name>) must set exactly one of Password or PasswordHash.`

  Validation runs on the raw values, before the post-configure step clears `Password`. Make T027 pass.
- [X] T031 [US2] Extend `values.schema.json` with `if/then` rules:
  - `auth.mode=entraId` → `auth.entraId` requires `tenantId`, `clientId`, `clientSecret`;
  - `auth.mode=oidc` → `auth.oidc` requires `authority`, `clientId`, `clientSecret`;
  - `syncCredential.type=servicePrincipal` → requires `tenantId`, `clientId`, `clientSecret`;
  - `syncCredential.type=pat` → requires `pat`;
  - `auth.local.users[]` requires `name` and `passwordHash`.

  Make T028 pass.
- [X] T032 [US2] Create `deploy/helm/copernica/templates/secret-initial-user.yaml`. When `wiki.auth.mode == "local"` and `wiki.auth.local.users` is empty:
  - `lookup "v1" "Secret" .Release.Namespace "<fullname>-initial-user"`;
  - reuse `.data.password` if it exists, else `randAlphaNum 24 | b64enc`;
  - annotation `helm.sh/resource-policy: keep`.

  Extend `copernica.credentials` in `_credentials.tpl` and `copernica.configDocument` in `_config.tpl`, so that the case adds the projected path `auth/local/initial/password` and `Copernica.Auth.Local.Users[0] = { Name: <initialUser.name>, Password_FILE: … }` (research R3).
- [X] T033 [US2] In `deploy/helm/copernica/templates/NOTES.txt`, when the initial user is generated, print the user name and `kubectl get secret <fullname>-initial-user -n <ns> -o jsonpath='{.data.password}' | base64 -d`. Also print a note that under `helm template` or GitOps rendering the password changes on every render, so `auth.local.users` should be used there.
- [X] T034 [US2] Extend `Invoke-KindChecks` in `scripts/test-helm.ps1` with a second release that uses `local` mode without users:
  - read the generated password and sign in as `admin` via `POST /auth/login`;
  - `helm upgrade` with a changed `displayName`;
  - assert that the Secret's `password` is unchanged and that sign-in still works.

**Checkpoint**: US1 and US2 are complete. Production-shaped installs keep all credentials in
Secrets.

---

## Phase 5: User Story 3 - Catch mistakes before anything is deployed (Priority: P2)

**Goal**: Common mistakes fail at install or render time, with a message naming the
setting, and nothing is created.

**Independent Test**: `Test-InvalidCases` passes for at least ten common mistakes (SC-004).

### Tests for User Story 3

- [X] T035 [P] [US3] Add invalid cases:
  - `tests/helm/invalid/20-typo-in-space.yaml` (`brnach: main`; `# expect: brnach`);
  - `21-duplicate-space-id.yaml` (`# expect: duplicate id "handbook"`);
  - `22-replicas.yaml` (`replicaCount: 2`; `# expect: replicaCount must be 1`);
  - `23-ttl-too-long.yaml` (`permissionCacheTtl: "00:10:00"`; `# expect: exceeds the maximum of 00:05:00`);
  - `24-ttl-malformed.yaml` (`"10m"`; `# expect: permissionCacheTtl`);
  - `25-unknown-mode.yaml` (`mode: ldap`; `# expect: wiki.auth.mode`);
  - `26-unknown-provider.yaml` (`provider: github`; `# expect: provider`);
  - `27-wrong-type.yaml` (`maxRenderBytes: "big"`; `# expect: maxRenderBytes`);
  - `28-unknown-top-level.yaml` (`replicas: 1`; `# expect: replicas`);
  - `29-duplicate-local-user.yaml` (`# expect: duplicate name`).

### Implementation for User Story 3

- [X] T036 [US3] Add rules to `copernica.validate` in `deploy/helm/copernica/templates/_validate.tpl`:
  - duplicate `wiki.spaces[].id` → `copernica: wiki.spaces: duplicate id "<id>"`;
  - duplicate `wiki.auth.local.users[].name` → `copernica: wiki.auth.local.users: duplicate name "<name>"`;
  - `replicaCount != 1` → `copernica: replicaCount must be 1. The wiki keeps its data on one volume and serializes writes in one process.`;
  - `syncInterval` and `permissionCacheTtl` must match `^(\d+\.)?\d{1,2}:\d{2}:\d{2}$` → `copernica: wiki.<key> "<v>" is not a TimeSpan (hh:mm:ss)`;
  - `permissionCacheTtl` converted to seconds must be > 0 and ≤ 300 → `copernica: wiki.permissionCacheTtl "<v>" exceeds the maximum of 00:05:00`.
- [X] T037 [US3] Add `pattern` constraints for the TimeSpan fields, `minimum: 1` for byte sizes, and a `format`/`pattern` for `publicBaseUrl` and `oidc.authority` (`^https?://`) in `deploy/helm/copernica/values.schema.json`. Check that the error output names the path for each T035 case, and make T035 pass.

**Checkpoint**: SC-004 is met. Validation runs on `install`, `upgrade`, `template` and `lint`.

---

## Phase 6: User Story 4 - Adapt the deployment to the cluster's own conventions (Priority: P2)

**Goal**: Registry, pull secrets, metadata, scheduling, pod additions and extra manifests
can all be set through values, without forking the chart.

**Independent Test**: Render and install `examples/extensions.yaml`. Every addition appears
in the deployed resources, and the pod still passes `restricted`.

### Tests for User Story 4

- [X] T038 [P] [US4] Create `deploy/helm/copernica/examples/extensions.yaml`, which sets:
  - `image.registry: registry.example.internal`, `imagePullSecrets: [{name: regcred}]`;
  - `commonLabels`, `podLabels`, `podAnnotations`, `deploymentAnnotations`;
  - service, ingress and persistence labels and annotations;
  - `resources`, `nodeSelector`, `tolerations`, `affinity`, `topologySpreadConstraints`, `priorityClassName`;
  - `serviceAccount.create: true` with an annotation;
  - `extraEnv` (`TZ=Europe/Warsaw`), `extraEnvFrom` (a `configMapRef`);
  - `extraVolumes` / `extraVolumeMounts` (a ConfigMap CA bundle at `/etc/ssl/custom`, read-only);
  - one restricted-compliant `initContainers` entry and one `sidecars` entry;
  - `extraManifests` with a NetworkPolicy named `{{ include "copernica.fullname" . }}-ingress` (as a string, to exercise `tpl`);
  - `persistence.storageClass: fast`, `size: 20Gi`.

  In `scripts/test-helm.ps1`, assert that each value appears at its place in the rendered resources (SC-008).
- [X] T039 [P] [US4] Add `tests/helm/valid/us4-existing-claim.yaml` (`persistence.existingClaim: copernica-data`). Assert that no PVC is rendered and that the Deployment mounts `copernica-data`. Add `tests/helm/valid/us4-digest.yaml` and assert that the image is `copernica@sha256:…` with no tag.

### Implementation for User Story 4

- [X] T040 [US4] Extend `deploy/helm/copernica/templates/deployment.yaml` with:
  - `imagePullSecrets`, `serviceAccountName`, `deploymentAnnotations`, `podLabels`, `podAnnotations`;
  - `nodeSelector`, `tolerations`, `affinity`, `topologySpreadConstraints`, `priorityClassName`;
  - `extraEnv` appended **after** `COPERNICA_CONFIG_FILE`, and `extraEnvFrom`;
  - `extraVolumes` / `extraVolumeMounts` appended after the chart's own;
  - `initContainers`, and `sidecars` appended after the `copernica` container.

  Render every list with `toYaml` and `tpl`.
- [X] T041 [P] [US4] Add `labels` / `annotations` and `commonLabels` to `service.yaml`, `ingress.yaml`, `pvc.yaml`, `configmap.yaml` and `serviceaccount.yaml` under `deploy/helm/copernica/templates/`.
- [X] T042 [P] [US4] Create `deploy/helm/copernica/templates/extra-manifests.yaml`. For each item of `extraManifests`, render `tpl` of the string, or `tpl (toYaml .)` of the object, separated by `---`.
- [X] T043 [US4] Extend `Invoke-KindChecks` in `scripts/test-helm.ps1` with a server-side dry run of `examples/extensions.yaml` into the enforcing namespace, so that the init container and sidecar are also checked against `restricted`.

**Checkpoint**: SC-008 (Kubernetes side) is met.

---

## Phase 7: User Story 5 - Pass application settings the chart does not know yet (Priority: P2)

**Goal**: `wiki.extraSettings` reaches the application unchanged. Conflicts with modeled
or reserved settings are rejected.

**Independent Test**: `wiki.extraSettings.Copernica.MaxRenderBytes: 2048` makes a large
page show "too large to render". Adding `Copernica.Auth.Mode` fails with a conflict
message.

### Tests for User Story 5

- [X] T044 [P] [US5] Add invalid cases:
  - `tests/helm/invalid/30-extra-conflicts-mode.yaml` (`wiki.auth.mode: local` plus `extraSettings.Copernica.Auth.Mode: Oidc`; `# expect: conflicts with wiki.auth.mode`);
  - `31-extra-conflicts-case-insensitive.yaml` (`extraSettings.copernica.auth.MODE`; `# expect: conflicts with wiki.auth.mode`);
  - `32-extra-replaces-spaces.yaml` (`extraSettings.Copernica.Spaces: []` while `wiki.spaces` is set; `# expect: conflicts with wiki.spaces`);
  - `33-extra-reserved-datadir.yaml` (`# expect: Copernica.DataDirectory is managed by the chart`);
  - `34-extra-reserved-urls.yaml` (`# expect: Copernica.Urls is managed by the chart`).
- [X] T045 [P] [US5] Add `tests/helm/valid/us5-extra.yaml` (`Copernica.MaxRenderBytes: 2048`, `Logging.LogLevel.Default: Warning`, and an unknown future group `Copernica.Database.Provider: Example`). Assert that all three appear in `copernica.json` at those paths next to the modeled settings.

### Implementation for User Story 5

- [X] T046 [US5] Implement in `deploy/helm/copernica/templates/_validate.tpl` and `_config.tpl`, following [data-model.md](data-model.md#conflict-rules-fr-014):
  - `copernica.flatten`: a recursive dict-to-leaf-paths helper, with lists indexed;
  - conflict detection between the modeled document and `wiki.extraSettings`, on lower-cased paths: equal paths, and prefix overlaps in either direction;
  - reserved paths `copernica:datadirectory` and `copernica:urls`.

  The message format is `copernica: wiki.extraSettings.<original path> conflicts with wiki.<values path>`. The modeled values path is recovered from a static map of document path prefix to values path (`Copernica:Auth:Mode`→`wiki.auth.mode`, `Copernica:Spaces`→`wiki.spaces`, and so on). Then deep-merge `extraSettings` into the document with `mergeOverwrite` on a copy. Make T044 and T045 pass.
- [X] T047 [US5] Extend `Invoke-KindChecks` in `scripts/test-helm.ps1`:
  - upgrade the local release with `extraSettings.Copernica.MaxRenderBytes: 2048`;
  - commit a page larger than 2 KB to the `sandbox` space through the API;
  - assert that the page response reports it as too large to render (the existing 001 behavior).

**Checkpoint**: SC-003 and SC-008 (application side) are met.

---

## Phase 8: User Story 6 - Upgrade and change settings safely (Priority: P3)

**Goal**: Setting changes restart the pod. Data, discussions and sessions survive.
Uninstall keeps the volume. Renamed keys are never silently ignored.

**Independent Test**: Install, start a discussion, change a display name and upgrade. The
pod is replaced, the discussion and session are kept, and uninstalling leaves the PVC.

### Tests for User Story 6

- [X] T048 [P] [US6] In `scripts/test-helm.ps1`, render `examples/local.yaml` twice with different space display names, and assert that `checksum/config` differs. Render twice with the same values, and assert that it is equal. Render with a changed Secret *name* in a reference, and assert that it differs.

### Implementation for User Story 6

- [X] T049 [US6] Extend `Invoke-KindChecks` in `scripts/test-helm.ps1`:
  - before the upgrade in T034, create a discussion via the API and keep the session cookie;
  - after the upgrade, assert that the pod UID changed, the PVC UID is unchanged, the discussion is listed, and the old cookie is still accepted (SC-007);
  - `helm uninstall` and assert that the PVC `<fullname>-data` and the Secret `<fullname>-initial-user` still exist.
- [X] T050 [US6] Add a deprecation mechanism to `deploy/helm/copernica/templates/_validate.tpl`: a `copernica.deprecated` map of old values path → new path, empty for 0.1.0. A set old key fails with `copernica: <old> was renamed to <new>`, unless an alias was declared, in which case NOTES print `DEPRECATED: <old> → <new>`. Document the policy in a comment (FR-018). Add `tests/helm/invalid/40-deprecated-example.yaml` only once a real rename exists. Until then, a template unit check in `scripts/test-helm.ps1` renders with a temporary `--set-json` test map, to prove that the mechanism works.
- [X] T051 [US6] In `deploy/helm/copernica/templates/NOTES.txt`, add the uninstall hint: the PVC and the initial-user Secret are kept, and the `kubectl delete pvc/... secret/...` command removes them (FR-017).

**Checkpoint**: All user stories are complete.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T052 Delete `deploy/kubernetes/` (`deployment.yaml`, `ingress.example.yaml`, `kustomization.yaml`, `namespace.yaml`, `pvc.yaml`, `secret.example.yaml`, `service.yaml`).
- [X] T053 [P] Rewrite the "Kubernetes" section of `README.md`:
  - `helm install` with `examples/local.yaml`;
  - labelling the namespace `restricted`;
  - `helm template` for deployers without Helm;
  - packaging for offline transfer (`helm package deploy/helm/copernica`);
  - migration from the kustomize manifests (`persistence.existingClaim: copernica-data`, delete the old Deployment, Service and Secret first).
- [X] T054 [P] Update `SECURITY.md`:
  - "Container" points at `deploy/helm/copernica` instead of `deploy/kubernetes`;
  - "Files" adds that `COPERNICA_CONFIG_FILE`, when set, names one read-only configuration file;
  - "Authentication" adds the `Password` setting (from a file, hashed in memory, never logged) and the chart-generated initial account.
- [X] T055 [P] Update `specs/001-git-backed-team-wiki/contracts/configuration.md`:
  - replace "or in `copernica.json` in the data directory" with the `COPERNICA_CONFIG_FILE` description from [contracts/application.md](contracts/application.md);
  - add `Copernica__Auth__Local__Users__N__Password` / `_FILE`;
  - point the Kubernetes deployment notes at the chart.
- [X] T056 [P] Create `deploy/helm/copernica/README.md`: purpose, prerequisites (Kubernetes 1.27+, Helm 3.12+), quick install, the values reference (every key from `values.yaml` with its default and description), the Secret-reference model, extension points, the GitOps note on the generated password, and upgrade and uninstall behavior.
- [X] T057 Add a `helm` job to `.github/workflows/ci.yml`, after `build-and-test`:
  - `azure/setup-helm@v4` with a pinned `version`;
  - download kubeconform at a pinned version and verify its SHA-256;
  - `docker build -f deploy/Dockerfile -t copernica:ci .`;
  - `helm/kind-action` with a pinned `node_image`;
  - `kind load docker-image copernica:ci`;
  - `pwsh scripts/test-helm.ps1 -ImageTag ci`.
- [X] T058 [P] Update `docs/roadmap.md`: mark 008 as done, and note in 010 that the setup CLI writes values for `deploy/helm/copernica/values.schema.json`.
- [X] T059 Run [quickstart.md](quickstart.md) sections 1–6 manually on kind and the full `dotnet test`. Then time a fresh install by a reader following only `deploy/helm/copernica/README.md` (SC-001, under 15 minutes). Compare the line count of `examples/entra-id-azure-devops.yaml` with the old `deploy/kubernetes/secret.example.yaml`, extended to three spaces (SC-002, at most half). Record the results in `specs/008-helm-chart/checklists/requirements.md` under Notes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. T005 needs T004; T006 needs T005. T009 needs T007 and T008. T011 needs T009 and T010. T015 and T016 need T013 and T014. It blocks all stories.
- **US1 (Phase 3)** and **US2 (Phase 4)**: depend on Foundational. US2's kind steps (T034) extend US1's harness (T025).
- **US3 (Phase 5)**: depends on Foundational; independent of US1 and US2 for render-only checks.
- **US4 (Phase 6)**: depends on Foundational. T043 depends on T025, which provides the enforcing namespace.
- **US5 (Phase 7)**: depends on Foundational. T047 depends on T025.
- **US6 (Phase 8)**: T049 depends on T034. T048 depends only on Foundational.
- **Polish (Phase 9)**: T052–T056 after all stories. T057 after `scripts/test-helm.ps1` is complete. T059 last.

### Within Each Story

- Test data and assertions come first and must fail; then the templates; then the kind steps.
- `scripts/test-helm.ps1`, `_config.tpl`, `_validate.tpl`, `deployment.yaml` and `NOTES.txt` are shared files. Tasks that edit them are sequential, even across stories.

### Parallel Opportunities

- Setup: T002 and T003.
- Foundational: T004 (C# tests) together with T007, T008, T010 (chart templates); T012 in parallel with T011.
- US1: T017, T018, T019, T020, T022, T023.
- US2: T027, T028, T029, with T030 (C#) in parallel with the chart work in T031 and T032.
- US3: all invalid-case files in T035.
- US4: T038, T039, T041, T042.
- US5: T044 and T045.
- Polish: T053, T054, T055, T056, T058.
- After Foundational, US3, US4 and US5 render-only work can proceed in parallel with US1 and US2.

## Parallel Example: User Story 1

```text
Task: "T017 [P] [US1] tests/helm/valid/us1-structure.yaml + assertions"
Task: "T018 [P] [US1] tests/helm/valid/us1-ingress.yaml + assertions"
Task: "T019 [P] [US1] templates/ingress.yaml"
Task: "T020 [P] [US1] templates/serviceaccount.yaml"
Task: "T022 [P] [US1] examples/local.yaml"
Task: "T023 [P] [US1] examples/entra-id-azure-devops.yaml, oidc-azure-devops-server.yaml"
```

## Parallel Example: User Story 2

```text
Task: "T027 [P] [US2] LocalPasswordTests.cs"          # C#
Task: "T028 [P] [US2] invalid cases 10–14"            # chart data
Task: "T029 [P] [US2] tests/helm/valid/us2-secrets.yaml"
```

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 and Phase 2 (configuration file in the application, rendering pipeline,
   restricted pod).
2. Phase 3 (US1). Validate with the quickstart, section 2, using `examples/local.yaml` with a
   referenced hash.
3. Stop here if needed: the chart is installable, and `deploy/kubernetes` can still exist
   until Polish.

### Incremental Delivery

1. US1, then US2. These are the P1 stories, and the chart is now production-shaped.
2. US3 (validation) gives the biggest improvement over the plain manifests.
3. US4 and US5 are the extension points the user asked for.
4. US6 covers the upgrade guarantees.
5. Polish: remove kustomize, update docs, add the CI job.

### Notes

- Do not commit secrets in examples. Every example uses Secret references, and the
  sentinel-based leak scan runs on all of them.
- Keep `deploy/helm/copernica/values.yaml`, `values.schema.json` and `README.md` in sync. A
  key added in one is added in all three in the same task.
- Commit after each task or logical group.
