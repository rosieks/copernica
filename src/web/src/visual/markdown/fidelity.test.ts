import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { corpusFiles } from './corpus';
import { parse, sameContent, schema, serialize } from './index';

/**
 * The fidelity check (FR-014, SC-001, SC-002; contracts/fidelity.md S1–S3).
 *
 * 1. Round trip: every corpus file is written back byte for byte.
 * 2. Single-block edit: typing one character into any block changes only that block's lines,
 *    and the result reads back as the edited document.
 */

type Src = { from: number; to: number };

function lineIndex(text: string, offset: number): number {
  let n = 0;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

/** Changed line range in `before` after removing the common prefix and suffix lines. */
function changedLines(before: string, after: string): { from: number; to: number; removed: number; added: number } | null {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  if (start === a.length && start === b.length) return null;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, removed: endA - start, added: endB - start };
}

function minimalDiff(before: string, after: string): string {
  const range = changedLines(before, after);
  if (!range) return '(identical)';
  const a = before.split('\n').slice(range.from, range.to);
  const b = after.split('\n').slice(range.from, range.from + range.added);
  return `line ${range.from + 1}:\n- ${a.map((l) => JSON.stringify(l)).join('\n- ')}\n+ ${b.map((l) => JSON.stringify(l)).join('\n+ ')}`;
}

interface Target {
  pos: number;
  src: Src;
  block: PMNode;
}

/** Text positions to edit: the first character of every textblock, with its nearest source range. */
function targets(doc: PMNode): Target[] {
  const out: Target[] = [];
  const walk = (node: PMNode, pos: number, src: Src | null) => {
    const own = (node.attrs.src as Src | null | undefined) ?? src;
    if (node.isTextblock) {
      let found = -1;
      node.forEach((child, offset) => {
        if (found < 0 && child.isText) found = pos + 1 + offset + 1;
      });
      if (found >= 0 && own) out.push({ pos: found, src: own, block: node });
      return;
    }
    node.forEach((child, offset) => walk(child, pos + 1 + offset, own));
  };
  doc.forEach((child, offset) => walk(child, offset, null));
  return out;
}

const files = corpusFiles();

/** Large files are sampled evenly so the check stays fast; small ones are edited everywhere. */
const MAX_EDITS_PER_FILE = 20;

function sample<T>(items: T[]): T[] {
  if (items.length <= MAX_EDITS_PER_FILE) return items;
  const step = items.length / MAX_EDITS_PER_FILE;
  return Array.from({ length: MAX_EDITS_PER_FILE }, (_, i) => items[Math.floor(i * step)]!);
}

describe('fidelity corpus', () => {
  it('has the expected fixtures', () => {
    expect(files.length).toBeGreaterThan(700);
    const bom = files.find((f) => f.name.endsWith('bom-no-final-newline.md'));
    expect(bom?.text.startsWith('﻿')).toBe(true);
    const crlf = files.find((f) => f.name.endsWith('hand-wrapped-crlf.md'));
    expect(crlf?.text.includes('\r\n')).toBe(true);
  });

  it('round trip: every file is written back unchanged (S1)', () => {
    const failures: string[] = [];
    for (const file of files) {
      const { doc, snapshot } = parse(file.text);
      const out = serialize(doc, snapshot);
      if (out !== file.text) failures.push(`${file.name}\n${minimalDiff(file.text, out)}`);
    }
    console.log(`round trip: ${files.length - failures.length}/${files.length} files identical`);
    expect(failures).toEqual([]);
  }, 60_000);

  it('single-block edits stay inside the block and read back correctly (S2, S3)', () => {
    const failures: string[] = [];
    let total = 0;
    for (const file of files) {
      const { doc, snapshot } = parse(file.text);
      const body = snapshot.body;
      for (const target of sample(targets(doc))) {
        total++;
        const $pos = doc.resolve(target.pos);
        const tr = new Transform(doc).insert(target.pos, schema.text('Z', $pos.marks()));
        const edited = tr.doc;
        const out = serialize(edited, snapshot);
        const label = `${file.name} @${target.pos} (${target.block.type.name})`;
        const range = changedLines(file.text, out);
        if (!range) {
          failures.push(`${label}: edit lost`);
          continue;
        }
        const blockFrom = lineIndex(body, target.src.from);
        const blockTo = lineIndex(body, target.src.to);
        if (range.from < blockFrom || range.to - 1 > blockTo) {
          failures.push(`${label}: changed lines ${range.from + 1}-${range.to} outside block lines ${blockFrom + 1}-${blockTo + 1}\n${minimalDiff(file.text, out)}`);
          continue;
        }
        // FR-008: inside a hand-wrapped paragraph only the edited line changes, unless a mark or
        // raw syntax spans a line break (then the paragraph is rewritten as a whole).
        if (target.block.type.name === 'paragraph' && (range.removed !== 1 || range.added !== 1)) {
          let spans = false;
          target.block.forEach((child) => {
            if ((child.type.name === 'soft_break' || child.type.name === 'hard_break') && child.marks.length) spans = true;
            if (child.type.name === 'raw_inline' && (child.attrs.source as string).includes('\n')) spans = true;
          });
          const rawLines = body.slice(target.src.from, target.src.to).split('\n').length;
          let breaks = 0;
          target.block.forEach((child) => {
            if (child.type.name === 'soft_break' || child.type.name === 'hard_break') breaks++;
          });
          if (!spans && rawLines === breaks + 1) {
            failures.push(`${label}: ${range.removed} lines replaced by ${range.added}, expected one\n${minimalDiff(file.text, out)}`);
            continue;
          }
        }
        const reread = parse(out).doc;
        if (!sameContent(reread, edited)) {
          failures.push(`${label}: does not read back as the edited document\n${minimalDiff(file.text, out)}`);
        }
      }
    }
    console.log(`single-block edits: ${total - failures.length}/${total} local`);
    expect(failures.slice(0, 40)).toEqual([]);
  }, 120_000);
});
