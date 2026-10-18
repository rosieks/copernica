import { describe, expect, it } from 'vitest';
import cases from '../../../../tests/fixtures/anchoring/cases.json';
import expected from '../../../../tests/fixtures/anchoring/expected.json';
import { anchorFromSelection, anchorText, rangesForOffsets } from './textAnchor';

function article(html: string): HTMLElement {
  const el = document.createElement('article');
  el.innerHTML = html;
  document.body.replaceChildren(el);
  return el;
}

describe('plain text parity with the server', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(article(c.html).textContent).toBe((expected as Record<string, string>)[c.name]);
    });
  }
});

describe('anchors', () => {
  it('converts a selection across elements to offsets and back', () => {
    const root = article('<h1>Title</h1>\n<p>First <strong>bold</strong> text.</p>\n');
    const strong = root.querySelector('strong')!.firstChild!;
    const p = root.querySelector('p')!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 2); // "rst "
    range.setEnd(strong, 4);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const anchor = anchorFromSelection(root, selection)!;

    expect(anchor.exact).toBe('rst bold');
    expect(root.textContent!.slice(anchor.start, anchor.end)).toBe('rst bold');
    expect(anchor.prefix).toBe('Title\nFi');
    expect(anchor.suffix).toBe(' text.\n');
    const ranges = rangesForOffsets(root, anchor.start, anchor.end);
    expect(ranges.map((r) => r.toString()).join('')).toBe('rst bold');
  });

  it('trims whitespace around the selection', () => {
    const root = article('<p>alpha beta gamma</p>');
    const text = root.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 5);
    range.setEnd(text, 11);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(anchorFromSelection(root, selection)!.exact).toBe('beta');
  });

  it('leaves out UI marked data-anchor-skip', () => {
    const root = article(
      '<p>Before</p>\n<figure><div data-anchor-skip=""><button>Show diagram source</button><p>Drawing diagram…</p></div>' +
        '<pre hidden><code>graph TD\n</code></pre></figure>\n<p>After text</p>\n',
    );
    const after = root.querySelectorAll('p')[2]!;
    const range = document.createRange();
    range.setStart(after, 0); // element boundary, not a text node
    range.setEnd(after.firstChild!, 5);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const anchor = anchorFromSelection(root, selection)!;

    expect(anchorText(root)).toBe('Before\ngraph TD\n\nAfter text\n');
    expect(anchor.exact).toBe('After');
    expect(anchor.start).toBe('Before\ngraph TD\n\n'.length);
    expect(anchor.prefix).not.toContain('Drawing');
    expect(rangesForOffsets(root, anchor.start, anchor.end).map((r) => r.toString()).join('')).toBe('After');
  });

  it('ignores selections inside skipped UI', () => {
    const root = article('<p>Text</p><div data-anchor-skip=""><span>Toolbar label</span></div>');
    const range = document.createRange();
    range.selectNodeContents(root.querySelector('span')!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(anchorFromSelection(root, selection)).toBeUndefined();
  });

  it('ignores selections outside the article', () => {
    const root = article('<p>inside</p>');
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.append(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(anchorFromSelection(root, selection)).toBeUndefined();
  });
});
