# Research: Diagrams in Markdown Pages (Mermaid)

Decisions behind [plan.md](plan.md). Stack and rules come from the constitution and features
001–003.

## R1. Where diagrams are drawn (FR-001, FR-009)

Mermaid lays diagrams out by measuring text in a real DOM. That leaves three options.

| Option | How | Verdict |
|--------|-----|---------|
| A. Server-side | A headless browser or Node + mermaid-cli in the server | **Rejected.** A second runtime and a browser in the artifact break "single artifact", the minimal container and Principle IV. There is no maintained .NET Mermaid renderer |
| B. Client-side, in the page | Mermaid runs in the wiki document and its SVG is inserted into the page DOM | **Rejected.** User-derived markup would enter the wiki document outside the server sanitizer. That breaks the constitution ("the frontend MUST NOT render raw user HTML from any other source"), and Mermaid has had several XSS advisories |
| **C. Isolated renderer, shown as image** | Mermaid runs in a hidden, sandboxed iframe with an opaque origin and its own strict CSP. The parent sends diagram text and gets SVG text back, then shows it only as `<img src="data:image/svg+xml;…">`. It never parses it into the wiki DOM | **Chosen** |

**Why C is safe:**
- An SVG used as an image cannot run scripts, cannot load anything external (browsers block
  that in image documents), and cannot react to input.
- The renderer frame has an opaque origin (`sandbox="allow-scripts"` without
  `allow-same-origin`). It has no access to the wiki's cookies, storage or DOM, and its CSP
  forbids network access (R4).
- The wiki document only ever receives a string, which it turns into an image URL. Even a
  compromised Mermaid can, at worst, produce an inert wrong picture.

**Constitution:** the server still renders and sanitizes all page HTML in one place.
Diagram blocks leave the server as escaped source text inside a sanitized container (R2),
and the wiki document never renders user-derived markup. The current wording does not
foresee a client-side, isolated drawing step, so the plan proposes a **clarifying
amendment** (R9) instead of relying on interpretation (constitution: transparency).

## R2. Server output for diagram blocks (FR-001, FR-002, FR-004, FR-006, FR-012)

- **Decision**: the Markdig pipeline gets two renderers.
  - A `FencedCodeBlock` renderer for info string `mermaid`.
  - Markdig's **custom containers** (`UseCustomContainers()`) for Azure DevOps
    `::: mermaid` … `:::`, rendering containers whose info is `mermaid`.

  Both emit the same sanitizer-allowed structure
  ([contracts/rendering.md](contracts/rendering.md)):

  ```html
  <figure class="diagram" data-diagram="mermaid" data-diagram-type="flowchart" data-diagram-name="Order flow">
    <pre class="diagram__source"><code>…escaped source…</code></pre>
  </figure>
  ```

  - **Type**: the first keyword of the source (`flowchart`/`graph`, `sequenceDiagram`,
    `classDiagram`, `stateDiagram`/`-v2`, `erDiagram`, `gantt`, `pie`, `gitGraph`, …) maps
    to a readable type ("Flowchart", "Sequence", …). Unknown → "Mermaid".
  - **Name** (FR-012): Mermaid's `accTitle:` line, otherwise `title` (gantt, pie, …),
    otherwise "<Type> diagram". `accDescr:` (single line or `{…}` block) becomes
    `data-diagram-description`.
  - **Size limit** (FR-006): sources above **20 000 characters** get
    `data-diagram-too-large="true"` and are never sent to the renderer. Mermaid's own
    limits (`maxTextSize` 20 000, `maxEdges` 500) are set in the renderer as a second line
    of defence.
  - **Links in diagrams** (FR-007): `click <id> "<url>"` / `click <id> href "<url>"`
    statements are extracted on the server. Their targets go through the same
    `WikiLinkRewriter` as text links (page routes, `wiki:`, http(s); others dropped) and
    are emitted as a "Links in this diagram" list under the figure. The drawn image itself
    is not interactive. Mermaid's `securityLevel: 'strict'` ignores click handlers anyway.
- **Rationale**:
  - Everything that touches meaning (type, name, links, limits) is decided once, on the
    server, next to the sanitizer.
  - The figure is meaningful without JavaScript: you see the source.
  - It keeps 001's plain-text offsets for discussion anchoring intact (R6).

## R3. The renderer: messages and lifecycle

- **Decision**:
  - **The frame**: a static page `diagram-renderer.html` (separate Vite entry, built into
    the SPA bundle) loaded in one hidden
    `<iframe sandbox="allow-scripts" src="/diagram-renderer.html" title="" aria-hidden="true">`.
    It is created lazily, the first time a page or preview contains a diagram, and reused.
    Mermaid is only in this entry's chunk, so it is not part of the main bundle.
  - **Messages** (structured clone):
    - parent → frame: `{ type: 'render', id, source, theme }`;
    - frame → parent: `{ type: 'rendered', id, svg }` or `{ type: 'error', id, message }`.

    The parent posts with target origin `'*'` because the frame's origin is opaque. It
    accepts only messages whose `event.source` is the frame's `contentWindow`. The frame
    accepts only messages from `window.parent`.
  - **Display**: the parent sets `img.src = 'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(svg)`, and `img.alt` = `data-diagram-name` plus the description.
    `img-src 'self' data:` is already in the CSP (001), so no CSP change for the wiki
    document.
  - **Timeout**: 10 s per diagram. After that the figure shows the "could not be drawn"
    state.
  - **Queue**: one diagram at a time in document order, so the first diagrams appear
    first. Results are cached per `(source, theme)` for the session, which makes preview
    re-renders cheap.
- **Mermaid configuration** in the frame:
  - `startOnLoad: false`, `securityLevel: 'strict'`;
  - `htmlLabels: false`, so labels are SVG text; HTML in `<foreignObject>` is not rendered
    in image mode by every browser;
  - `maxTextSize: 20000`, `maxEdges: 500`;
  - `fontFamily` = the system font stack;
  - theme `'base'` with `themeVariables` taken from the design tokens sent by the parent
    (light or dark values, R5).

## R4. CSP for the renderer page (FR-008)

- **Decision**: the server serves `/diagram-renderer.html` with its own policy, replacing
  the SPA one:

  ```
  default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src data:; font-src 'none'; connect-src 'none'; frame-ancestors 'self';
  base-uri 'none'; form-action 'none'
  ```

  - `'unsafe-inline'` styles are needed because Mermaid creates `<style>` elements while
    laying out. They are confined to the sandboxed, opaque-origin document, which holds
    no user data and cannot reach the network (`connect-src`, `img-src`, `font-src`), so
    the risk does not reach the wiki.
  - `frame-ancestors 'self'` stops other sites from framing it.
  - The main SPA policy is **unchanged**.
- **Spike result (T004, Chromium, Firefox and WebKit)**:
  - `script-src 'self'` does match inside the sandboxed frame, so no nonce is needed.
  - The blocker was **CORS**. Module scripts load in CORS mode, and from the opaque origin
    (`Origin: null`) the bundle assets are cross-origin.
  - **Decision**: all `/assets/*` responses carry `Access-Control-Allow-Origin: *`. This is
    safe: these files are public, content-hashed static code, are served without
    authentication, and the request carries no credentials.
  - The first version sent the header only for `Origin: null`. It failed in e2e once the
    page and the renderer shared a chunk (`protocol`): the page's copy, cached as
    `immutable` without the header, was reused for the renderer's CORS request and blocked.
  - **Timing (e2e, `visuals/all-types.md`, 8 diagrams, local dev machine, 2026-10-18)**:

    | Browser | Page text | All diagrams, renderer cached | All diagrams, first visit |
    |---------|-----------|-------------------------------|---------------------------|
    | Chromium | 140–310 ms | 1.7 s | 3.6 s |
    | Firefox | 490–650 ms | 2.2 s | 5.1 s |
    | WebKit | 290–450 ms | 2.7 s | 4.1 s |

    The text never waits for diagrams. With the renderer cached (immutable assets), SC-002's
    3 s is met everywhere. On a first visit, 2–3.3 s of it is downloading the renderer, so
    SC-002 is **not met** for the very first diagram page. **Decision**: accept the slower
    first visit and do not prefetch. Prefetching while idle would cost every user about 2 MB
    once per release, including those who never open a diagram. After the first visit the
    renderer stays in the browser cache until the next release. Revisit if readers report
    it. D1 asserts the cached case in
    Chromium and Firefox. Playwright's WebKit on Windows varies between 2.7 and 3.5 s cached
    (1 of 5 runs over 3 s), so there D1 records the time as an annotation, not an assertion.
  - The renderer page itself is sent with `X-Frame-Options: SAMEORIGIN` instead of `DENY`.
    Its CSP also has `frame-ancestors 'self'`.

## R5. Theme, size and accessibility (FR-010–FR-013)

- **Theme**:
  - the parent reads the computed token values (`--color-bg`, `--color-text`,
    `--color-border`, `--color-accent-solid`, `--color-bg-subtle`,
    `--color-accent-subtle`, `--color-text-muted`) and sends them with each render;
  - the frame maps them to Mermaid `themeVariables` (`primaryColor`, `primaryTextColor`,
    `lineColor`, `background`, …);
  - when `html.dark` changes (002 `theme.ts`), visible diagrams are re-rendered from the
    cache key `(source, theme)`.

  Text colours come from tokens with AA contrast (002 R2).
- **Size** (FR-011):
  - the image is shown at the SVG's natural width (from its `viewBox`/`width`), scaled
    down to the column with `max-width: 100%`;
  - "Show full size" lifts the limit; the figure wrapper has `overflow-x: auto`, so only
    the diagram scrolls;
  - smaller diagrams are centred.
  - The first version always showed the natural width. On a real page, flowcharts,
    sequence diagrams and gantt charts were cut at the column edge and looked broken, so
    fitting is the default and scrolling is a choice.
- **Series colours**: with `theme: 'base'`, Mermaid derives pie slices, `cScale*` and git
  branch colours from `primaryColor`, so slices were barely distinguishable. The renderer
  sets them from Radix step 7 of twelve hues (light or dark scale), with the theme's text
  colour on top, `pieOpacity: 1` and the page background as the slice stroke.
- **Gantt axis**: the default `%Y-%m-%d` labels overlapped for a plan of a few weeks; the
  default is `%b %d`. A diagram's own `axisFormat` still applies.
- **Accessible name** (FR-012): `img alt` = name, plus ". " and the description when
  present.
- **Source toggle** (FR-013):
  - a `Button` ("Show diagram source" / "Show diagram") above the image toggles the hidden
    `<pre>`;
  - `aria-expanded` is set on the button and focus stays on it.

  Error, too-large and loading states also show the source, with a `Callout`-style message
  (002 tokens).

## R6. Discussions (001 US4) and anchoring

- **Finding**: 001 anchors discussions on plain-text offsets that the server computes from
  the HTML, and the client from the article DOM (`textAnchor.ts`). Replacing the `<pre>`
  with an image would shift the client's offsets.
- **Decision**: the `<pre class="diagram__source">` always stays in the DOM. When the
  diagram is drawn, it is hidden with a class (`hidden` attribute). DOM `textContent` and
  the client's text walker still include it, so offsets match the server.
  - Hidden text cannot be selected, so diagram text cannot be commented on while the
    diagram is drawn (spec edge case). With "Show diagram source" it can.
  - Highlights inside a hidden `<pre>` are not visible, and HighlightMarkers skips
    zero-size rectangles (002).
- **Test**: a discussion on text after a diagram stays anchored when the page reloads.

## R7. Dependencies and licences (Principle IV)

- **Decision**: `mermaid` **11.17.2** (MIT), pinned.
  - Probe install: 106 packages, all MIT, ISC, Apache-2.0, BSD-3-Clause or Unlicense.
  - Two need a known-licence note in `scripts/check-licenses.ps1`:
    - `dompurify` is "MPL-2.0 OR Apache-2.0"; we use it under Apache-2.0;
    - `khroma` has no `license` field; its LICENSE file is MIT.
  - No `new Function`/`eval` in the distributed chunks. This matters only for the frame,
    whose CSP has no `unsafe-eval`.
- **Rejected**: `mermaid` 12.x. It depends on **`elkjs` (EPL-2.0)** and ships the ELK
  layout as a lazy chunk in its distribution. EPL is copyleft and not allowed without an
  amendment. 11.x keeps ELK in the separate optional `@mermaid-js/layout-elk`, which we do
  not install. Before upgrading, re-check this in the task list.
- **Size**: about 5 MB of minified chunks in total; diagram types are split into lazy
  chunks. It is loaded only in the renderer frame and only on pages with diagrams.
  Main-bundle impact: about 1 KB of glue code.

## R8. Editor preview (FR-001, US2, SC-003)

- **Decision**:
  - The preview HTML comes from the server's `/api/render` (001/003), with the same figure
    markup.
  - After each preview update, a `useDiagrams(container)` hook finds the figures and
    requests drawings. Cached results make unchanged diagrams instant.
  - Errors show inline per diagram (FR-004). The editor is never blocked: rendering is
    asynchronous and outside the editor.
- **Debounce**: the existing 300 ms preview debounce (002) plus render time keeps SC-003
  (≤ 2 s) for typical diagrams.

## R9. Proposed constitution amendment (FR-009)

Proposed wording for **v1.3.0** (MINOR: it expands guidance), to be applied with
`/speckit-constitution` **before implementation**. It extends the Security section rule
"Markdown MUST be rendered to HTML and sanitized on the server, in one place…":

> **Diagram blocks** (e.g. Mermaid) MAY be drawn in the browser under these conditions:
> - the server still emits them as escaped source inside sanitized markup;
> - drawing happens in an isolated renderer: a sandboxed frame with an opaque origin, no
>   network access and its own restrictive CSP;
> - the result is displayed in the wiki document only as an image, never as markup.
>
> Any other client-side rendering of user content remains forbidden.

- **Rationale**: this states the exact boundary R1 relies on. Reviewers do not have to
  interpret the current wording, and future features cannot widen it silently.
- **Alternatives**: no amendment, arguing that C already complies (the wiki DOM never
  renders user markup). Rejected for transparency: the frame does render user content,
  just not in the wiki document.

## R10. Testing

- **Unit (xUnit)**:
  - fence and `:::` container recognition;
  - type and name extraction (`accTitle`, `title`, fallback);
  - `accDescr` single-line and block forms;
  - the too-large flag;
  - click-link extraction through `WikiLinkRewriter` (`javascript:` dropped);
  - sanitizer keeps the figure attributes and strips anything else;
  - plain text of a page with diagrams equals the DOM text.
- **Integration**: the renderer page is served with its own CSP. The SPA shell CSP is
  unchanged.
- **Vitest**:
  - message validation (wrong source window ignored);
  - queue, cache and timeout;
  - alt text;
  - toggle state.
- **Playwright** ([quickstart.md](quickstart.md)):
  - all FR-003 types drawn;
  - an ADO page;
  - an error and the too-large state;
  - the dark theme switch;
  - 320 px reflow;
  - keyboard toggle;
  - WCAG scan;
  - a security suite: diagrams with `<script>`, `click … call`, `javascript:` links,
    external image/font/style URLs, `%%{init}%%` overriding `securityLevel`. Expect no
    dialog, no script side effects and no request to another host (route interception
    logs all requests).
