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
| `copernica.db` | SQLite: users (id, name, email), discussions and comments, space status, encrypted delegated tokens, metadata of unsaved images (`pending_images`) |
| `pending/` | Images pasted into the editor and not saved yet (owner-only). Deleted when the page is saved, or 24 hours after their last use; committed to the repository only together with the page |
| `keys/` | ASP.NET Core Data Protection keys (cookie and token encryption). Protect this directory like a secret; the keys are not additionally encrypted at rest |

Back up the data directory as a whole. Page content can always be re-fetched from your git
hosting platform.

**Files written to content repositories:** besides the pages and the images saved with
them, organizing the page tree can add or edit `.order` files (the page order of a folder,
in the Azure DevOps Wiki format) in the space's folders. Commits that rename or move pages
end with `Copernica-Moved: <old path> -> <new path>` lines; the wiki reads them to redirect
old addresses and to keep page history and discussions attached after a move. Both are
plain text and stay usable with ordinary git tooling.

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
    `style-src-attr` is needed by the code editor and by positioned menus and popovers.
    It allows style *attributes* only, and user content never contains them.
  - The HTML page that loads the web UI (the SPA shell: `/`, `/s/...`, `/profile`, …)
    is the one exception: its `style-src` also allows `'nonce-<random>'`. The nonce is a
    fresh 128-bit random value on every response, and it also appears in the page's
    `<meta name="csp-nonce">`. The UI component library (Radix) uses it only for the
    `<style>` element that locks page scrolling while a dialog is open. `script-src
    'self'` and every other directive are unchanged. API, asset and health responses keep
    the static policy above. Rendered user content is sanitized and cannot carry a
    `<style>` element or a nonce.
  - The automated accessibility checker used by the end-to-end tests is test-only tooling
    and is never shipped.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`
    (`SAMEORIGIN` for the diagram renderer page only; see [Diagrams](#diagrams)).
- **Repository files:**
  - Images are served inline. SVG gets `Content-Security-Policy: sandbox`.
  - Everything else is served as an `attachment` download. Paths cannot leave the space folder.

## Image uploads

- **Who can upload:** users who can edit the space, as for saving (write permission on the
  repository). The antiforgery header is required.
- **Accepted content:** PNG, JPEG, GIF, WebP and SVG, checked from the file's bytes rather
  than its name or the browser's content type. The stored extension follows the detected
  format. Anything else is rejected.
- **Limits:** `Copernica__Attachments__MaxBytes` per image (default 10 MB). A user's unsaved
  images may take at most `Copernica__Attachments__MaxPendingBytesPerUser` (default 200 MB).
- **Before saving:** an image is visible only to the user who added it (`no-store`). SVG is
  served with `Content-Security-Policy: sandbox`, as SVG files from repositories are.
- **After saving:** images are ordinary repository files. They are committed in the page's
  save commit, never overwrite an existing file, and are stored inside the space.
- **No outbound requests:** images referenced by web addresses are never downloaded.

## Diagrams

Mermaid diagram blocks (` ```mermaid ` and Azure DevOps `::: mermaid`) are the one place
where user content is drawn in the browser (constitution v1.3.0):

- **Server markup:** the server emits the diagram text HTML-escaped inside a sanitized
  `<figure>`, with metadata in `data-diagram*` attributes. Click links in diagrams go through
  the same link rules as text links and are listed as plain links; `javascript:`, `data:`
  and links that leave the space are dropped, and `call` handlers are ignored. Comments in
  discussions never draw diagrams.
- **Isolated renderer:** the text is drawn by Mermaid in `/diagram-renderer.html`, loaded in
  a hidden `<iframe sandbox="allow-scripts">` **without** `allow-same-origin`. The frame has
  an opaque origin: no access to the wiki's cookies, storage, page or API. The page is served
  with its own policy:
  `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`.
  It has no network access, no `eval` and no inline scripts. `'unsafe-inline'` styles apply
  inside the frame only.
- **Mermaid configuration:** `securityLevel: 'strict'`, no HTML labels, limits on text size
  (20 000 characters) and edges (500). Diagrams cannot change these with `%%{init}%%`
  directives.
- **Image-only display:** the wiki accepts messages only from that frame and shows the result
  only as `<img src="data:image/svg+xml,…">`. It is never inserted into the page as markup;
  an image document cannot run scripts or load resources.
- **Assets:** bundle files under `/assets` carry `Access-Control-Allow-Origin: *`, so the
  opaque-origin frame can load its module scripts. They are public, content-hashed static
  code sent without credentials. Pages and API responses never carry the header.

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

**Mermaid** 11.17.2 (MIT) draws diagrams, only inside the isolated renderer. Its dependency
**DOMPurify** is dual-licensed MPL-2.0 or Apache-2.0 and is used under **Apache-2.0**.
Mermaid 12 is not used: it depends on elkjs (EPL-2.0).

**libgit2** (bundled with LibGit2Sharp) is licensed under **GPLv2 with a linking exception**.
It is used unmodified as a dynamically loaded native library, which the exception permits.
The project constitution (Principle IV) explicitly allows this.
