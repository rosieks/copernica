import { MAX_SOURCE_LENGTH, isRendererMessage, type RenderRequest, type ThemeTokens } from './protocol';

export const RENDER_TIMEOUT_MS = 10000;
export const RENDERER_URL = '/diagram-renderer.html';

/** The frame the renderer runs in; a seam for tests. */
export interface RendererFrame {
  readonly window: Window | null;
  remove(): void;
}

interface Job {
  id: string;
  key: string;
  source: string;
  theme: ThemeTokens;
  resolve(svg: string): void;
  reject(error: Error): void;
}

/** Hidden, sandboxed, opaque-origin frame (contracts/renderer.md, Embedding). */
function createHiddenFrame(): RendererFrame {
  const frame = document.createElement('iframe');
  frame.className = 'diagram-renderer';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.title = '';
  frame.src = RENDERER_URL;
  document.body.appendChild(frame);
  return {
    get window() {
      return frame.contentWindow;
    },
    remove: () => frame.remove(),
  };
}

/**
 * Sends diagram sources to the renderer frame one at a time and returns SVG text. Results are
 * cached per theme and source; an item that takes longer than the timeout is rejected and the
 * frame is replaced, so one stuck diagram does not hold up the rest.
 */
export class RendererClient {
  private frame: RendererFrame | null = null;
  private ready = false;
  private readonly queue: Job[] = [];
  private current: Job | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly cache = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<string>>();
  private nextId = 0;
  private listening = false;

  constructor(
    private readonly createFrame: () => RendererFrame = createHiddenFrame,
    private readonly timeoutMs = RENDER_TIMEOUT_MS,
  ) {}

  /** SVG text for the source, drawn with the theme colours. */
  render(source: string, theme: ThemeTokens): Promise<string> {
    if (source.length > MAX_SOURCE_LENGTH) {
      return Promise.reject(new Error('Diagram source is too large.'));
    }

    const key = `${theme.dark}\u0000${source}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = new Promise<string>((resolve, reject) => {
      this.queue.push({ id: String(++this.nextId), key, source, theme, resolve, reject });
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    this.ensureFrame();
    this.pump();
    return promise;
  }

  /** Handles a `message` event; only messages from the current frame are accepted. */
  handleMessage = (event: MessageEvent): void => {
    if (!isRendererMessage(event, this.frame?.window)) return;
    const message = event.data;
    if (message.type === 'ready') {
      this.ready = true;
      // A job may already be waiting for the frame to load.
      if (this.current) this.send();
      else this.pump();
      return;
    }

    const job = this.current;
    if (!job || message.id !== job.id) return;
    this.finish();
    if (message.type === 'rendered') {
      this.cache.set(job.key, message.svg);
      job.resolve(message.svg);
    } else {
      job.reject(new Error(message.message));
    }

    this.pump();
  };

  private ensureFrame() {
    if (!this.listening) {
      window.addEventListener('message', this.handleMessage);
      this.listening = true;
    }

    if (!this.frame) {
      this.ready = false;
      this.frame = this.createFrame();
    }
  }

  private pump() {
    if (this.current || this.queue.length === 0) return;
    this.ensureFrame();
    const job = this.queue.shift()!;
    this.current = job;
    // The timeout covers waiting for the frame to load, too.
    this.timer = setTimeout(() => this.timeOut(job), this.timeoutMs);
    this.send();
  }

  private send() {
    const job = this.current;
    if (!job || !this.ready) return;
    const request: RenderRequest = { type: 'render', id: job.id, source: job.source, theme: job.theme };
    // The frame's origin is opaque, so no narrower target origin exists.
    this.frame?.window?.postMessage(request, '*');
  }

  private timeOut(job: Job) {
    if (this.current !== job) return;
    this.finish();
    this.frame?.remove();
    this.frame = null;
    this.ready = false;
    job.reject(new Error('Timed out'));
    this.pump();
  }

  private finish() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.current = null;
  }
}

let shared: RendererClient | null = null;

export function rendererClient(): RendererClient {
  shared ??= new RendererClient();
  return shared;
}
