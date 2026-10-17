import { describe, expect, it } from 'vitest';
import cases from '../../../../tests/fixtures/anchoring/cases.json';
import expected from '../../../../tests/fixtures/anchoring/expected.json';
import { anchorFromSelection, rangesForOffsets } from './textAnchor';

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
