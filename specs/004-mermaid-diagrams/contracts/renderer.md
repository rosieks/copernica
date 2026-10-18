# Renderer Contract: Isolated Diagram Renderer

The page that draws diagrams, how it is served, and the messages between it and the wiki
UI. Design: [research.md](../research.md) R1, R3 and R4.

## Page

- **URL**: `/diagram-renderer.html`. It is a static entry of the SPA build, embedded like the
  other assets and served by the SPA host without authentication. It contains no data,
  only code.
- **Embedding**: the wiki UI creates one hidden frame, lazily, the first time a page or
  preview contains a figure with `data-diagram="mermaid"`:

  ```html
  <iframe class="diagram-renderer" src="/diagram-renderer.html"
          sandbox="allow-scripts" aria-hidden="true" tabindex="-1" title=""></iframe>
  ```

  `allow-same-origin` is never set, so the frame has an opaque origin: no access to the
  wiki's cookies, storage, DOM or API.

## Response headers

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `no-cache` (its scripts are content-hashed assets) |
| `X-Frame-Options` | `SAMEORIGIN` (every other response keeps `DENY`) |

Bundle assets (`/assets/*`) always get `Access-Control-Allow-Origin: *`, so the
opaque-origin renderer (`Origin: null`) can load its module scripts. It is sent on every asset
response, not only on requests with `Origin: null`: the wiki page and the renderer share
chunks, and a cached `immutable` copy fetched by the page without the header would block the
renderer. Assets are public, content-hashed and sent without credentials. Pages and the API
never get the header.

Every other response keeps its current policy. The SPA shell keeps 002's per-request style
nonce.

## Messages

All messages are structured-clone objects.

**Wiki UI → renderer**, with target origin `'*'` (the frame's origin is opaque):

```ts
{ type: 'render', id: string, source: string, theme: ThemeTokens }
// ThemeTokens: { dark: boolean, background, text, mutedText, border, primary, primarySubtle, subtle: string /* CSS colours */ }
```

**Renderer → wiki UI**, sent to `window.parent`:

```ts
{ type: 'ready' }                                  // once, after Mermaid has loaded
{ type: 'rendered', id: string, svg: string }      // SVG document text
{ type: 'error', id: string, message: string }     // Mermaid's parse error, ≤ 300 chars
```

**Validation:**
- The UI accepts messages only when `event.source === frame.contentWindow` and the `id` is
  pending.
- The renderer accepts messages only when `event.source === window.parent` and
  `type === 'render'`.
- Unknown fields are ignored.
- `source` longer than 20 000 characters is refused with an error message.

## Mermaid configuration (inside the renderer)

```js
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  maxTextSize: 20000,
  maxEdges: 500,
  secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'htmlLabels'],
  theme: 'base',
  themeVariables: /* from ThemeTokens */,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
});
```

The `secure` keys cannot be changed by `%%{init: …}%%` directives in a diagram.

## Display (wiki UI)

- The SVG text is shown only as
  `<img src="data:image/svg+xml;charset=utf-8,<encoded>" alt="<name>. <description>">`. It is
  never parsed into the wiki document.
- An image document cannot run scripts or load external resources. `img-src 'self' data:`
  is already allowed by the wiki's CSP.
