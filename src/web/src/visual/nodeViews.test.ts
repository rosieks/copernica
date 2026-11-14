import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Schemas } from '../api/client';
import { parse, serialize } from './markdown';
import { createNodeViews, type NodeViewContext } from './nodeViews';

let views: EditorView[] = [];
afterEach(() => {
  views.forEach((v) => v.destroy());
  views = [];
});

const PAGE = '---\ntitle: Release process\nstatus: deprecated\n---\n\n# Release\n\nText.\n';

function frontMatter(overrides: Partial<Schemas['FrontMatter']> = {}): Schemas['FrontMatter'] {
  return {
    readable: true,
    raw: null,
    title: 'Release process',
    description: 'How we release.',
    tags: ['release', 'ci'],
    status: 'deprecated',
    owners: ['Platform team'],
    authors: [],
    aliases: [],
    properties: [
      { name: 'weight', value: { kind: 'text', text: '20' } },
      { name: 'reviewed', value: { kind: 'text', text: '2026-09-01' } },
    ],
    ...overrides,
  };
}

function setup(markdown: string, ctx: Partial<NodeViewContext> = {}) {
  const { doc, snapshot } = parse(markdown);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc }),
    nodeViews: createNodeViews({ spaceId: 'handbook', pagePath: 'ops/release.md', pending: () => [], ...ctx }),
  });
  views.push(view);
  return { view, card: view.dom.querySelector<HTMLElement>('.visual-front-matter'), markdown: () => serialize(view.state.doc, snapshot) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('front matter card (010 US4)', () => {
  it('is a read-only group with the fields from the server', async () => {
    const loadFrontMatter = vi.fn().mockResolvedValue(frontMatter());
    const { card, markdown } = setup(PAGE, { loadFrontMatter });

    expect(card).not.toBeNull();
    expect(card!.getAttribute('role')).toBe('group');
    expect(card!.getAttribute('aria-label')).toBe('Page metadata, can be edited in Markdown mode');
    expect(card!.contentEditable).toBe('false');
    expect(card!.textContent).toContain('Loading page metadata…');
    expect(loadFrontMatter).toHaveBeenCalledWith('---\ntitle: Release process\nstatus: deprecated\n---');

    await flush();
    const text = card!.textContent;
    expect(text).toContain('Release process');
    expect(text).toContain('Deprecated');
    expect(text).toContain('How we release.');
    expect(text).toContain('release, ci');
    expect(text).toContain('Platform team');
    expect(text).toContain('2 more properties');
    expect(markdown()).toBe(PAGE);
  });

  it('says when the metadata could not be read', async () => {
    const { card } = setup(PAGE, { loadFrontMatter: vi.fn().mockResolvedValue(frontMatter({ readable: false, raw: 'x' })) });

    await flush();
    expect(card!.textContent).toContain("This page's metadata could not be read.");
  });

  it('falls back to the generic placeholder when the request fails', async () => {
    const { card } = setup(PAGE, { loadFrontMatter: vi.fn().mockRejectedValue(new Error('offline')) });

    await flush();
    expect(card!.querySelector('code')?.textContent).toBe('---');
  });

  it('shows hostile values as text', async () => {
    const { card } = setup(PAGE, {
      loadFrontMatter: vi.fn().mockResolvedValue(frontMatter({ title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' })),
    });

    await flush();
    expect(card!.textContent).toContain('<script>alert(1)</script>');
    expect(card!.querySelector('script, img')).toBeNull();
  });

  it('switches to Markdown mode from its button', () => {
    const onEditInMarkdown = vi.fn();
    const { card, markdown } = setup(PAGE, { loadFrontMatter: vi.fn().mockResolvedValue(frontMatter()), onEditInMarkdown });

    const button = card!.querySelector('button')!;
    expect(button.textContent).toBe('Edit in Markdown mode');
    button.click();
    expect(onEditInMarkdown).toHaveBeenCalledOnce();
    expect(markdown()).toBe(PAGE);
  });

  it('leaves other unsupported blocks as generic placeholders', () => {
    const { view } = setup('<div>raw</div>\n', { loadFrontMatter: vi.fn() });

    expect(view.dom.querySelector('.visual-front-matter')).toBeNull();
    expect(view.dom.querySelector('.visual-raw')).not.toBeNull();
  });
});
