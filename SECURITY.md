# Security

This page describes everything Copernica does on the machine and on the network, so that a
review can be short. It follows the project constitution (`.specify/memory/constitution.md`,
Principles II and III).

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Report a vulnerability** (private security
advisory) on this repository. We aim to acknowledge reports within 5 working days.

## Network

| Direction | What | Default |
|-----------|------|---------|
| Inbound | One HTTP port (`8080`) | Binary: `127.0.0.1` only. Container: all interfaces *inside* the container; exposure is decided by your Service/Ingress |
| Outbound | Git hosts named in each space's `RemoteUrl` (HTTPS) | None until spaces are configured |
| Outbound | Azure DevOps REST API on the same hosts (permission checks) | Only for `AzureDevOps` spaces |
| Outbound | Identity provider (`login.microsoftonline.com` or your OIDC authority) | Only in `EntraId` / `Oidc` mode |

There is no telemetry, analytics, update check, CDN, remote font or script, or license server.
The server never fetches arbitrary URLs. All web assets are embedded in the executable.

TLS is expected to be terminated by your ingress or reverse proxy. Set
`Copernica__ForwardedHeaders__KnownProxies__N` so that forwarded headers are only accepted from
your own proxies.

## Files

Copernica writes only under `Copernica__DataDirectory` (`./data`, or `/data` in the container)
and to the system temp directory:

| Path | Content |
|------|---------|
| `mirrors/<space>.git` | Bare mirrors of the configured repositories (page content) |
| `copernica.db` | SQLite: users (id, name, email), discussions and comments, space status, encrypted delegated tokens |
| `keys/` | ASP.NET Core Data Protection keys (cookie and token encryption). Protect this directory like a secret; the keys are not additionally encrypted at rest |

Back up the data directory as a whole. Page content can always be re-fetched from your git
hosting platform.

## Authentication and authorization

- **Sign-in:** required for everything except `/health/*` and the static web UI. Anonymous
  read access does not exist. The server refuses to start on a non-loopback address unless
  `Copernica__Auth__Mode` is set.
- **Modes:**
  - `Local`: accounts from configuration, PBKDF2 password hashes. Use for evaluation and
    small teams.
  - `EntraId`: Microsoft Entra ID, OIDC code flow with PKCE.
  - `Oidc`: any OpenID Connect provider.
- **Session:** HttpOnly, `SameSite=Lax` cookie. State-changing requests require an
  antiforgery token (`X-XSRF-TOKEN` header).
- **Authorization** mirrors the git hosting platform:
  - Azure DevOps spaces are checked with the user's own credentials. Results are cached
    for at most 5 minutes. Errors deny access.
  - Spaces the user cannot read answer `404`.
  - Plain `Git` spaces are readable and writable by every signed-in user.
- **Delegated access (Azure DevOps):**
  - Tokens are requested with the minimal scope (`499b84ac-…/.default`) and kept only on
    the server.
  - Tokens are stored encrypted with Data Protection (purpose `Copernica.UserTokens`) and
    removed on sign-out. Personal access tokens for Azure DevOps Server are stored the same
    way, and removed by the user from their profile page.
  - Edits are pushed with the user's own credentials, so the platform enforces repository
    permissions and branch policies.
- **Background synchronization** uses a separate, read-only identity. It is never used for
  writes or for deciding what a user can see.

## Content safety

- **Rendering:**
  - Markdown is rendered on the server (Markdig) and sanitized with an allow-list
    (HtmlSanitizer).
  - Scripts, event handlers, inline styles, frames, forms and `javascript:`/`data:` links
    are removed.
  - Comments go through the same pipeline.
- **Response headers:**
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`.
    `style-src-attr` is needed by the code editor for positioning. It allows style
    *attributes* only, and user content never contains them.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- **Repository files:**
  - Images are served inline. SVG gets `Content-Security-Policy: sandbox`.
  - Everything else is served as an `attachment` download. Paths cannot leave the space folder.

## Container

- **Base image:** `mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled`. It has no
  shell and no package manager.
- **Runtime:**
  - Runs as UID `1654` with no Linux capabilities, `allowPrivilegeEscalation: false` and a
    read-only root filesystem (writable `/data` volume and `/tmp`).
  - Compatible with the Pod Security Standard `restricted` (see `deploy/kubernetes`).
  - Runs as a single replica by design: writes are serialized inside the process.

## Third-party code

All shipped dependencies use permissive licenses (MIT, BSD, Apache-2.0). See
`THIRD-PARTY-NOTICES.md` and `scripts/check-licenses.ps1`.

**libgit2** (bundled with LibGit2Sharp) is licensed under **GPLv2 with a linking exception**.
It is used unmodified as a dynamically loaded native library, which the exception permits.
The project constitution (Principle IV) explicitly allows this.
