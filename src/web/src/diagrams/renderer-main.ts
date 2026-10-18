// Runs inside the sandboxed, opaque-origin renderer frame only (contracts/renderer.md).
// It turns diagram text into SVG text and posts it back; the wiki shows it as an image.
import mermaid, { type MermaidConfig } from 'mermaid';
import { MAX_ERROR_LENGTH, MAX_SOURCE_LENGTH, isRenderRequest, type RenderError, type Rendered, type ThemeTokens } from './protocol';

const HEX = /^#[0-9a-f]{6}$/i;

function themeVariables(theme: ThemeTokens): Record<string, string | boolean> {
  const colours: Record<string, string> = {
    background: theme.background,
    mainBkg: theme.primarySubtle,
    primaryColor: theme.primarySubtle,
    primaryTextColor: theme.text,
    primaryBorderColor: theme.primary,
    secondaryColor: theme.subtle,
    tertiaryColor: theme.background,
    lineColor: theme.mutedText,
    textColor: theme.text,
    noteBkgColor: theme.subtle,
    noteTextColor: theme.text,
    noteBorderColor: theme.border,
  };
  // Mermaid derives shades from these and fails on colours it cannot parse; leave those to the theme.
  const variables: Record<string, string | boolean> = { darkMode: theme.dark };
  for (const [name, value] of Object.entries(colours)) {
    if (HEX.test(value)) variables[name] = value;
  }

  return variables;
}

function configure(theme: ThemeTokens) {
  const config: MermaidConfig = {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    maxTextSize: MAX_SOURCE_LENGTH,
    maxEdges: 500,
    // Diagrams cannot change these through %%{init: …}%% directives.
    secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'htmlLabels'],
    theme: 'base',
    themeVariables: themeVariables(theme),
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  };
  mermaid.initialize(config);
}

/**
 * Makes Mermaid output loadable as an image (well-formed XML, fixed size). Mermaid sizes the
 * SVG with `width="100%"` and a `max-width` style, which gives an image no intrinsic size;
 * fixed dimensions from the viewBox let the wiki show it at its natural width.
 */
function asImage(svg: string): string {
  // Click links come out as `xlink:href` without the namespace declaration, which is not
  // well-formed XML and would not load as an image.
  if (svg.includes('xlink:') && !/^<svg[^>]*\sxmlns:xlink=/.test(svg)) {
    svg = svg.replace(/^<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (root.nodeName !== 'svg' || document.querySelector('parsererror')) {
    throw new Error('The drawn diagram is not a valid image.');
  }

  const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || box.some((n) => !Number.isFinite(n))) return svg;
  const [, , width, height] = box as [number, number, number, number];
  if (width <= 0 || height <= 0) return svg;
  root.setAttribute('width', String(Math.ceil(width)));
  root.setAttribute('height', String(Math.ceil(height)));
  root.style.removeProperty('max-width');
  return new XMLSerializer().serializeToString(root);
}

let themeKey = '';

function reply(message: Rendered | RenderError) {
  window.parent.postMessage(message, '*');
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || !isRenderRequest(event.data)) return;
  const { id, source, theme } = event.data;
  if (source.length > MAX_SOURCE_LENGTH) {
    reply({ type: 'error', id, message: 'Diagram source is too large.' });
    return;
  }

  const key = JSON.stringify(theme);
  if (key !== themeKey) {
    configure(theme);
    themeKey = key;
  }

  const elementId = 'd' + id.replace(/[^a-z0-9]/gi, '');
  mermaid
    .render(elementId, source)
    .then(({ svg }) => reply({ type: 'rendered', id, svg: asImage(svg) }))
    .catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      reply({ type: 'error', id, message: text.trim().slice(0, MAX_ERROR_LENGTH) || 'Unknown error.' });
    })
    .finally(() => {
      // Mermaid can leave its temporary elements behind after a parse error.
      document.getElementById(elementId)?.remove();
      document.getElementById('d' + elementId)?.remove();
    });
});

window.parent.postMessage({ type: 'ready' }, '*');
