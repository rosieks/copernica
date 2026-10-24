# Data Model: Helm Chart for Kubernetes Deployments

This feature has no database entities. Its "data" is the **values file** and the
**configuration document** rendered from it. The complete key reference is in
[contracts/values.md](contracts/values.md). This document describes the structure, the
mapping and the rules.

## Values file: top-level groups

| Group | Kind | Purpose |
|-------|------|---------|
| `wiki` | modeled, strict | Application settings (spec FR-002, FR-003) |
| `wiki.extraSettings` | free-form | Any application setting, relative to the configuration root (FR-013) |
| `image`, `imagePullSecrets` | modeled, strict | Image source (FR-011) |
| `replicaCount` | modeled, fixed | Must be `1`; present only so a wrong value gets an explanation |
| `serviceAccount`, `podLabels`, `podAnnotations`, `deploymentAnnotations`, `commonLabels` | modeled | Metadata and identity |
| `podSecurityContext`, `securityContext` | pass-through | Merged over the chart's `restricted` defaults |
| `resources`, `nodeSelector`, `tolerations`, `affinity`, `topologySpreadConstraints`, `priorityClassName` | pass-through | Scheduling and sizing |
| `probes` | modeled | Timings of liveness and readiness probes |
| `service` | modeled | Type, port, labels, annotations |
| `ingress` | modeled | Off by default; class, hosts, paths, TLS, labels, annotations |
| `persistence` | modeled | Size, class, access mode, existing claim, keep on uninstall |
| `extraEnv`, `extraEnvFrom`, `extraVolumes`, `extraVolumeMounts`, `initContainers`, `sidecars` | free-form lists | Pod additions (FR-012) |
| `extraManifests` | free-form list | Extra resources, rendered with `tpl` (FR-012) |

"Strict" means `additionalProperties: false` in the schema: unknown keys are rejected.
"Pass-through" means Kubernetes objects copied unchanged and not validated by the chart.

## Entities

### SecretReference

| Field | Type | Rules |
|-------|------|-------|
| `secretName` | string | required, DNS-1123 subdomain |
| `key` | string | required, non-empty |

It is used wherever the application has a credential. A plain string in that place
fails schema validation (FR-008). Each reference becomes one item of the projected
`credentials` volume at a fixed path, and the configuration document gets the matching
`<Setting>_FILE` key (research R2).

### Wiki (application settings)

| Field | Maps to | Rules |
|-------|---------|-------|
| `publicBaseUrl` | `Copernica:PublicBaseUrl` | absolute `http(s)` URL; defaults to `https://<first ingress host>` (or `http://` without TLS) when the ingress is on |
| `syncInterval` | `Copernica:SyncInterval` | TimeSpan `[d.]hh:mm:ss`, > 0 |
| `permissionCacheTtl` | `Copernica:PermissionCacheTtl` | TimeSpan, > 0 and ≤ `00:05:00` |
| `maxRenderBytes` | `Copernica:MaxRenderBytes` | integer > 0 |
| `fallbackEmailDomain` | `Copernica:FallbackEmailDomain` | non-empty |
| `forwardedHeaders.knownProxies` | `Copernica:ForwardedHeaders:KnownProxies` | list of IP addresses |
| `auth` | `Copernica:Auth` | see Auth |
| `azureDevOps` | `Copernica:AzureDevOps` | see AzureDevOps |
| `attachments` | `Copernica:Attachments` | `path`, `maxBytes`, `maxPendingBytesPerUser`, with the 003 rules |
| `spaces` | `Copernica:Spaces` | list of SpaceEntry; identifiers unique |
| `extraSettings` | configuration root | free-form; see Conflict rules |

Unset optional fields are **omitted** from the configuration document, so the
application's own defaults apply, and the chart does not repeat them.

### Auth

| Field | Rules |
|-------|-------|
| `mode` | required: `local` \| `entraId` \| `oidc` |
| `local.users[]` | `name` (required, unique), `displayName`, `email`, `passwordHash` (SecretReference, required) |
| `local.initialUser.name` | default `admin`; used only when `local.users` is empty (GeneratedCredential) |
| `entraId` | `instance` (default as in the application), `tenantId`, `clientId` (required in this mode), `clientSecret` (SecretReference, required in this mode) |
| `oidc` | `authority` (https URL), `clientId` (required in this mode), `clientSecret` (SecretReference, required in this mode) |

### AzureDevOps

| Field | Rules |
|-------|-------|
| `syncCredential.type` | `none` (default) \| `servicePrincipal` \| `managedIdentity` \| `pat` |
| `syncCredential.tenantId`, `.clientId`, `.clientSecret` | required for `servicePrincipal`; `clientSecret` is a SecretReference |
| `syncCredential.managedIdentityClientId` | optional for `managedIdentity` |
| `syncCredential.pat` | SecretReference, required for `pat` |
| `server.userPat` | boolean, default `false` |

### SpaceEntry

| Field | Maps to `Copernica:Spaces:N:` | Rules |
|-------|-------------------------------|-------|
| `id` | `Id` | required, unique across entries |
| `displayName` | `DisplayName` | optional |
| `provider` | `Provider` | `git` (default) \| `azureDevOps` |
| `remoteUrl` | `RemoteUrl` | required for `azureDevOps`; optional for `git` (a space stored only on the volume) |
| `branch` | `Branch` | default `main` |
| `folder` | `Folder` | optional |
| `attachments.path` | `Attachments:Path` | optional per-space override (003) |
| `credential.username` | `Credential:Username` | optional |
| `credential.token` | `Credential:Token_FILE` | SecretReference, optional |

The position in the list becomes the index `N`. The deployer never writes it.

### GeneratedCredential

| Field | Value |
|-------|-------|
| Secret name | `<fullname>-initial-user` |
| Key | `password` |
| Value | 24 random alphanumeric characters, generated once |
| Lifetime | Reused on upgrade (`lookup`). Kept on uninstall (`helm.sh/resource-policy: keep`) |
| Configuration | `Copernica:Auth:Local:Users:0:Name` = `initialUser.name`, `…:Password_FILE` = mounted path |

**State**: *absent* → (install with `mode=local` and no users) → *created* →
(upgrade) → *unchanged*. If the deployer adds `local.users`, the generated account is no
longer configured, but its Secret stays until the deployer deletes it.

## Configuration document

A JSON object with the same hierarchy as the application's configuration. It is
rendered into ConfigMap `<fullname>-config`, key `copernica.json`, mounted at
`/etc/copernica/`, and named by `COPERNICA_CONFIG_FILE`. Example for two spaces with Entra
ID:

```json
{
  "Copernica": {
    "PublicBaseUrl": "https://wiki.example.internal",
    "Auth": {
      "Mode": "EntraId",
      "EntraId": {
        "TenantId": "…",
        "ClientId": "…",
        "ClientSecret_FILE": "/var/run/secrets/copernica/auth/entra-id/client-secret"
      }
    },
    "AzureDevOps": {
      "SyncCredential": { "Type": "Pat", "Pat_FILE": "/var/run/secrets/copernica/azure-devops/pat" }
    },
    "Spaces": [
      { "Id": "handbook", "DisplayName": "Team Handbook", "Provider": "AzureDevOps",
        "RemoteUrl": "https://dev.azure.com/contoso/Platform/_git/handbook" },
      { "Id": "payments", "Provider": "AzureDevOps",
        "RemoteUrl": "https://dev.azure.com/contoso/Payments/_git/payments-api",
        "Folder": "docs", "Attachments": { "Path": "images" } }
    ]
  }
}
```

**Reserved paths** are set by the chart itself or by the image, and can never be set
through `extraSettings`: `Copernica:DataDirectory` (`/data`) and `Copernica:Urls`
(`http://+:8080`).

## Conflict rules (FR-014)

1. Flatten the modeled document and `extraSettings` to leaf paths joined with `:`, and
   compare them in lower case.
2. If the same path appears in both, fail with
   `wiki.extraSettings.<path> conflicts with wiki.<modeled value>`.
3. If one path is a prefix of a path in the other (one replaces an object or list that
   the other sets inside), fail in the same way.
4. If an `extraSettings` path equals or is under a reserved path, fail with
   `<path> is managed by the chart`.
5. Otherwise, deep-merge `extraSettings` into the document.

## Validation summary (FR-009)

| Rule | Layer | Message names |
|------|-------|---------------|
| Unknown key in a strict group | schema | the key's path |
| Wrong type or enumeration | schema | the path and the allowed values |
| Plain string where a SecretReference is expected | schema | the path |
| Missing setting required by `auth.mode` or `syncCredential.type` | schema (`if/then`) | the path |
| Duplicate `spaces[].id` or `auth.local.users[].name` | template | the duplicate value |
| `replicaCount` ≠ 1 | template | why only one replica is supported |
| `permissionCacheTtl` > 5 min or invalid TimeSpan | template | the value and the limit |
| Free-form conflict or reserved path | template | both paths |
