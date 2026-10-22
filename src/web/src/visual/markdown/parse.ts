import type { SyntaxNode } from '@lezer/common';
import { Fragment, type Mark, type Node as PMNode } from 'prosemirror-model';
import { parseTree } from './lezer';
import { schema } from './schema';
import { detectStyle, type FileStyle } from './style';

/**
 * Markdown → visual document (research R3, contracts/fidelity.md §1–§2).
 *
 * Every block that comes from the source gets `src` (its exact offsets in `snapshot.body`) and
 * `srcId` (source order). The snapshot keeps the original nodes and their place in the tree so
 * the serializer can write unchanged blocks back byte for byte. Anything the schema does not
 * cover becomes a placeholder holding its exact text; `parse` never throws.
 */

export interface SourceSnapshot {
  /** The full text the document was parsed from. */
  text: string;
  /** A leading byte order mark, kept outside the parsed body. */
  preamble: string;
  /** `text` without the preamble; all offsets refer to it. */
  body: string;
  style: FileStyle;
  /** srcId → the node exactly as parsed. */
  originals: Map<number, PMNode>;
  /** srcId → continuation prefix of the block's lines (container markers and indent). */
  prefix: Map<number, string>;
  /** srcId → continuation prefix of a container's children. */
  childPrefix: Map<number, string>;
  /** srcId → the srcId of the next block in the same parent. */
  nextSibling: Map<number, number>;
  /** Parent srcId (-1 for the document) → its first and last child srcIds. */
  firstChild: Map<number, number>;
  lastChild: Map<number, number>;
  /** True when the source holds no block at all (empty or whitespace-only). */
  empty: boolean;
}

/** Nodes created by `parse`; untouched blocks keep their identity (serializer fast path). */
export const parsedNodes = new WeakSet<PMNode>();

const BOM = '﻿';

interface Ctx {
  /**
   * The text the parser sees: the body with CRLF line endings turned into LF, because Lezer
   * splits lines on `\n` only. Content comes from here; `src` offsets are mapped back to the
   * original body so the serializer can reuse exact bytes.
   */
  body: string;
  /** The original body (without the preamble). */
  orig: string;
  /** Offsets in `body` of the line breaks that were CRLF in `orig`, ascending. */
  crlf: number[];
  snapshot: SourceSnapshot;
  nextId: number;
  definitions: Map<string, { href: string; title: string | null }>;
}

/** Offset in `ctx.body` → offset in the original body. */
function origPos(ctx: Ctx, pos: number): number {
  let lo = 0;
  let hi = ctx.crlf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ctx.crlf[mid]! < pos) lo = mid + 1;
    else hi = mid;
  }
  return pos + lo;
}

function srcOf(ctx: Ctx, from: number, to: number): { from: number; to: number } {
  return { from: origPos(ctx, from), to: origPos(ctx, to) };
}

function normalizeLabel(label: string): string {
  return label.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function stripTitle(raw: string): string {
  return raw.length >= 2 ? raw.slice(1, -1) : raw;
}

function stripAngle(url: string): string {
  return url.startsWith('<') && url.endsWith('>') ? url.slice(1, -1) : url;
}

function children(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', euro: '€', times: '×', deg: '°',
};

function decodeEntity(source: string): string {
  const body = source.slice(1, -1);
  if (body.startsWith('#x') || body.startsWith('#X')) {
    const code = parseInt(body.slice(2), 16);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : source;
  }
  if (body.startsWith('#')) {
    const code = parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : source;
  }
  return ENTITIES[body] ?? source;
}

// ---------------------------------------------------------------------------------------------
// Inline content

interface InlineState {
  out: PMNode[];
  atLineStart: boolean;
}

function pushText(state: InlineState, text: string, marks: readonly Mark[]) {
  let value = text;
  if (state.atLineStart) {
    value = value.replace(/^[ \t]+/, '');
    if (value) state.atLineStart = false;
  }
  if (value) state.out.push(schema.text(value, marks));
}

/** Plain text of a gap: newlines become soft breaks; continuation indentation is dropped. */
function pushGap(state: InlineState, text: string, marks: readonly Mark[]) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0) {
      // Trailing spaces before a soft break are not content (CommonMark).
      const last = state.out[state.out.length - 1];
      if (last?.isText && /[ \t]$/.test(last.text!)) {
        const trimmed = last.text!.replace(/[ \t]+$/, '');
        state.out.pop();
        if (trimmed) state.out.push(schema.text(trimmed, last.marks));
      }
      state.out.push(schema.nodes.soft_break.create(null, null, marks));
      state.atLineStart = true;
    }
    pushText(state, line.replace(/\r$/, ''), marks);
  });
}

function inline(ctx: Ctx, parent: SyntaxNode, from: number, to: number, marks: readonly Mark[], state: InlineState) {
  let pos = from;
  for (const child of children(parent)) {
    if (child.to <= from || child.from >= to) continue;
    if (child.from > pos) pushGap(state, ctx.body.slice(pos, child.from), marks);
    inlineNode(ctx, child, marks, state);
    pos = Math.max(pos, child.to);
  }
  if (pos < to) pushGap(state, ctx.body.slice(pos, to), marks);
}

function rawInline(state: InlineState, source: string, kind: string, label: string, marks: readonly Mark[]) {
  state.out.push(schema.nodes.raw_inline.create({ source, kind, label }, null, marks));
  state.atLineStart = false;
}

function markRange(node: SyntaxNode, markName: string): { from: number; to: number } {
  const marks = node.getChildren(markName);
  if (marks.length >= 2) return { from: marks[0]!.to, to: marks[marks.length - 1]!.from };
  return { from: node.from, to: node.to };
}

function inlineNode(ctx: Ctx, node: SyntaxNode, marks: readonly Mark[], state: InlineState) {
  const body = ctx.body;
  const slice = body.slice(node.from, node.to);
  switch (node.name) {
    case 'QuoteMark':
    case 'TaskMarker':
      return;
    case 'Escape':
      pushText(state, slice.slice(1), marks);
      state.atLineStart = false;
      return;
    case 'Entity':
      rawInline(state, slice, 'entity', decodeEntity(slice), marks);
      return;
    case 'HardBreak':
      state.out.push(schema.nodes.hard_break.create({ marker: slice.startsWith('\\') ? '\\' : slice.replace(/\r?\n$/, '') }, null, marks));
      state.atLineStart = true;
      return;
    case 'Emphasis':
    case 'StrongEmphasis': {
      const mark = node.getChild('EmphasisMark');
      const type = node.name === 'Emphasis' ? schema.marks.em : schema.marks.strong;
      const markerText = mark ? body.slice(mark.from, mark.to) : null;
      const inner = markRange(node, 'EmphasisMark');
      inline(ctx, node, inner.from, inner.to, type.create({ marker: markerText }).addToSet(marks), state);
      return;
    }
    case 'Strikethrough': {
      const mark = node.getChild('StrikethroughMark');
      const inner = markRange(node, 'StrikethroughMark');
      const markerText = mark ? body.slice(mark.from, mark.to) : null;
      inline(ctx, node, inner.from, inner.to, schema.marks.strike.create({ marker: markerText }).addToSet(marks), state);
      return;
    }
    case 'InlineCode': {
      const inner = markRange(node, 'CodeMark');
      let code = body.slice(inner.from, inner.to).replace(/\r?\n[ \t>]*/g, ' ');
      if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
      if (code) {
        state.out.push(schema.text(code, schema.marks.code.create().addToSet(marks)));
        state.atLineStart = false;
      } else {
        rawInline(state, slice, 'code', slice, marks);
      }
      return;
    }
    case 'Link':
      linkNode(ctx, node, marks, state);
      return;
    case 'Image':
      imageNode(ctx, node, marks, state);
      return;
    case 'Autolink': {
      const url = node.getChild('URL');
      const href = url ? body.slice(url.from, url.to) : slice.slice(1, -1);
      pushText(state, href, schema.marks.link.create({ href, form: 'autolink' }).addToSet(marks));
      state.atLineStart = false;
      return;
    }
    case 'URL':
      // A bare address inside a link is just the link's text.
      if (marks.some((m) => m.type === schema.marks.link)) pushText(state, slice, marks);
      else pushText(state, slice, schema.marks.link.create({ href: slice, form: 'bare' }).addToSet(marks));
      state.atLineStart = false;
      return;
    case 'HTMLTag':
    case 'Comment':
    case 'ProcessingInstruction':
      rawInline(state, slice, node.name === 'Comment' ? 'comment' : 'html', node.name === 'Comment' ? 'HTML comment' : slice, marks);
      return;
    default:
      rawInline(state, slice, 'unknown', slice, marks);
  }
}

function linkNode(ctx: Ctx, node: SyntaxNode, marks: readonly Mark[], state: InlineState) {
  const body = ctx.body;
  const slice = body.slice(node.from, node.to);
  const linkMarks = node.getChildren('LinkMark');
  if (linkMarks.length < 2) {
    rawInline(state, slice, 'unknown', slice, marks);
    return;
  }
  const textFrom = linkMarks[0]!.to;
  const textTo = linkMarks[1]!.from;
  // The destination and title follow the closing bracket; a URL inside the text is not it.
  const after = (name: string) => node.getChildren(name).find((c) => c.from >= textTo) ?? null;
  const url = after('URL');
  const title = after('LinkTitle');
  const label = after('LinkLabel');
  const inner = body.slice(textFrom, textTo);

  let attrs: { href: string; title: string | null; form: string; ref: string | null; refStyle?: string } | null = null;
  if (url || (linkMarks.length >= 3 && body[linkMarks[2]!.from] === '(')) {
    // The destination is kept as written (angle brackets and escapes included); urls.ts
    // normalises it wherever the editor needs the address itself.
    attrs = { href: url ? body.slice(url.from, url.to) : '', title: title ? stripTitle(body.slice(title.from, title.to)) : null, form: 'inline', ref: null };
  } else {
    if (!label && inner.startsWith('^')) {
      rawInline(state, slice, 'footnote-ref', `Footnote ${inner}`, marks);
      return;
    }
    const refText = label ? body.slice(label.from + 1, label.to - 1) : null;
    const key = normalizeLabel(refText ? refText : inner);
    const def = ctx.definitions.get(key);
    if (!def) {
      // Not a link after all: brackets as text around the parsed content.
      pushText(state, '[', marks);
      inline(ctx, node, textFrom, textTo, marks, state);
      pushText(state, body.slice(textTo, node.to), marks);
      state.atLineStart = false;
      return;
    }
    // `ref` is always the label that finds the definition; `refStyle` remembers how it was written.
    attrs = {
      href: def.href,
      title: def.title,
      form: 'reference',
      ref: refText ? refText : inner,
      refStyle: label ? (refText ? 'full' : 'collapsed') : 'shortcut',
    };
  }
  inline(ctx, node, textFrom, textTo, schema.marks.link.create(attrs).addToSet(marks), state);
  state.atLineStart = false;
}

function imageNode(ctx: Ctx, node: SyntaxNode, marks: readonly Mark[], state: InlineState) {
  const body = ctx.body;
  const slice = body.slice(node.from, node.to);
  const linkMarks = node.getChildren('LinkMark');
  const altEnd = linkMarks[1]?.from ?? node.to;
  const url = node.getChildren('URL').find((c) => c.from >= altEnd);
  if (linkMarks.length < 2 || !url) {
    rawInline(state, slice, 'image', 'Image', marks);
    return;
  }
  const title = node.getChildren('LinkTitle').find((c) => c.from >= altEnd);
  state.out.push(
    schema.nodes.image.create(
      {
        src: body.slice(url.from, url.to),
        alt: body.slice(linkMarks[0]!.to, linkMarks[1]!.from),
        title: title ? stripTitle(body.slice(title.from, title.to)) : null,
      },
      null,
      marks,
    ),
  );
  state.atLineStart = false;
}

function inlineContent(ctx: Ctx, node: SyntaxNode, from: number, to: number): Fragment {
  const state: InlineState = { out: [], atLineStart: false };
  inline(ctx, node, from, to, [], state);
  // Trailing whitespace at the end of a block is not content.
  const last = state.out[state.out.length - 1];
  if (last?.isText && /[ \t]$/.test(last.text!)) {
    state.out.pop();
    const trimmed = last.text!.replace(/[ \t]+$/, '');
    if (trimmed) state.out.push(schema.text(trimmed, last.marks));
  }
  return Fragment.fromArray(state.out);
}

// ---------------------------------------------------------------------------------------------
// Blocks

function lineStartOf(body: string, pos: number): number {
  return body.lastIndexOf('\n', pos - 1) + 1;
}

function register(ctx: Ctx, node: PMNode, srcId: number, prefix: string): PMNode {
  ctx.snapshot.originals.set(srcId, node);
  ctx.snapshot.prefix.set(srcId, prefix);
  parsedNodes.add(node);
  return node;
}

function rawBlock(ctx: Ctx, from: number, to: number, kind: string, label: string, prefix: string): PMNode {
  const srcId = ctx.nextId++;
  const src = srcOf(ctx, from, to);
  const node = schema.nodes.raw_block.create({ src, srcId, source: ctx.orig.slice(src.from, src.to), kind, label });
  return register(ctx, node, srcId, prefix);
}

/** Removes the container prefix (up to `width` columns of spaces and `>` markers) from code lines. */
function stripPrefix(line: string, prefix: string): string {
  let i = 0;
  while (i < line.length && i < prefix.length && (line[i] === ' ' || line[i] === '\t' || (line[i] === '>' && prefix.includes('>')))) i++;
  return line.slice(i);
}

function contentLines(ctx: Ctx, from: number, to: number, prefix: string): string {
  if (to <= from) return '';
  return ctx.body
    .slice(from, to)
    .split('\n')
    .map((line) => stripPrefix(line.replace(/\r$/, ''), prefix))
    .join('\n');
}

function fencedBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const marks = node.getChildren('CodeMark');
  const open = marks[0];
  const info = node.getChild('CodeInfo');
  const language = info ? body.slice(info.from, info.to) : '';
  const openLineEnd = body.indexOf('\n', node.from);
  const close = marks.length > 1 ? marks[marks.length - 1] : null;
  const contentFrom = openLineEnd < 0 || openLineEnd >= node.to ? node.to : openLineEnd + 1;
  let contentTo = close ? lineStartOf(body, close.from) - 1 : node.to;
  if (contentTo < contentFrom) contentTo = contentFrom;
  // Indentation of the fence itself is removed from content lines too.
  const fenceIndent = prefix + ' '.repeat(Math.max(0, node.from - lineStartOf(body, node.from) - prefix.length));
  const content = contentLines(ctx, contentFrom, contentTo, fenceIndent);
  const srcId = ctx.nextId++;
  const src = srcOf(ctx, indentedStart(ctx, node, prefix), node.to);
  if ((language.split(/\s/)[0] ?? '').toLowerCase() === 'mermaid') {
    return register(ctx, schema.nodes.diagram.create({ src, srcId, source: content, syntax: 'fence' }), srcId, prefix);
  }
  const fence = open ? body.slice(open.from, open.to) : '```';
  const pm = schema.nodes.code_block.create({ src, srcId, language, fence }, content ? schema.text(content) : null);
  return register(ctx, pm, srcId, prefix);
}

/**
 * Where an indented block's text starts: right after its container's prefix when only
 * whitespace lies between, so the indentation belongs to the block (fresh output rewrites it
 * relative to the prefix) and not to the gap before it.
 */
function indentedStart(ctx: Ctx, node: SyntaxNode, prefix: string): number {
  const afterPrefix = lineStartOf(ctx.body, node.from) + prefix.length;
  return afterPrefix <= node.from && /^[ \t]*$/.test(ctx.body.slice(afterPrefix, node.from)) ? afterPrefix : node.from;
}

function indentedBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  // Tabs in the indentation count by columns (CommonMark 2.2); such blocks are kept as written.
  if (/(^|\n)[ >]*\t/.test(body.slice(lineStartOf(body, node.from), node.to))) {
    return rawBlock(ctx, node.from, node.to, 'code', 'Code block (indented with tabs)', prefix);
  }
  const from = indentedStart(ctx, node, prefix);
  const lines = body.slice(from, node.to).split('\n');
  const indent = prefix + '    ';
  const content = lines
    .map((line, i) => {
      const text = line.replace(/\r$/, '');
      if (i > 0) return stripPrefix(text, indent);
      return from === node.from ? text : stripPrefix(text, '    ');
    })
    .join('\n');
  const srcId = ctx.nextId++;
  const pm = schema.nodes.code_block.create({ src: srcOf(ctx, from, node.to), srcId, language: '', fence: '' }, content ? schema.text(content) : null);
  return register(ctx, pm, srcId, prefix);
}

function containerBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const info = node.getChild('ContainerInfo');
  const name = info ? body.slice(info.from, info.to) : '';
  if (name.toLowerCase() === 'mermaid') {
    const lines = body.slice(node.from, node.to).split('\n');
    const closed = lines.length > 1 && /^[ \t>]*:{3,}[ \t]*\r?$/.test(lines[lines.length - 1] ?? '');
    const inner = lines.slice(1, closed ? -1 : undefined).map((l) => stripPrefix(l.replace(/\r$/, ''), prefix));
    const srcId = ctx.nextId++;
    const pm = schema.nodes.diagram.create({ src: srcOf(ctx, node.from, node.to), srcId, source: inner.join('\n'), syntax: 'container' });
    return register(ctx, pm, srcId, prefix);
  }
  return rawBlock(ctx, node.from, node.to, 'container', name ? `Container: ${name}` : 'Container', prefix);
}

function paragraphBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const slice = body.slice(node.from, node.to);
  const lines = slice.split('\n').map((l) => l.replace(/\r$/, '').replace(/^[ \t>]*/, ''));
  if (/^\[\^[^\]\s]+\]:/.test(lines[0] ?? '')) {
    return rawBlock(ctx, node.from, node.to, 'footnote', `Footnote ${(lines[0] ?? '').slice(1, (lines[0] ?? '').indexOf(']'))}`, prefix);
  }
  if (lines.length === 1 && /^\[\[_(TOC|TOSP)_\]\]$/.test((lines[0] ?? '').trim())) {
    return rawBlock(ctx, node.from, node.to, 'toc', 'Table of contents (Azure DevOps)', prefix);
  }
  if ((lines[0] ?? '').startsWith('+-') && lines.every((l) => l.startsWith('+') || l.startsWith('|'))) {
    return rawBlock(ctx, node.from, node.to, 'grid-table', 'Grid table', prefix);
  }
  if (lines.length > 1 && lines.slice(1).some((l) => /^:[ \t]/.test(l))) {
    return rawBlock(ctx, node.from, node.to, 'definition-list', 'Definition list', prefix);
  }
  const srcId = ctx.nextId++;
  const pm = schema.nodes.paragraph.create({ src: srcOf(ctx, node.from, node.to), srcId }, inlineContent(ctx, node, node.from, node.to));
  return register(ctx, pm, srcId, prefix);
}

function headingBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const setext = node.name.startsWith('Setext');
  const level = Number(node.name.slice(-1));
  const marks = node.getChildren('HeaderMark');
  let from = node.from;
  let to = node.to;
  if (setext) {
    const underline = marks[marks.length - 1];
    to = underline ? lineStartOf(body, underline.from) - 1 : node.to;
    while (to > from && /[\r \t]/.test(body[to - 1] ?? '')) to--;
  } else {
    if (marks[0]) from = marks[0].to;
    if (marks.length > 1) to = marks[marks.length - 1]!.from;
    while (from < to && /[ \t]/.test(body[from] ?? '')) from++;
    while (to > from && /[ \t]/.test(body[to - 1] ?? '')) to--;
  }
  const srcId = ctx.nextId++;
  const pm = schema.nodes.heading.create(
    { src: srcOf(ctx, node.from, node.to), srcId, level, syntax: setext ? 'setext' : 'atx' },
    inlineContent(ctx, node, from, to),
  );
  return register(ctx, pm, srcId, prefix);
}

function cellsOf(ctx: Ctx, row: SyntaxNode): { from: number; to: number; cell: SyntaxNode | null }[] {
  const body = ctx.body;
  const delimiters = children(row).filter((c) => c.name === 'TableDelimiter');
  const cells: { from: number; to: number; cell: SyntaxNode | null }[] = [];
  let start = row.from;
  const leading = delimiters.length > 0 && body.slice(row.from, delimiters[0]!.from).trim() === '';
  let i = 0;
  if (leading) {
    start = delimiters[0]!.to;
    i = 1;
  }
  for (; i <= delimiters.length; i++) {
    const end = i < delimiters.length ? delimiters[i]!.from : row.to;
    if (i === delimiters.length && body.slice(start, end).trim() === '') break;
    const cell = children(row).find((c) => c.name === 'TableCell' && c.from >= start && c.to <= end) ?? null;
    cells.push({ from: start, to: end, cell });
    if (i < delimiters.length) start = delimiters[i]!.to;
  }
  return cells;
}

function alignments(text: string): ('left' | 'center' | 'right' | null)[] {
  let line = text.trim();
  if (line.startsWith('|')) line = line.slice(1);
  if (line.endsWith('|')) line = line.slice(0, -1);
  return line.split('|').map((part) => {
    const p = part.trim();
    const left = p.startsWith(':');
    const right = p.endsWith(':');
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
  });
}

function tableBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const tableId = ctx.nextId++;
  const delimiterRow = children(node).find((c) => c.name === 'TableDelimiter');
  const aligns = delimiterRow ? alignments(body.slice(delimiterRow.from, delimiterRow.to)) : [];
  const width = aligns.length || 1;
  const rows: PMNode[] = [];
  for (const row of children(node)) {
    if (row.name !== 'TableHeader' && row.name !== 'TableRow') continue;
    const header = row.name === 'TableHeader';
    const type = header ? schema.nodes.table_header : schema.nodes.table_cell;
    const cells = cellsOf(ctx, row).slice(0, width);
    const pmCells: PMNode[] = [];
    for (let c = 0; c < width; c++) {
      const cell = cells[c];
      const content = cell?.cell ? inlineContent(ctx, cell.cell, cell.cell.from, cell.cell.to) : Fragment.empty;
      pmCells.push(type.create({ align: aligns[c] ?? null }, content));
    }
    const rowId = ctx.nextId++;
    const pmRow = schema.nodes.table_row.create({ src: srcOf(ctx, row.from, row.to), srcId: rowId }, pmCells);
    register(ctx, pmRow, rowId, prefix);
    rows.push(pmRow);
  }
  linkSiblings(ctx, tableId, rows);
  const pm = schema.nodes.table.create(
    { src: srcOf(ctx, node.from, node.to), srcId: tableId, delimiterRow: delimiterRow ? body.slice(delimiterRow.from, delimiterRow.to) : null },
    rows,
  );
  ctx.snapshot.childPrefix.set(tableId, prefix);
  return register(ctx, pm, tableId, prefix);
}

function hasBlankLine(text: string): boolean {
  return /\n[ \t>]*\r?\n/.test(text);
}

function listBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const ordered = node.name === 'OrderedList';
  const listId = ctx.nextId++;
  const items = children(node).filter((c) => c.name === 'ListItem');
  let tight = true;
  for (let i = 1; i < items.length; i++) if (hasBlankLine(body.slice(items[i - 1]!.to, items[i]!.from))) tight = false;
  const pmItems = items.map((item) => listItemBlock(ctx, item, prefix));
  for (const item of items) {
    const blocks = children(item).filter((c) => !['ListMark', 'QuoteMark', 'TaskMarker'].includes(c.name));
    for (let i = 1; i < blocks.length; i++) if (hasBlankLine(body.slice(blocks[i - 1]!.to, blocks[i]!.from))) tight = false;
  }
  linkSiblings(ctx, listId, pmItems);
  const firstMark = items[0]?.getChild('ListMark');
  const markerText = firstMark ? body.slice(firstMark.from, firstMark.to) : null;
  ctx.snapshot.childPrefix.set(listId, prefix);
  const src = srcOf(ctx, node.from, node.to);
  const pm = ordered
    ? schema.nodes.ordered_list.create(
        { src, srcId: listId, tight, start: markerText ? Number(markerText.slice(0, -1)) || 0 : 1, delimiter: markerText?.slice(-1) ?? null },
        pmItems,
      )
    : schema.nodes.bullet_list.create({ src, srcId: listId, tight, marker: markerText }, pmItems);
  return register(ctx, pm, listId, prefix);
}

function listItemBlock(ctx: Ctx, item: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const itemId = ctx.nextId++;
  const mark = item.getChild('ListMark');
  const markerText = mark ? body.slice(mark.from, mark.to) : null;
  const blocks = children(item).filter((c) => !['ListMark', 'QuoteMark'].includes(c.name));
  const first = blocks[0];
  const sameLine = first && !body.slice(item.from, first.from).includes('\n');
  const markerWidth = (mark ? mark.to - item.from : 1) + 1;
  // Content that starts five or more columns after the marker is an indented code block; the
  // item's content column is then right after the marker (CommonMark list items, rule 2).
  const width = first && sameLine && first.name !== 'CodeBlock' ? first.from - item.from : markerWidth;
  const childPrefix = prefix + ' '.repeat(Math.max(1, width));
  ctx.snapshot.childPrefix.set(itemId, childPrefix);

  let checked: boolean | null = null;
  const pmChildren: PMNode[] = [];
  for (const block of blocks) {
    if (block.name === 'Task') {
      const marker = block.getChild('TaskMarker');
      checked = marker ? /x/i.test(body.slice(marker.from, marker.to)) : false;
      let from = marker ? marker.to : block.from;
      while (from < block.to && /[ \t]/.test(body[from] ?? '')) from++;
      const srcId = ctx.nextId++;
      const pm = schema.nodes.paragraph.create({ src: srcOf(ctx, from, block.to), srcId }, inlineContent(ctx, block, from, block.to));
      // The task item's own childPrefix is measured from the task text, not the marker.
      pmChildren.push(register(ctx, pm, srcId, childPrefix));
    } else {
      pmChildren.push(...blockNode(ctx, block, childPrefix));
    }
  }
  linkSiblings(ctx, itemId, pmChildren);
  if (pmChildren.length === 0) pmChildren.push(schema.nodes.paragraph.create());
  const pm = schema.nodes.list_item.create({ src: srcOf(ctx, item.from, item.to), srcId: itemId, checked, marker: markerText }, pmChildren);
  return register(ctx, pm, itemId, prefix);
}

function quoteBlock(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  const quoteId = ctx.nextId++;
  const blocks = children(node).filter((c) => c.name !== 'QuoteMark');
  // The marker and at most one following space; further indentation belongs to the child
  // (an indented code block keeps its four spaces).
  const childPrefix = prefix + (body[node.from + 1] === ' ' ? '> ' : '>');
  ctx.snapshot.childPrefix.set(quoteId, childPrefix);
  const pmChildren = blocks.flatMap((b) => blockNode(ctx, b, childPrefix));
  linkSiblings(ctx, quoteId, pmChildren);
  const content = pmChildren.length ? pmChildren : [schema.nodes.paragraph.create()];
  const pm = schema.nodes.blockquote.create({ src: srcOf(ctx, node.from, node.to), srcId: quoteId }, content);
  return register(ctx, pm, quoteId, prefix);
}

function linkSiblings(ctx: Ctx, parentId: number, nodes: PMNode[]) {
  const ids = nodes.map((n) => n.attrs.srcId as number | null).filter((id): id is number => id !== null);
  if (ids.length === 0) return;
  ctx.snapshot.firstChild.set(parentId, ids[0]!);
  ctx.snapshot.lastChild.set(parentId, ids[ids.length - 1]!);
  for (let i = 1; i < ids.length; i++) ctx.snapshot.nextSibling.set(ids[i - 1]!, ids[i]!);
}

function blockNode(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode[] {
  try {
    return [blockNodeUnsafe(ctx, node, prefix)];
  } catch {
    // Never lose content: anything that fails to convert is kept as it was written.
    return [rawBlock(ctx, node.from, node.to, 'unknown', 'Markdown', prefix)];
  }
}

function blockNodeUnsafe(ctx: Ctx, node: SyntaxNode, prefix: string): PMNode {
  const body = ctx.body;
  switch (node.name) {
    case 'Paragraph':
      return paragraphBlock(ctx, node, prefix);
    case 'ATXHeading1': case 'ATXHeading2': case 'ATXHeading3':
    case 'ATXHeading4': case 'ATXHeading5': case 'ATXHeading6':
    case 'SetextHeading1': case 'SetextHeading2':
      return headingBlock(ctx, node, prefix);
    case 'Blockquote':
      return quoteBlock(ctx, node, prefix);
    case 'BulletList':
    case 'OrderedList':
      return listBlock(ctx, node, prefix);
    case 'FencedCode':
      return fencedBlock(ctx, node, prefix);
    case 'CodeBlock':
      return indentedBlock(ctx, node, prefix);
    case 'HorizontalRule': {
      const srcId = ctx.nextId++;
      const pm = schema.nodes.horizontal_rule.create({ src: srcOf(ctx, node.from, node.to), srcId, marker: body.slice(node.from, node.to) });
      return register(ctx, pm, srcId, prefix);
    }
    case 'Table':
      return tableBlock(ctx, node, prefix);
    case 'Container':
      return containerBlock(ctx, node, prefix);
    case 'FrontMatter':
      return rawBlock(ctx, node.from, node.to, 'front-matter', 'Front matter', prefix);
    case 'HTMLBlock':
      return rawBlock(ctx, node.from, node.to, 'html', 'HTML block', prefix);
    case 'CommentBlock':
      return rawBlock(ctx, node.from, node.to, 'comment', 'HTML comment', prefix);
    case 'LinkReference': {
      const label = node.getChild('LinkLabel');
      const text = label ? body.slice(label.from, label.to) : '';
      return text.startsWith('[^')
        ? rawBlock(ctx, node.from, node.to, 'footnote', `Footnote ${text.slice(1, -1)}`, prefix)
        : rawBlock(ctx, node.from, node.to, 'link-definition', `Link definition: ${text.slice(1, -1)}`, prefix);
    }
    default:
      return rawBlock(ctx, node.from, node.to, 'unknown', node.name === 'ProcessingInstructionBlock' ? 'HTML block' : 'Markdown', prefix);
  }
}

function collectDefinitions(ctx: Ctx, root: SyntaxNode) {
  const visit = (node: SyntaxNode) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LinkReference') {
        const label = c.getChild('LinkLabel');
        const url = c.getChild('URL');
        const title = c.getChild('LinkTitle');
        if (label && url) {
          const key = normalizeLabel(ctx.body.slice(label.from, label.to));
          if (!ctx.definitions.has(key)) {
            ctx.definitions.set(key, {
              href: stripAngle(ctx.body.slice(url.from, url.to)),
              title: title ? stripTitle(ctx.body.slice(title.from, title.to)) : null,
            });
          }
        }
      } else if (['Blockquote', 'BulletList', 'OrderedList', 'ListItem'].includes(c.name)) {
        visit(c);
      }
    }
  };
  visit(root);
}

export function parse(markdown: string): { doc: PMNode; snapshot: SourceSnapshot } {
  const preamble = markdown.startsWith(BOM) ? BOM : '';
  const orig = markdown.slice(preamble.length);
  const crlf: number[] = [];
  let lf = '';
  let last = 0;
  for (let i = orig.indexOf('\r\n'); i >= 0; i = orig.indexOf('\r\n', i + 2)) {
    lf += orig.slice(last, i);
    crlf.push(lf.length);
    lf += '\n';
    last = i + 2;
  }
  const body = lf + orig.slice(last);
  const tree = parseTree(body);
  // Line endings come from the original text; everything else from what the parser saw.
  const style = { ...detectStyle(body, tree), eol: crlf.length > 0 && crlf[0] === body.indexOf('\n') ? '\r\n' : '\n', finalNewline: orig.length === 0 || orig.endsWith('\n') } as const;
  const snapshot: SourceSnapshot = {
    text: markdown,
    preamble,
    body: orig,
    style: style as FileStyle,
    originals: new Map(),
    prefix: new Map(),
    childPrefix: new Map(),
    nextSibling: new Map(),
    firstChild: new Map(),
    lastChild: new Map(),
    empty: false,
  };
  const ctx: Ctx = { body, orig, crlf, snapshot, nextId: 0, definitions: new Map() };
  const root = tree.topNode;
  collectDefinitions(ctx, root);
  const blocks = children(root).flatMap((node) => blockNode(ctx, node, ''));
  linkSiblings(ctx, -1, blocks);
  snapshot.childPrefix.set(-1, '');
  snapshot.empty = blocks.length === 0;
  const doc = schema.nodes.doc.create(null, blocks.length ? blocks : [schema.nodes.paragraph.create()]);
  return { doc, snapshot };
}
