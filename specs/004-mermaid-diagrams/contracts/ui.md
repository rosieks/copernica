# UI Contract: Diagrams

Extends the page view (S3), version view and editor preview (S4) of
[002 ui.md](../../002-accessible-wiki-ui/contracts/ui.md). All 002 rules apply (tokens,
`ui/` wrappers, keyboard, accessibility acceptance).

## Diagram figure states

| State | Shown | Source `<pre>` |
|-------|-------|----------------|
| **Loading** | A `Skeleton` box with a fixed height (8 rem) and the text "Drawing diagram…" (muted, `role="status"` once per page, not per diagram) | Hidden |
| **Drawn** | The image at its natural width, scaled down to the column when wider, centred; a small toolbar above it, aligned right: `Button size="sm" variant="ghost"` **"Show full size"** / **"Fit to width"** (only while the image is wider than the column) and **"Show diagram source"** | Hidden (still in the DOM for anchoring) |
| **Showing source** | The source `<pre>` (styled like other code blocks); the toolbar button reads **"Show diagram"** (`aria-expanded="true"`) | Visible |
| **Error** | A warning `Callout`: "This diagram could not be drawn." plus the renderer's message in muted text | Visible |
| **Too large** | A warning `Callout`: "This diagram is too large to draw (over 20 000 characters)." | Visible |
| **No JavaScript / renderer unavailable** | Only the source | Visible |

The "Links in this diagram" list, when present, is shown under the figure in every state,
as a compact list with `--text-sm`.

## Layout

- The figure has `margin: var(--space-5) 0`, `overflow-x: auto` and `max-width: 100%`, so
  only the diagram scrolls horizontally (FR-011, 002 FR-009).
- The image has `max-width: 100%; height: auto`, with its width from the SVG and a light
  `--color-image-card` background only in the error and loading states.
- It sits in `.prose`, so the page reading width applies. Wider diagrams are scaled to fit.
- **"Show full size"** adds `diagram--full-size` to the figure, which sets the image to
  `max-width: none`; the figure then scrolls. The button then reads **"Fit to width"** and
  keeps focus. It is shown only while the image's natural width exceeds the figure's width
  (checked on load and on resize) and hidden while the source is shown.

## Theme

- Diagrams are drawn with the current theme's token colours.
- When the OS theme changes (`html.dark` toggles), all drawn diagrams on the page are
  redrawn. Cached per theme, they switch instantly the second time.

## Keyboard and accessibility

- The image is not focusable. The toolbar button is in the normal tab order.
- `alt` is `"<name>"`, or `"<name>. <description>"`. A drawn diagram is announced as an
  image with that name (FR-012).
- The toggle keeps focus on itself. Its label and `aria-expanded` change.
- The loading status is announced once per page view ("Drawing diagrams…") and completion
  is not announced, to avoid noise. Errors are visible callouts in the reading order.

## Discussions

- Text inside a drawn diagram cannot be selected. The selection popover (002 US4) only
  works on visible text, including the source while it is shown.
- Highlights of discussions anchored inside a hidden source are not shown. Their threads
  stay listed in the panel.
