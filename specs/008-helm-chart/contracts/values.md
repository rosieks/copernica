# Contract: Chart Values

The chart is at `deploy/helm/copernica/`. `values.yaml` holds the defaults below, and every
key is documented there with a comment. `values.schema.json` enforces types and the strict
groups. Structure, mapping and rules are in [data-model.md](../data-model.md).

## Defaults (abridged `values.yaml`)

```yaml
image:
  registry: ""              # e.g. registry.example.internal
  repository: copernica
  tag: ""                   # default: .Chart.AppVersion
  digest: ""                # sha256:…; wins over tag
  pullPolicy: IfNotPresent
imagePullSecrets: []        # [{ name: regcred }]

nameOverride: ""
fullnameOverride: ""
commonLabels: {}            # added to every resource the chart renders

replicaCount: 1             # must stay 1 (single replica by design)

wiki:
  publicBaseUrl: ""         # default: derived from the first ingress host
  syncInterval: ""          # TimeSpan, e.g. "00:01:00"; empty = application default
  permissionCacheTtl: ""    # TimeSpan, at most "00:05:00"
  maxRenderBytes: null
  fallbackEmailDomain: ""
  forwardedHeaders:
    knownProxies: []
  auth:
    mode: ""                # REQUIRED: local | entraId | oidc
    local:
      users: []             # [{ name, displayName, email, passwordHash: { secretName, key } }]
      initialUser:
        name: admin         # generated account when users is empty
    entraId:
      instance: ""
      tenantId: ""
      clientId: ""
      clientSecret: null    # { secretName, key }
    oidc:
      authority: ""
      clientId: ""
      clientSecret: null    # { secretName, key }
  azureDevOps:
    syncCredential:
      type: none            # none | servicePrincipal | managedIdentity | pat
      tenantId: ""
      clientId: ""
      clientSecret: null    # { secretName, key }
      managedIdentityClientId: ""
      pat: null             # { secretName, key }
    server:
      userPat: false
  attachments:
    path: ""                # default .attachments
    maxBytes: null
    maxPendingBytesPerUser: null
  spaces: []
  # - id: handbook
  #   displayName: Team Handbook
  #   provider: azureDevOps            # git | azureDevOps
  #   remoteUrl: https://dev.azure.com/contoso/Platform/_git/handbook
  #   branch: main
  #   folder: docs
  #   attachments: { path: images }
  #   credential: { username: copernica, token: { secretName: wiki-git, key: token } }
  extraSettings: {}         # free-form, relative to the configuration root, e.g.
  #   Copernica: { MaxRenderBytes: 2097152 }
  #   Logging: { LogLevel: { Default: Warning } }
  # NOT for secrets: use extraEnvFrom with a Secret instead.

serviceAccount:
  create: false
  name: ""                  # default: "default" when create=false, else fullname
  annotations: {}
  automountToken: false

deploymentAnnotations: {}
podLabels: {}
podAnnotations: {}
podSecurityContext: {}      # merged over the restricted defaults below
securityContext: {}         # merged over the restricted defaults below
resources:
  requests: { cpu: 100m, memory: 256Mi }
  limits: { memory: 1Gi }
nodeSelector: {}
tolerations: []
affinity: {}
topologySpreadConstraints: []
priorityClassName: ""

probes:
  liveness:  { periodSeconds: 20, timeoutSeconds: 5, failureThreshold: 3 }
  readiness: { periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3 }
  startup:   { periodSeconds: 5,  timeoutSeconds: 5, failureThreshold: 60 }

service:
  type: ClusterIP
  port: 80
  labels: {}
  annotations: {}

ingress:
  enabled: false
  className: ""
  labels: {}
  annotations: {}
  hosts: []                 # [{ host: wiki.example.internal, paths: [{ path: /, pathType: Prefix }] }]
  tls: []                   # [{ hosts: [wiki.example.internal], secretName: wiki-tls }]

persistence:
  existingClaim: ""         # reuse a claim; the chart then creates none
  size: 10Gi
  storageClass: ""          # "" = cluster default; "-" = no class
  accessMode: ReadWriteOnce
  labels: {}
  annotations: {}
  keepOnUninstall: true

extraEnv: []                # [{ name, value }] or valueFrom; overrides the config file
extraEnvFrom: []            # [{ secretRef: { name } }, { configMapRef: { name } }]
extraVolumes: []
extraVolumeMounts: []
initContainers: []
sidecars: []
extraManifests: []          # list of objects or strings; rendered with tpl
```

## Fixed pod security defaults (merged under `podSecurityContext` / `securityContext`)

```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1654
  runAsGroup: 1654
  fsGroup: 1654
  seccompProfile: { type: RuntimeDefault }
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities: { drop: [ALL] }
```

`automountServiceAccountToken` follows `serviceAccount.automountToken`, which is `false` by
default. `/tmp` is an `emptyDir`.

## Rendered resources

| Resource | Name | When |
|----------|------|------|
| Deployment | `<fullname>` | always; `replicas: 1`, `strategy: Recreate` |
| Service | `<fullname>` | always |
| ConfigMap | `<fullname>-config` | always; key `copernica.json` |
| PersistentVolumeClaim | `<fullname>-data` | when `persistence.existingClaim` is empty |
| Secret | `<fullname>-initial-user` | when `wiki.auth.mode=local` and `wiki.auth.local.users` is empty |
| ServiceAccount | `serviceAccount.name` or `<fullname>` | when `serviceAccount.create` |
| Ingress | `<fullname>` | when `ingress.enabled` |
| *(any)* | as given | each `extraManifests` item |

Labels: `app.kubernetes.io/{name,instance,version,managed-by}`,
`helm.sh/chart`, plus `commonLabels`. The selector uses only `name` and `instance`.

## Mounted paths in the container

| Path | Content |
|------|---------|
| `/data` | the persistent volume |
| `/tmp` | `emptyDir` |
| `/etc/copernica/copernica.json` | configuration document (read-only) |
| `/var/run/secrets/copernica/…` | projected Secret keys (read-only), at the fixed paths below |

| Secret reference | Projected path |
|------------------|----------------|
| `wiki.auth.local.users[i].passwordHash` | `auth/local/<i>/password-hash` |
| generated initial user | `auth/local/initial/password` |
| `wiki.auth.entraId.clientSecret` | `auth/entra-id/client-secret` |
| `wiki.auth.oidc.clientSecret` | `auth/oidc/client-secret` |
| `wiki.azureDevOps.syncCredential.clientSecret` | `azure-devops/client-secret` |
| `wiki.azureDevOps.syncCredential.pat` | `azure-devops/pat` |
| `wiki.spaces[i].credential.token` | `spaces/<id>/token` |

## Environment set by the chart

| Variable | Value |
|----------|-------|
| `COPERNICA_CONFIG_FILE` | `/etc/copernica/copernica.json` |

`extraEnv` comes after it. Application settings given as environment variables override
the configuration file, as in any .NET application.

## Error messages (examples)

```text
values don't meet the specifications of the schema(s) …:
- wiki.spaces.0: Additional property brnach is not allowed
- wiki.auth.entraId.clientSecret: Invalid type. Expected: object, given: string
copernica: wiki.spaces: duplicate id "handbook"
copernica: replicaCount must be 1. The wiki keeps its data on one volume and serializes writes in one process.
copernica: wiki.permissionCacheTtl "00:10:00" exceeds the maximum of 00:05:00
copernica: wiki.extraSettings.Copernica.Auth.Mode conflicts with wiki.auth.mode
copernica: wiki.extraSettings.Copernica.DataDirectory is managed by the chart
```

## Compatibility

The chart follows semantic versioning. A renamed key is accepted for at least one minor
version with a deprecation line in NOTES, or rejected with a message naming the new key
(FR-018). Supported: Kubernetes 1.27+, Helm 3.12+.
