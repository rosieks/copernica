# Copernica Helm chart

Deploys Copernica, a self-hosted team wiki that stores pages as Markdown in git
repositories. The chart deploys:
- one replica with a persistent volume;
- a non-root container with a read-only root filesystem, compatible with the Pod Security
  Standard `restricted`;
- no exposure outside the cluster unless you turn on the ingress.

The chart has no dependencies and installs offline, from this directory or from the
archive made by `helm package`.

**Requirements:** Kubernetes 1.27+, Helm 3.12+, and an image of Copernica in a registry
your cluster can pull from (`docker build -f deploy/Dockerfile`).

## Quick start

```bash
kubectl create namespace wiki
kubectl label namespace wiki pod-security.kubernetes.io/enforce=restricted
helm install wiki deploy/helm/copernica -n wiki \
  --set wiki.auth.mode=local --set wiki.spaces[0].id=sandbox \
  --set image.registry=registry.example.internal --set image.tag=<tag>
```

The installation notes print how to reach the wiki and how to read the password of the
generated `admin` account.

For real installations, start from one of the [examples](examples):

| Example | Use |
|---------|-----|
| [local.yaml](examples/local.yaml) | Built-in accounts and spaces stored on the wiki's volume |
| [entra-id-azure-devops.yaml](examples/entra-id-azure-devops.yaml) | Azure DevOps Services with Microsoft Entra ID, behind an ingress |
| [oidc-azure-devops-server.yaml](examples/oidc-azure-devops-server.yaml) | Azure DevOps Server with an OIDC provider such as AD FS |
| [extensions.yaml](examples/extensions.yaml) | Every extension point: registry, labels, scheduling, extra volumes, sidecars, extra manifests, free-form settings |

## How values are organized

`wiki` holds the application settings in the wiki's own hierarchy. Spaces are a list of
entries, and per-space settings sit inside their entry:

```yaml
wiki:
  auth:
    mode: entraId
    entraId:
      tenantId: 00000000-0000-0000-0000-000000000000
      clientId: 00000000-0000-0000-0000-000000000000
      clientSecret: { secretName: wiki-entra, key: client-secret }
  spaces:
    - id: payments
      provider: azureDevOps
      remoteUrl: https://dev.azure.com/contoso/Payments/_git/payments-api
      folder: docs
      attachments: { path: images }
```

The chart renders these settings into one configuration file, mounted from a ConfigMap
and loaded through `COPERNICA_CONFIG_FILE`. Settings you leave empty are not written, so
the application's defaults apply.

### Credentials

Credentials are never plain values. Each one is a reference `{ secretName, key }` to a
Secret you create (by hand, or with External Secrets, Sealed Secrets, SOPS and similar).
- A plain string is rejected at install time.
- Referenced keys are mounted read-only under `/var/run/secrets/copernica/`. The
  configuration file holds only their paths.
- A missing Secret keeps the pod in `ContainerCreating`, and the pod's events name it.

The one credential the chart creates itself is the password of the initial local
account:
- It is created when `wiki.auth.mode` is `local` and `wiki.auth.local.users` is empty.
- It is generated once into `<release>-copernica-initial-user`, kept across upgrades and
  uninstalls, and the installation notes show how to read it.
- `helm template` and GitOps tools that render without cluster access (for example Argo
  CD) generate a new password on every render. There, list `wiki.auth.local.users` with
  your own Secret.

### Validation

`helm install`, `upgrade`, `template` and `lint` reject invalid values before anything is
created, and the message names the value:
- unknown keys (typos) in every modeled group;
- wrong types and unknown modes or providers;
- credentials missing for the chosen mode;
- duplicate space ids or user names;
- `replicaCount` other than 1;
- `permissionCacheTtl` above `00:05:00`;
- free-form settings that clash with modeled ones.

### Settings the chart does not model

`wiki.extraSettings` is passed to the application unchanged, relative to the root of its
configuration. Use it for settings this chart version does not model:

```yaml
wiki:
  extraSettings:
    Copernica:
      MaxRenderBytes: 2097152
    Logging:
      LogLevel:
        Default: Warning
```

The following are rejected, so nothing is overridden silently:
- a setting the chart already models, compared case-insensitively and treating `X` and
  `X_FILE` as the same setting;
- `Copernica:DataDirectory` and `Copernica:Urls`.

The section ends up in a ConfigMap, so do not put secrets in it. Use `extraEnvFrom` with a
Secret instead. Environment variables (`extraEnv`, `extraEnvFrom`) override the
configuration file.

## Values

### Application (`wiki`)

| Key | Default | Description |
|-----|---------|-------------|
| `wiki.publicBaseUrl` | `""` | Address users open. Default `https://<first ingress host>` (`http://` without ingress TLS). Needed for Entra ID / OIDC when the ingress is off |
| `wiki.syncInterval` | `""` (1 min) | Fetch interval per space, TimeSpan `hh:mm:ss` |
| `wiki.permissionCacheTtl` | `""` (2 min) | Permission cache lifetime, at most `00:05:00` |
| `wiki.maxRenderBytes` | `null` (1 MiB) | Larger pages are not rendered |
| `wiki.fallbackEmailDomain` | `""` | Commit email domain for identities without email |
| `wiki.forwardedHeaders.knownProxies` | `[]` | Trusted reverse proxy IPs |
| `wiki.auth.mode` | `""` | **Required**: `local`, `entraId` or `oidc` |
| `wiki.auth.local.users[]` | `[]` | `name`, `displayName`, `email`, `passwordHash` (Secret reference to a hash from `copernica hash-password`) |
| `wiki.auth.local.initialUser.name` | `admin` | Generated account when `users` is empty |
| `wiki.auth.entraId.instance` / `tenantId` / `clientId` / `clientSecret` | | Microsoft Entra ID app registration; `clientSecret` is a Secret reference |
| `wiki.auth.oidc.authority` / `clientId` / `clientSecret` | | Generic OIDC provider; `clientSecret` is a Secret reference |
| `wiki.azureDevOps.syncCredential.type` | `none` | `none`, `servicePrincipal` (`tenantId`, `clientId`, `clientSecret`), `managedIdentity` (`managedIdentityClientId`) or `pat` (`pat`). Read-only identity for synchronization |
| `wiki.azureDevOps.server.userPat` | `false` | Azure DevOps Server: users enter their own personal access token |
| `wiki.attachments.path` / `maxBytes` / `maxPendingBytesPerUser` | | Pasted images: location template (`{dir}`, `{page}`) and size limits |
| `wiki.spaces[]` | `[]` | `id` (required), `displayName`, `provider` (`git` / `azureDevOps`), `remoteUrl`, `branch`, `folder`, `attachments.path`, `credential.username`, `credential.token` (Secret reference) |
| `wiki.extraSettings` | `{}` | Free-form application settings, see above |

### Kubernetes

| Key | Default | Description |
|-----|---------|-------------|
| `image.registry` / `repository` / `tag` / `digest` / `pullPolicy` | `""` / `copernica` / appVersion / `""` / `IfNotPresent` | `digest` wins over `tag` |
| `imagePullSecrets` | `[]` | e.g. `[{ name: regcred }]` |
| `nameOverride` / `fullnameOverride` | `""` | Resource names |
| `commonLabels` | `{}` | Labels on every resource |
| `replicaCount` | `1` | Must stay 1 |
| `serviceAccount.create` / `name` / `annotations` / `automountToken` | `false` / `""` / `{}` / `false` | Pod identity |
| `deploymentAnnotations`, `podLabels`, `podAnnotations` | `{}` | Metadata |
| `podSecurityContext`, `securityContext` | `{}` | Merged over the restricted defaults |
| `resources` | 100m / 256Mi requests, 1Gi limit | |
| `nodeSelector`, `tolerations`, `affinity`, `topologySpreadConstraints`, `priorityClassName` | empty | Scheduling |
| `probes.liveness` / `readiness` / `startup` | see `values.yaml` | Probe timings; the startup probe allows 5 minutes for first clones |
| `service.type` / `port` / `labels` / `annotations` | `ClusterIP` / `80` | |
| `ingress.enabled` / `className` / `labels` / `annotations` / `hosts` / `tls` | `false` | A host without paths gets `/` |
| `persistence.existingClaim` | `""` | Reuse a claim; the chart then creates none |
| `persistence.size` / `storageClass` / `accessMode` / `labels` / `annotations` | `10Gi` / `""` / `ReadWriteOnce` | `storageClass: "-"` means no class |
| `persistence.keepOnUninstall` | `true` | Keep the created claim on `helm uninstall` |
| `extraEnv`, `extraEnvFrom` | `[]` | Extra environment; overrides the configuration file |
| `extraVolumes`, `extraVolumeMounts` | `[]` | e.g. a CA bundle |
| `initContainers`, `sidecars` | `[]` | Must also satisfy `restricted` where it is enforced |
| `extraManifests` | `[]` | Any resources, as objects or strings, rendered with `tpl` |

## Upgrades and uninstall

- A change to any setting or Secret reference restarts the wiki. The old pod stops before
  the new one starts (`Recreate`), because only one process may use the data volume.
- A change to a Secret's *content* is not visible to Helm. Restart with
  `kubectl rollout restart deploy/<release>-copernica`.
- Pages, discussions, signed-in sessions and the generated password survive upgrades.
- `helm uninstall` keeps the data claim (unless `persistence.keepOnUninstall: false`) and
  the generated initial-user Secret. The notes print the command to delete them.
- The chart follows semantic versioning. A renamed value keeps working with a deprecation
  notice for at least one minor version, or is rejected with a message naming its new key.
  It is never silently ignored.

## Without Helm in the cluster

```bash
helm template wiki deploy/helm/copernica -n wiki -f values.yaml > copernica.yaml
kubectl apply -n wiki -f copernica.yaml
```

List local accounts with your own Secret in this case (see Credentials).

## Development

`pwsh scripts/test-helm.ps1 -RenderOnly` lints and renders every example and test case,
validates the output with kubeconform, and checks that every file in
`tests/helm/invalid` fails with its expected message. Without `-RenderOnly`, it also
installs, upgrades and uninstalls releases in the current kubectl context, which must be
a disposable cluster such as kind with the image `copernica:<tag>` loaded.
