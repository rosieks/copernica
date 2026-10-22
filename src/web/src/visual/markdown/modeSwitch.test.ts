import { describe, expect, it } from 'vitest';
import { corpusFiles } from './corpus';
import { blockPath, offsetForPath, positionForOffset } from './cursor';
import { isRoundTripSafe, parse, serialize } from './index';

/**
 * Mode switching (contracts/fidelity.md M1, M2; SC-004): text written in Markdown mode is kept
 * exactly as typed through a switch to visual mode and back.
 */

/** Deterministic edits of the kind someone makes in Markdown mode. */
function markdownEdits(text: string): string[] {
  const lines = text.split('\n');
  const middle = Math.floor(lines.length / 2);
  const insert = (at: number, added: string) => [...lines.slice(0, at), added, ...lines.slice(at)].join('\n');
  return [
    insert(middle, ''),
    insert(middle, '*hand typed*   text with  odd   spacing\\!'),
    insert(0, '<!-- a comment typed in Markdown mode -->\n'),
    text + '\n-   loose  item\n\n    indented code\n',
    text.replace(/\n/g, '\r\n'),
  ];
}

describe('mode switch keeps Markdown-mode text (M1)', () => {
  it('writes every edited corpus file back exactly', () => {
    const failures: string[] = [];
    let checked = 0;
    for (const file of corpusFiles().filter((_, i) => i % 7 === 0)) {
      for (const edited of markdownEdits(file.text)) {
        checked++;
        const { doc, snapshot } = parse(edited);
        if (serialize(doc, snapshot) !== edited) failures.push(file.name);
        expect(isRoundTripSafe(edited)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(400);
    expect(failures).toEqual([]);
  });
});

describe('cursor mapping (M2)', () => {
  const text = '# Title\n\n- one\n  - nested item\n\n| a | b |\n|---|---|\n| cell | x |\n\n<div>html</div>\n\nlast paragraph\n';

  function roundTrip(needle: string): string {
    const { doc, snapshot } = parse(text);
    let pos = -1;
    doc.descendants((node, p) => {
      if (pos < 0 && node.isText && node.text!.includes(needle)) pos = p + node.text!.indexOf(needle);
    });
    if (pos < 0) {
      // Atoms (placeholders) are addressed by their own position.
      doc.descendants((node, p) => {
        if (pos < 0 && node.type.name === 'raw_block') pos = p;
      });
    }
    const offset = offsetForPath(doc, snapshot, blockPath(doc, pos));
    return text.slice(offset, text.indexOf('\n', offset));
  }

  it.each([
    ['Title', '# Title'],
    ['nested', 'nested item'],
    ['cell', '| cell | x |'],
    ['last', 'last paragraph'],
  ])('visual → Markdown puts the cursor at the block holding %j', (needle, line) => {
    expect(roundTrip(needle)).toBe(line);
  });

  it('visual → Markdown on a placeholder goes to its source', () => {
    expect(roundTrip('<no text>')).toBe('<div>html</div>');
  });

  it('Markdown → visual finds the innermost block, or the document start', () => {
    const { doc, snapshot } = parse(text);
    const at = (offset: number) => doc.resolve(positionForOffset(doc, snapshot, offset)).parent;
    expect(at(text.indexOf('nested')).textContent).toBe('nested item');
    expect(at(text.indexOf('last')).textContent).toBe('last paragraph');
    expect(positionForOffset(doc, snapshot, -5)).toBe(0);
  });

  it('accounts for a byte order mark', () => {
    const withBom = '﻿' + text;
    const { doc, snapshot } = parse(withBom);
    const path = blockPath(doc, doc.content.size - 2);
    const offset = offsetForPath(doc, snapshot, path);
    expect(withBom.slice(offset).startsWith('last paragraph')).toBe(true);
  });
});
