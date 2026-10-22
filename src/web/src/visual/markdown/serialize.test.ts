import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { parse, schema, serialize } from './index';

/** Applies `edit` to the parsed document and serializes the result against the source. */
function edit(markdown: string, change: (tr: Transform, doc: PMNode) => void): string {
  const { doc, snapshot } = parse(markdown);
  const tr = new Transform(doc);
  change(tr, doc);
  return serialize(tr.doc, snapshot);
}

/** Position just after the first occurrence of `text` in the document's text. */
function after(doc: PMNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const i = node.text!.indexOf(text);
    if (i >= 0) found = pos + i + text.length;
  });
  if (found < 0) throw new Error(`text not found: ${text}`);
  return found;
}

function insertText(tr: Transform, pos: number, text: string) {
  tr.insert(pos, schema.text(text, tr.doc.resolve(pos).marks()));
}

describe('serialize: preservation rules (contracts/fidelity.md S2–S10)', () => {
  it('writes an untouched document back exactly (S1)', () => {
    const text = '* a\n*  b\n\n> q\n\n|x|y|\n|-|-|\n';
    const { doc, snapshot } = parse(text);
    expect(serialize(doc, snapshot)).toBe(text);
  });

  it('treats an edit that was typed back as unchanged (S2, FR-009)', () => {
    const text = 'Some  _odd_   spacing\\! here\n';
    const out = edit(text, (tr, doc) => {
      const pos = after(doc, 'Some');
      insertText(tr, pos, 'X');
      tr.delete(pos, pos + 1);
    });
    expect(out).toBe(text);
  });

  it('changes only the edited item of a list, keeping markers and indentation (S4)', () => {
    const text = '*   one\n*   two\n*   three\n';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, 'two'), '!'));
    expect(out).toBe('*   one\n*   two!\n*   three\n');
  });

  it('keeps the quote prefix and lazy continuation lines of an edited quote (S4)', () => {
    const text = '>first line\nlazy line\n>\n> second paragraph\n';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, 'second'), '!'));
    expect(out).toBe('>first line\nlazy line\n>\n> second! paragraph\n');
  });

  it('gives a new item the list marker of its siblings (S6)', () => {
    const text = '+ a\n+ b\n';
    const out = edit(text, (tr, doc) => {
      const list = doc.child(0);
      const item = schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text('c')));
      tr.insert(list.nodeSize - 1, item);
    });
    expect(out).toBe('+ a\n+ b\n+ c\n');
  });

  it('numbers a new ordered item after its predecessor', () => {
    const text = '1) a\n2) b\n';
    const out = edit(text, (tr, doc) => {
      const item = schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text('c')));
      tr.insert(doc.child(0).nodeSize - 1, item);
    });
    expect(out).toBe('1) a\n2) b\n3) c\n');
  });

  it('keeps unusual gaps between unchanged blocks (S5)', () => {
    const text = 'a\n\n\n\nb\n\nc\n';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, 'c'), '!'));
    expect(out).toBe('a\n\n\n\nb\n\nc!\n');
  });

  it('separates a new block with one blank line in the file line ending (S5, S6)', () => {
    const text = 'a\r\n\r\nb\r\n';
    const out = edit(text, (tr, doc) => {
      tr.insert(doc.child(0).nodeSize, schema.nodes.paragraph.create(null, schema.text('new')));
    });
    expect(out).toBe('a\r\n\r\nnew\r\n\r\nb\r\n');
  });

  it('writes placeholders verbatim and moves them as a whole (S8)', () => {
    const text = 'a\n\n<div class="x">\n  html\n</div>\n\nb\n';
    const out = edit(text, (tr, doc) => {
      const raw = doc.child(1);
      const pos = doc.child(0).nodeSize;
      tr.delete(pos, pos + raw.nodeSize);
      tr.insert(tr.doc.content.size, raw.type.create({ ...raw.attrs, src: null, srcId: null }));
    });
    expect(out).toBe('a\n\nb\n\n<div class="x">\n  html\n</div>\n');
  });

  it('keeps a byte order mark and a missing final newline (S9)', () => {
    const text = '﻿# T\n\nend';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, 'end'), '!'));
    expect(out).toBe('﻿# T\n\nend!');
  });

  it('never writes an upload placeholder (S10)', () => {
    const text = 'text\n';
    const out = edit(text, (tr, doc) => {
      tr.insert(after(doc, 'text'), schema.nodes.image_upload.create({ key: 'k', name: 'shot.png' }));
    });
    expect(out).toBe(text);
  });

  it('changes one line of a hand-wrapped paragraph (FR-008)', () => {
    const text = 'one two\nthree four\nfive six\n';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, 'three'), '!'));
    expect(out).toBe('one two\nthree! four\nfive six\n');
  });

  it('changes only the joined lines when a soft break is removed', () => {
    const text = 'one\ntwo\nthree\nfour\n';
    const out = edit(text, (tr, doc) => {
      const pos = after(doc, 'two');
      tr.delete(pos, pos + 1);
      tr.insert(pos, schema.text(' '));
    });
    expect(out).toBe('one\ntwo three\nfour\n');
  });

  it('keeps reference links in their form when their line changes', () => {
    const text = 'See [docs][d] and [faq].\n\n[d]: https://d.example\n[faq]: https://f.example\n';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, 'See'), ' the'));
    expect(out).toBe('See the [docs][d] and [faq].\n\n[d]: https://d.example\n[faq]: https://f.example\n');
  });

  it('writes the label out when a shortcut reference text changes', () => {
    const text = '[faq]\n\n[faq]: https://f.example\n';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, 'fa'), 'X'));
    expect(out).toBe('[faXq][faq]\n\n[faq]: https://f.example\n');
  });

  it('rewrites only the edited row of a table', () => {
    const text = '| a | b |\n|---|---|\n|  1 |  2 |\n|  3 |  4 |\n';
    const out = edit(text, (tr, doc) => insertText(tr, after(doc, '3'), '0'));
    expect(out).toBe('| a | b |\n|---|---|\n|  1 |  2 |\n| 30 | 4 |\n');
  });

  it('escapes only what would change meaning in new text (S7)', () => {
    const out = edit('x\n', (tr, doc) => {
      tr.insert(doc.content.size, schema.nodes.paragraph.create(null, schema.text('1. a *b* snake_case [c] <d> #e')));
    });
    expect(out).toBe('x\n\n1\\. a \\*b\\* snake_case \\[c\\] \\<d> #e\n');
  });

  it('writes new formatting in the file style', () => {
    const out = edit('_a_ and __b__\n\n- x\n', (tr, doc) => {
      const strong = schema.marks.strong.create();
      const em = schema.marks.em.create();
      tr.insert(doc.content.size, schema.nodes.paragraph.create(null, [schema.text('new', [strong]), schema.text(' '), schema.text('em', [em])]));
    });
    expect(out).toBe('_a_ and __b__\n\n- x\n\n__new__ _em_\n');
  });
});
