# Contract: Configuration and Deployment Interface

Configuration follows ASP.NET Core conventions: every key can be set as an environment
variable (`__` separates levels) or in `copernica.json` in the data directory. Secrets are
read from environment variables or files (e.g. Kubernetes Secrets mounted as files via
`*_FILE` keys). Defaults are the safest configuration (Constitution, Security section).

## General

| Key | Default | Description |
|-----|---------|-------------|
| `Copernica__DataDirectory` | `./data` (binary), `/data` (container) | Volume for mirrors, SQLite database, Data Protection keys |
| `Copernica__Urls` | `http://127.0.0.1:8080` (binary), `http://+:8080` (container) | Listening address (Constitution III) |
| `Copernica__PublicBaseUrl` | — | External URL behind ingress; required for OIDC redirect URIs |
| `Copernica__SyncInterval` | `00:01:00` | Fetch interval per space (FR-007) |
| `Copernica__PermissionCacheTtl` | `00:02:00` | Must be ≤ 5 min (FR-009b); higher values rejected at startup |
| `Copernica__MaxRenderBytes` | `1048576` | Pages above this size are not rendered |
| `Copernica__FallbackEmailDomain` | `users.noreply.invalid` | Commit email when the identity has none |
| `Copernica__ForwardedHeaders__KnownProxies__0` | — | Trusted reverse proxy addresses |

## Authentication

| Key | Description |
|-----|-------------|
| `Copernica__Auth__Mode` | `EntraId` \| `Oidc` \| `Local`. No default: the server refuses to start without it when listening on a non-loopback address |
| `Copernica__Auth__EntraId__TenantId` | Organization tenant |
| `Copernica__Auth__EntraId__ClientId` | App registration (confidential web client) |
| `Copernica__Auth__EntraId__ClientSecret` / `..._FILE` | Secret or certificate path |
| `Copernica__Auth__Oidc__Authority` / `__ClientId` / `__ClientSecret` | Generic OIDC provider (e.g. AD FS) — used with Azure DevOps Server + user PATs |
| `Copernica__Auth__Local__Users__0__Name` / `__PasswordHash` | Built-in accounts for evaluation / `Git` spaces (hash produced by `copernica hash-password`) |

## Spaces

```text
Copernica__Spaces__0__Id=handbook
Copernica__Spaces__0__DisplayName=Team Handbook
Copernica__Spaces__0__Provider=AzureDevOps
Copernica__Spaces__0__RemoteUrl=https://dev.azure.com/contoso/Platform/_git/handbook
Copernica__Spaces__0__Branch=main
Copernica__Spaces__1__Id=payments-docs
Copernica__Spaces__1__DisplayName=Payments Service
Copernica__Spaces__1__Provider=AzureDevOps
Copernica__Spaces__1__RemoteUrl=https://dev.azure.com/contoso/Payments/_git/payments-api
Copernica__Spaces__1__Folder=docs
Copernica__Spaces__2__Id=sandbox
Copernica__Spaces__2__Provider=Git
```

### Images pasted in the editor (003)

| Variable | Default | Meaning |
|----------|---------|---------|
| `Copernica__Attachments__Path` | `.attachments` | Where new images go, relative to the space root. Tokens: `{dir}` (folder of the page), `{page}` (page path without `.md`). Examples: `images`, `{page}.assets`, `{dir}` |
| `Copernica__Spaces__N__Attachments__Path` | *(the default)* | Per-space override |
| `Copernica__Attachments__MaxBytes` | `10485760` | Maximum size of one image |
| `Copernica__Attachments__MaxPendingBytesPerUser` | `209715200` | Maximum total size of a user's unsaved images |

A path that would leave the space makes only that space unavailable. Links inserted by the
editor are always relative to the page. Links starting with `/` (Azure DevOps Wiki) are
resolved from the space root.

`Git` spaces with an HTTPS remote need `Copernica__Spaces__N__Credential__Token` (or
`_FILE`) with read/write access, because there is no per-user identity to push with. All
signed-in users can then edit (FR-009c); commits still carry the user as author.

## Azure DevOps (deployment-level read identity)

| Key | Description |
|-----|-------------|
| `Copernica__AzureDevOps__SyncCredential__Type` | `ServicePrincipal` \| `ManagedIdentity` \| `Pat` |
| `Copernica__AzureDevOps__SyncCredential__...` | Client id/secret, or PAT (`_FILE` supported). Must be **read-only** (Code: Read) |
| `Copernica__AzureDevOps__Server__UserPat` | `true` for Azure DevOps Server: users supply their own PAT on their profile page (see research R3) |

## Process interface

| Item | Value |
|------|-------|
| Ports | One HTTP port (default 8080) |
| Health | `GET /health/live`, `GET /health/ready` |
| Logs | Structured JSON to stdout |
| Files written | Only under `DataDirectory` (+ temp files under `$TMPDIR`) |
| Outbound connections | Only to configured `RemoteUrl` hosts and the configured identity provider |
| Container user | UID 1654 (`app`, built into .NET images), read-only root FS, no capabilities, PSS `restricted` |
