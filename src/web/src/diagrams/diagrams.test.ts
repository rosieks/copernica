import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagramAltText, svgImageSrc } from './display';
import { isRenderRequest, isRendererMessage, type RenderRequest, type ThemeTokens } from './protocol';
import { RendererClient, type RendererFrame } from './rendererClient';

const light: ThemeTokens = {
  dark: false,
  background: '#ffffff',
  text: '#111111',
  mutedText: '#555555',
  border: '#cccccc',
  primary: '#3e63dd',
  primarySubtle: '#edf2fe',
  subtle: '#f9f9fb',
};
const dark: ThemeTokens = { ...light, dark: true, background: '#111111', text: '#eeeeee' };

function message(source: unknown, data: unknown): MessageEvent {
  return { source, data } as MessageEvent;
}

/** A fake frame that records requests; the test answers them through `handleMessage`. */
function fakeFrame() {
  const sent: RenderRequest[] = [];
  const win = { postMessage: vi.fn((request: RenderRequest) => sent.push(request)) } as unknown as Window;
  const frame: RendererFrame & { removed: boolean } = {
    window: win,
    removed: false,
    remove() {
      this.removed = true;
    },
  };
  return { frame, win, sent };
}

describe('isRendererMessage', () => {
  const frameWindow = {} as Window;

  it('accepts known messages from the frame', () => {
    expect(isRendererMessage(message(frameWindow, { type: 'ready' }), frameWindow)).toBe(true);
    expect(isRendererMessage(message(frameWindow, { type: 'rendered', id: '1', svg: '<svg/>', extra: 1 }), frameWindow)).toBe(true);
    expect(isRendererMessage(message(frameWindow, { type: 'error', id: '1', message: 'Parse error' }), frameWindow)).toBe(true);
  });

  it('ignores other windows', () => {
    expect(isRendererMessage(message({} as Window, { type: 'ready' }), frameWindow)).toBe(false);
    expect(isRendererMessage(message(window, { type: 'ready' }), frameWindow)).toBe(false);
    expect(isRendererMessage(message(frameWindow, { type: 'ready' }), null)).toBe(false);
  });

  it('ignores malformed data', () => {
    for (const data of [null, 'ready', 42, {}, { type: 'rendered', id: 1, svg: '' }, { type: 'rendered', id: '1' }, { type: 'error', id: '1' }, { type: 'other' }]) {
      expect(isRendererMessage(message(frameWindow, data), frameWindow)).toBe(false);
    }
  });
});

describe('isRenderRequest', () => {
  it('needs an id, a source and a full theme', () => {
    expect(isRenderRequest({ type: 'render', id: '1', source: 'graph TD', theme: light })).toBe(true);
    expect(isRenderRequest({ type: 'render', id: '1', source: 'graph TD', theme: { dark: false } })).toBe(false);
    expect(isRenderRequest({ type: 'render', id: '1', theme: light })).toBe(false);
    expect(isRenderRequest({ type: 'rendered', id: '1', source: '', theme: light })).toBe(false);
  });
});

describe('RendererClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for ready, then renders one item at a time in order', async () => {
    const { frame, win, sent } = fakeFrame();
    const client = new RendererClient(() => frame);

    const first = client.render('graph A', light);
    const second = client.render('graph B', light);
    expect(sent).toHaveLength(0);

    client.handleMessage(message(win, { type: 'ready' }));
    expect(sent.map((r) => r.source)).toEqual(['graph A']);

    client.handleMessage(message(win, { type: 'rendered', id: sent[0]!.id, svg: '<svg>A</svg>' }));
    expect(sent.map((r) => r.source)).toEqual(['graph A', 'graph B']);
    client.handleMessage(message(win, { type: 'error', id: sent[1]!.id, message: 'Parse error on line 1' }));

    await expect(first).resolves.toBe('<svg>A</svg>');
    await expect(second).rejects.toThrow('Parse error on line 1');
  });

  it('ignores answers from other windows and for other ids', async () => {
    const { frame, win, sent } = fakeFrame();
    const client = new RendererClient(() => frame);
    const result = client.render('graph A', light);
    client.handleMessage(message(win, { type: 'ready' }));

    client.handleMessage(message({} as Window, { type: 'rendered', id: sent[0]!.id, svg: '<svg>evil</svg>' }));
    client.handleMessage(message(win, { type: 'rendered', id: 'other', svg: '<svg>other</svg>' }));
    client.handleMessage(message(win, { type: 'rendered', id: sent[0]!.id, svg: '<svg>A</svg>' }));

    await expect(result).resolves.toBe('<svg>A</svg>');
  });

  it('caches by theme and source', async () => {
    const { frame, win, sent } = fakeFrame();
    const client = new RendererClient(() => frame);
    const answer = () => client.handleMessage(message(win, { type: 'rendered', id: sent.at(-1)!.id, svg: `<svg>${sent.length}</svg>` }));

    const a = client.render('graph A', light);
    const again = client.render('graph A', light);
    client.handleMessage(message(win, { type: 'ready' }));
    answer();
    await expect(a).resolves.toBe('<svg>1</svg>');
    await expect(again).resolves.toBe('<svg>1</svg>');
    await expect(client.render('graph A', light)).resolves.toBe('<svg>1</svg>');

    const darkA = client.render('graph A', dark);
    answer();
    await expect(darkA).resolves.toBe('<svg>2</svg>');
    expect(sent).toHaveLength(2);
  });

  it('times out after 10 seconds and replaces the frame', async () => {
    const frames: ReturnType<typeof fakeFrame>[] = [];
    const client = new RendererClient(() => {
      frames.push(fakeFrame());
      return frames.at(-1)!.frame;
    });

    const stuck = client.render('graph A', light);
    const next = client.render('graph B', light);
    client.handleMessage(message(frames[0]!.win, { type: 'ready' }));
    const rejected = expect(stuck).rejects.toThrow('Timed out');

    vi.advanceTimersByTime(9999);
    expect(frames).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await rejected;

    expect(frames[0]!.frame.removed).toBe(true);
    expect(frames).toHaveLength(2);
    client.handleMessage(message(frames[1]!.win, { type: 'ready' }));
    expect(frames[1]!.sent.map((r) => r.source)).toEqual(['graph B']);
    client.handleMessage(message(frames[1]!.win, { type: 'rendered', id: frames[1]!.sent[0]!.id, svg: '<svg>B</svg>' }));
    await expect(next).resolves.toBe('<svg>B</svg>');
  });

  it('refuses sources over the limit without asking the frame', async () => {
    const { frame, sent } = fakeFrame();
    const client = new RendererClient(() => frame);

    await expect(client.render('x'.repeat(20001), light)).rejects.toThrow('too large');
    expect(sent).toHaveLength(0);
  });
});

describe('display', () => {
  it('shows SVG only as an encoded data URL', () => {
    const src = svgImageSrc('<svg xmlns="http://www.w3.org/2000/svg"><text>a & b #1</text></svg>');

    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(src).not.toContain('<');
    expect(src).not.toContain('#');
    expect(decodeURIComponent(src.slice('data:image/svg+xml;charset=utf-8,'.length))).toContain('<text>a & b #1</text>');
  });

  it('builds alt text from name and description', () => {
    expect(diagramAltText('Login sequence')).toBe('Login sequence');
    expect(diagramAltText('Login sequence', '')).toBe('Login sequence');
    expect(diagramAltText('Login sequence', 'How a user signs in')).toBe('Login sequence. How a user signs in');
    expect(diagramAltText('Login sequence.', 'How a user signs in')).toBe('Login sequence. How a user signs in');
  });
});
