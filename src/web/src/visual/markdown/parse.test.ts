import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { commonMarkExamples } from './corpus';
import { isRoundTripSafe, parse } from './index';

function blocks(markdown: string): PMNode[] {
  const out: PMNode[] = [];
  parse(markdown).doc.forEach((n) => {
    out.push(n);
  });
  return out;
}

function only(markdown: string): PMNode {
  const [first] = blocks(markdown);
  return first!;
}

describe('parse: schema mapping (contracts/fidelity.md §1)', () => {
  it('maps paragraphs, headings and their source offsets', () => {
    const text = 'Intro text\n\n## Title ##\n\nSetext\n===\n';
    const { doc, snapshot } = parse(text);
    const [p, h, s] = [doc.child(0), doc.child(1), doc.child(2)];
    expect(p.type.name).toBe('paragraph');
    expect(h.attrs).toMatchObject({ level: 2, syntax: 'atx' });
    expect(h.textContent).toBe('Title');
    expect(s.attrs).toMatchObject({ level: 1, syntax: 'setext' });
    for (const node of [p, h, s]) {
      const src = node.attrs.src as { from: number; to: number };
      expect(snapshot.body.slice(src.from, src.to)).toBe(['Intro text', '## Title ##', 'Setext\n==='][[p, h, s].indexOf(node)]);
    }
  });

  it('maps lists, task items and quotes', () => {
    const list = only('* a\n* b\n');
    expect(list.type.name).toBe('bullet_list');
    expect(list.attrs).toMatchObject({ marker: '*', tight: true });
    const ordered = only('3) x\n4) y\n');
    expect(ordered.attrs).toMatchObject({ start: 3, delimiter: ')' });
    const tasks = only('- [ ] todo\n- [x] done\n');
    expect(tasks.child(0).attrs.checked).toBe(false);
    expect(tasks.child(1).attrs.checked).toBe(true);
    expect(tasks.child(1).textContent).toBe('done');
    const quote = only('> quoted\n> text\n');
    expect(quote.type.name).toBe('blockquote');
    expect(quote.child(0).childCount).toBe(3); // text, soft break, text
  });

  it('maps code blocks and diagrams', () => {
    const fenced = only('~~~js\nlet x;\n~~~\n');
    expect(fenced.attrs).toMatchObject({ language: 'js', fence: '~~~' });
    expect(fenced.textContent).toBe('let x;');
    expect(only('    indented\n').attrs.fence).toBe('');
    expect(only('```mermaid\ngraph TD\n```\n').attrs).toMatchObject({ source: 'graph TD', syntax: 'fence' });
    expect(only('::: mermaid\ngraph TD\n:::\n').attrs).toMatchObject({ source: 'graph TD', syntax: 'container' });
  });

  it('maps tables with alignment', () => {
    const table = only('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(2);
    expect(table.child(0).child(0).type.name).toBe('table_header');
    expect(table.child(0).child(0).attrs.align).toBe('left');
    expect(table.child(1).child(1).attrs.align).toBe('right');
    expect(table.child(1).child(1).textContent).toBe('2');
  });

  it('maps inline marks, links, images and breaks', () => {
    const p = only('*a* __b__ ~~c~~ `d` [e](f.md "t") [g][r] ![h](i.png)  \nj\n\n[r]: https://r.example\n');
    const marks = new Set<string>();
    p.descendants((n) => {
      n.marks.forEach((m) => marks.add(m.type.name));
    });
    expect([...marks].sort()).toEqual(['code', 'em', 'link', 'strike', 'strong']);
    const types: string[] = [];
    p.forEach((n) => types.push(n.type.name));
    expect(types).toContain('image');
    expect(types).toContain('hard_break');
    let ref: Record<string, unknown> | null = null;
    p.descendants((n) => {
      const link = n.marks.find((m) => m.type.name === 'link' && m.attrs.form === 'reference');
      if (link) ref = link.attrs;
    });
    expect(ref).toMatchObject({ href: 'https://r.example', ref: 'r', refStyle: 'full' });
  });
});

describe('parse: placeholders (data-model Placeholder)', () => {
  it.each([
    ['---\ntitle: x\n---\n\ntext\n', 'front-matter'],
    ['[[_TOC_]]\n', 'toc'],
    ['<div>\nhtml\n</div>\n', 'html'],
    ['<!-- note -->\n', 'comment'],
    ['::: note\ntext\n:::\n', 'container'],
    ['[^1]: footnote text\n', 'footnote'],
    ['[x]: https://example.com\n', 'link-definition'],
    ['+---+---+\n| a | b |\n+---+---+\n', 'grid-table'],
    ['Term\n: definition\n', 'definition-list'],
    ['\tcode with a tab\n', 'code'],
  ])('%j becomes a %s placeholder', (text, kind) => {
    const raw = blocks(text).find((n) => n.type.name === 'raw_block');
    expect(raw?.attrs.kind).toBe(kind);
    const src = raw!.attrs.src as { from: number; to: number };
    expect(raw!.attrs.source).toBe(parse(text).snapshot.body.slice(src.from, src.to));
  });

  it.each([
    ['a <b>bold</b> c', 'html'],
    ['a <!-- c --> d', 'comment'],
    ['a&amp;b', 'entity'],
    ['see[^1]\n\n[^1]: x', 'footnote-ref'],
  ])('%j has an inline %s placeholder', (text, kind) => {
    const kinds: string[] = [];
    parse(text).doc.descendants((n) => {
      if (n.type.name === 'raw_inline') kinds.push(n.attrs.kind as string);
    });
    expect(kinds).toContain(kind);
  });
});

describe('parse: totality', () => {
  // Deterministic pseudo-random strings over Markdown-heavy characters.
  function* randomStrings(count: number): Generator<string> {
    let seed = 7;
    const alphabet = '#*_-+>`~[]()!<>|:\\ \t\n\r\nabc123xyz.=&;';
    for (let i = 0; i < count; i++) {
      let s = '';
      const length = 1 + (i % 120);
      for (let j = 0; j < length; j++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        s += alphabet[seed % alphabet.length];
      }
      yield s;
    }
  }

  it('never throws and round-trips random input', () => {
    for (const text of randomStrings(2000)) {
      expect(() => parse(text)).not.toThrow();
      expect(isRoundTripSafe(text)).toBe(true);
    }
  });

  it('never throws for CommonMark examples with one character deleted', () => {
    for (const { text } of commonMarkExamples()) {
      const at = Math.floor(text.length / 2);
      const mutated = text.slice(0, at) + text.slice(at + 1);
      expect(() => parse(mutated)).not.toThrow();
    }
  });
});
