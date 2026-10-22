import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { filterPages, flattenPages, MAX_RESULTS, relativeLink } from './LinkDialog';
import { linkAt, removeLinkCommand, setLinkCommand } from './links';
import { parse, serialize } from './markdown';

const tree = {
  name: '',
  path: '',
  kind: 'folder' as const,
  children: [
    { name: 'index.md', path: 'index.md', title: 'Home', kind: 'page' as const },
    {
      name: 'guides',
      path: 'guides',
      kind: 'folder' as const,
      children: [
        { name: 'Set-up-VPN.md', path: 'guides/Set-up-VPN.md', title: 'Set up VPN', kind: 'page' as const },
        { name: 'my page.md', path: 'guides/my page.md', title: null, kind: 'page' as const },
      ],
    },
    { name: 'reference', path: 'reference', kind: 'folder' as const, children: [{ name: 'api.md', path: 'reference/api.md', title: 'API', kind: 'page' as const }] },
  ],
};

describe('page picker (contracts/ui.md §6)', () => {
  it('lists pages with their titles, falling back to the file name', () => {
    expect(flattenPages(tree).map((p) => p.title)).toEqual(['Home', 'Set up VPN', 'my page', 'API']);
  });

  it('filters by title and path, case-insensitively', () => {
    const pages = flattenPages(tree);
    expect(filterPages(pages, 'vpn').map((p) => p.path)).toEqual(['guides/Set-up-VPN.md']);
    expect(filterPages(pages, 'REFERENCE').map((p) => p.title)).toEqual(['API']);
    expect(filterPages(pages, '').length).toBe(4);
  });

  it(`shows at most ${MAX_RESULTS} results`, () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ title: `Page ${i}`, path: `p${i}.md` }));
    expect(filterPages(many, 'page')).toHaveLength(MAX_RESULTS);
  });
});

describe('relativeLink', () => {
  it.each([
    ['guides/a.md', 'reference/api.md', '../reference/api.md'],
    ['guides/a.md', 'guides/b.md', 'b.md'],
    ['index.md', 'guides/Set-up-VPN.md', 'guides/Set-up-VPN.md'],
    ['a/b/c.md', 'index.md', '../../index.md'],
    ['index.md', 'guides/my page.md', 'guides/my%20page.md'],
  ])('from %s to %s is %s', (from, to, expected) => {
    expect(relativeLink(from, to)).toBe(expected);
  });
});

describe('link commands', () => {
  let view: EditorView | null = null;
  afterEach(() => view?.destroy());

  function setup(markdown: string, from: number, to = from) {
    const { doc, snapshot } = parse(markdown);
    view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    return { v: view, markdown: () => serialize(view!.state.doc, snapshot) };
  }

  it('inserts the page title as a link when nothing is selected', () => {
    const { v, markdown } = setup('See it.\n', 5);
    setLinkCommand('guides/Set-up-VPN.md', 'Set up VPN')(v.state, v.dispatch);
    expect(markdown()).toBe('See [Set up VPN](guides/Set-up-VPN.md)it.\n');
  });

  it('links the selected text', () => {
    const { v, markdown } = setup('Read the guide now.\n', 10, 15);
    setLinkCommand('https://example.com', 'unused')(v.state, v.dispatch);
    expect(markdown()).toBe('Read the [guide](https://example.com) now.\n');
  });

  it('changes and removes an existing link, keeping its text', () => {
    const { v, markdown } = setup('A [link](old.md) here.\n', 5);
    expect(linkAt(v.state)?.mark.attrs.href).toBe('old.md');
    setLinkCommand('new.md', 'x')(v.state, v.dispatch);
    expect(markdown()).toBe('A [link](new.md) here.\n');
    removeLinkCommand(v.state, v.dispatch);
    expect(markdown()).toBe('A link here.\n');
  });
});
