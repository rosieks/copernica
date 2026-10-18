// Messages between the wiki UI and the isolated diagram renderer frame
// (specs/004-mermaid-diagrams/contracts/renderer.md).

export const MAX_SOURCE_LENGTH = 20000;
export const MAX_ERROR_LENGTH = 300;

/** CSS colours of the current theme, read from the design tokens. */
export interface ThemeTokens {
  dark: boolean;
  background: string;
  text: string;
  mutedText: string;
  border: string;
  primary: string;
  primarySubtle: string;
  subtle: string;
}

export interface RenderRequest {
  type: 'render';
  id: string;
  source: string;
  theme: ThemeTokens;
}

export interface Ready {
  type: 'ready';
}

export interface Rendered {
  type: 'rendered';
  id: string;
  svg: string;
}

export interface RenderError {
  type: 'error';
  id: string;
  message: string;
}

export type RendererMessage = Ready | Rendered | RenderError;

const THEME_KEYS = ['background', 'text', 'mutedText', 'border', 'primary', 'primarySubtle', 'subtle'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A message from the renderer frame: right sender and a known shape. Unknown fields are ignored. */
export function isRendererMessage(event: MessageEvent, frameWindow: Window | null | undefined): event is MessageEvent<RendererMessage> {
  if (!frameWindow || event.source !== frameWindow) return false;
  const data: unknown = event.data;
  if (!isObject(data)) return false;
  switch (data.type) {
    case 'ready':
      return true;
    case 'rendered':
      return typeof data.id === 'string' && typeof data.svg === 'string';
    case 'error':
      return typeof data.id === 'string' && typeof data.message === 'string';
    default:
      return false;
  }
}

/** A render request from the parent page (checked inside the frame). */
export function isRenderRequest(data: unknown): data is RenderRequest {
  if (!isObject(data) || data.type !== 'render') return false;
  if (typeof data.id !== 'string' || typeof data.source !== 'string') return false;
  const theme = data.theme;
  return isObject(theme) && typeof theme.dark === 'boolean' && THEME_KEYS.every((key) => typeof theme[key] === 'string');
}
