import type { Fragment, Mark, Node as PMNode } from 'prosemirror-model';
import type { FileStyle } from './style';

/**
 * Fresh Markdown for new and changed content (contracts/fidelity.md S6, S7). Escaping is
 * minimal: a character is escaped only where it could start or end Markdown syntax. Unchanged
 * content never comes through here; the serializer writes it back from the source.
 */

const MARK_ORDER = ['link', 'strong', 'em', 'strike', 'code'];
const EMPHASIS = new Set(['strong', 'em', 'strike']);

function sortMarks(marks: readonly Mark[]): Mark[] {
  return [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type.name) - MARK_ORDER.indexOf(b.type.name));
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

/** Escapes text so it reads as literal text inside a paragraph, heading or table cell. */
export function escapeText(text: string, inTable = false): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    switch (ch) {
      case '\\':
      case '`':
      case '*':
      case '[':
      case ']':
      case '~':
        out += '\\' + ch;
        break;
      case '_':
        // Intraword underscores cannot open or close emphasis.
        out += isWordChar(text[i - 1]) && isWordChar(next) ? ch : '\\' + ch;
        break;
      case '<':
        out += next !== undefined && /[A-Za-z/!?]/.test(next) ? '\\<' : ch;
        break;
      case '&':
        out += /^&(#\d+|#x[\da-f]+|\w+);/i.test(text.slice(i)) ? '\\&' : ch;
        break;
      case '|':
        out += inTable ? '\\|' : ch;
        break;
      case '@':
        // Text that looks like an email address would become a link (GFM autolinks).
        out += /[\w.+-]/.test(text[i - 1] ?? '') && /[A-Za-z0-9]/.test(next ?? '') ? '\\@' : ch;
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** Escapes what would make a line start a block: headings, lists, quotes, setext underlines. */
export function escapeLineStart(line: string): string {
  let m: RegExpExecArray | null;
  if (/^#{1,6}(\s|$)/.test(line)) return '\\' + line;
  if (/^[-+](\s|$)/.test(line)) return '\\' + line;
  if (/^>/.test(line)) return '\\' + line;
  if (/^=+\s*$/.test(line)) return '\\' + line;
  if ((m = /^(\d{1,9})([.)])(\s|$)/.exec(line))) return m[1]! + '\\' + line.slice(m[1]!.length);
  return line;
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((n, r) => Math.max(n, r.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && text.trim() !== '') ? ' ' : '';
  return fence + pad + text + pad + fence;
}

function balancedParens(url: string): boolean {
  let depth = 0;
  for (const ch of url) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * A link or image destination. Destinations parsed from the source are kept exactly as written
 * (with their escapes and angle brackets); new ones are wrapped in `<…>` when they need it.
 */
function destination(url: string): string {
  if (url.startsWith('<') && url.endsWith('>')) return url;
  if (url === '' || /[\s<>]/.test(url) || !balancedParens(url) || url.endsWith('\\')) {
    return '<' + url.replace(/[<>]/g, (c) => encodeURIComponent(c)) + '>';
  }
  return url;
}

/** Autolink targets are literal text; as a link destination their backslashes and parentheses are escaped. */
function literalDestination(url: string): string {
  return url.replace(/[\\()]/g, '\\$&').replace(/[\s<>]/g, (c) => encodeURIComponent(c));
}

/** Titles are kept as written (escapes included), so only the delimiters are chosen here. */
function titlePart(title: string | null | undefined): string {
  if (!title) return '';
  if (!title.includes('"')) return ` "${title}"`;
  if (!title.includes("'")) return ` '${title}'`;
  if (!/[()]/.test(title)) return ` (${title})`;
  return ` "${title.replace(/(^|[^\\])"/g, '$1\\"')}"`;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function delimiterOf(mark: Mark, style: FileStyle): string {
  switch (mark.type.name) {
    case 'strong':
      return (mark.attrs.marker as string | null) ?? style.strong;
    case 'em':
      return (mark.attrs.marker as string | null) ?? style.emphasis;
    case 'strike':
      return (mark.attrs.marker as string | null) ?? '~~';
    case 'link':
      return '[';
    default:
      return '';
  }
}

function closeLink(mark: Mark, text: string): string {
  const href = mark.attrs.href as string;
  const ref = mark.attrs.ref as string | null;
  if (mark.attrs.form === 'reference' && ref !== null) {
    // Shortcut and collapsed references use the link text as the label; once the text
    // changes, the label must be written out to keep pointing at the definition.
    const sameLabel = normalizeLabel(text) === normalizeLabel(ref);
    if (sameLabel && mark.attrs.refStyle === 'shortcut') return ']';
    if (sameLabel && mark.attrs.refStyle === 'collapsed') return '][]';
    return `][${ref}]`;
  }
  const literal = mark.attrs.form === 'autolink' || mark.attrs.form === 'bare';
  return `](${literal ? literalDestination(href) : destination(href)}${titlePart(mark.attrs.title as string | null)})`;
}

/** One inline node as Markdown, ignoring its marks. */
function atom(node: PMNode, inTable: boolean): string {
  switch (node.type.name) {
    case 'image': {
      const alt = node.attrs.alt as string;
      return `![${alt}](${destination(node.attrs.src as string)}${titlePart(node.attrs.title as string | null)})`;
    }
    case 'raw_inline':
      return node.attrs.source as string;
    case 'text':
      return node.marks.some((m) => m.type.name === 'code') ? codeSpan(node.text!) : escapeText(node.text!, inTable);
    default:
      return '';
  }
}

/** Splits inline content into lines at soft and hard breaks. */
export function splitLines(content: Fragment): PMNode[][] {
  const lines: PMNode[][] = [];
  let current: PMNode[] = [];
  lines.push(current);
  content.forEach((node) => {
    current.push(node);
    if (node.type.name === 'soft_break' || node.type.name === 'hard_break') {
      current = [];
      lines.push(current);
    }
  });
  return lines;
}

interface OpenMark {
  mark: Mark;
  /** Offset of the opening delimiter in the output. */
  at: number;
  delimiter: string;
  /** Plain text inside a link, to decide how a reference or autolink is closed. */
  text: string;
}

/** Serializes one line of inline nodes. Marks never span lines in fresh output. */
export function inlineLine(nodes: readonly PMNode[], style: FileStyle, inTable = false): string {
  let out = '';
  let open: OpenMark[] = [];

  /** Closes `open[keep..]`; `next` is the character that will follow. */
  const close = (keep: number, next: string | undefined) => {
    if (open.length <= keep) return;
    const closing = open.slice(keep);
    // Whitespace must sit outside emphasis delimiters (flanking rules).
    const trailing = closing.some((o) => EMPHASIS.has(o.mark.type.name)) ? (/[ \t]+$/.exec(out)?.[0] ?? '') : '';
    if (trailing) out = out.slice(0, -trailing.length);
    for (let i = open.length - 1; i >= keep; i--) {
      const o = open[i]!;
      const name = o.mark.type.name;
      if (name === 'link') {
        const href = o.mark.attrs.href as string;
        const form = o.mark.attrs.form as string;
        const plain = o.text === href && i === open.length - 1 && out.length - o.at - 1 === escapeText(href).length;
        if (plain && form === 'autolink') {
          out = out.slice(0, o.at) + `<${href}>`;
        } else if (plain && form === 'bare') {
          // A bare address only links at a word boundary; glued to a word it needs `<…>`.
          const glued = isWordChar(out[o.at - 1]) || isWordChar(next);
          out = out.slice(0, o.at) + (glued && /^[a-z][a-z0-9+.-]*:/i.test(href) ? `<${href}>` : href);
        } else {
          // Reference labels are matched against the text as written, escapes included.
          out += closeLink(o.mark, out.slice(o.at + 1));
        }
      } else {
        // `_` cannot open or close emphasis inside a word; switch both delimiters to `*`.
        let delimiter = o.delimiter;
        if (delimiter.startsWith('_') && (isWordChar(next) || isWordChar(out[o.at - 1]))) {
          delimiter = delimiter.replace(/_/g, '*');
          out = out.slice(0, o.at) + delimiter + out.slice(o.at + delimiter.length);
        }
        out += delimiter;
      }
    }
    open = open.slice(0, keep);
    out += trailing;
  };

  /** How many nodes from `index` on carry `mark`: longer-lasting marks are opened first. */
  const runLength = (mark: Mark, index: number) => {
    let n = 0;
    while (index + n < nodes.length && mark.isInSet(nodes[index + n]!.marks)) n++;
    return n;
  };

  for (const [index, node] of nodes.entries()) {
    if (node.type.name === 'soft_break' || node.type.name === 'image_upload') continue;
    if (node.type.name === 'hard_break') {
      close(0, undefined);
      out += inTable ? ' ' : ((node.attrs.marker as string | null) ?? '\\');
      continue;
    }
    // Keep marks that are already open (outermost first), then open the rest in a fixed order.
    const nodeMarks = node.marks.filter((m) => m.type.name !== 'code');
    let keep = 0;
    while (keep < open.length && open[keep]!.mark.isInSet(nodeMarks)) keep++;
    const kept = open.slice(0, keep).map((o) => o.mark);
    // Links stay outermost; among the others the longest run opens first.
    const fresh = sortMarks(nodeMarks.filter((m) => !m.isInSet(kept)));
    const added = [
      ...fresh.filter((m) => m.type.name === 'link'),
      ...fresh.filter((m) => m.type.name !== 'link').sort((a, b) => runLength(b, index) - runLength(a, index)),
    ];

    let piece = atom(node, inTable);
    close(keep, piece[0]);
    if (added.some((m) => EMPHASIS.has(m.type.name))) {
      const leading = /^[ \t]+/.exec(piece)?.[0] ?? '';
      out += leading;
      piece = piece.slice(leading.length);
    }
    for (const mark of added) {
      const delimiter = delimiterOf(mark, style);
      open.push({ mark, at: out.length, delimiter, text: '' });
      out += delimiter;
    }
    out += piece;
    for (const o of open) if (o.mark.type.name === 'link') o.text += node.isText ? node.text! : '\u0000';
  }
  close(0, undefined);
  return out;
}

/** Inline content as Markdown lines, with block-start characters escaped on every line. */
export function inlineLines(content: Fragment, style: FileStyle): string[] {
  return splitLines(content).map((line) => escapeLineStart(inlineLine(line, style).replace(/^[ \t]+/, '')));
}

export function freshParagraph(node: PMNode, style: FileStyle, prefix: string): string {
  return inlineLines(node.content, style).join(style.eol + prefix);
}

export function freshHeading(node: PMNode, style: FileStyle, prefix: string): string {
  const level = node.attrs.level as number;
  const lines = splitLines(node.content).map((line) => inlineLine(line, style).trim());
  const syntax = (node.attrs.syntax as string | null) ?? style.heading;
  if (syntax === 'setext' && level <= 2 && lines.some(Boolean)) {
    // Setext headings may span lines, so their soft breaks are kept.
    const text = lines.map(escapeLineStart).join(style.eol + prefix);
    const width = Math.max(3, Math.min(Math.max(...lines.map((l) => l.length)), 80));
    return text + style.eol + prefix + (level === 1 ? '=' : '-').repeat(width);
  }
  let text = lines.filter(Boolean).join(' ');
  if (text.endsWith('#')) text = text.slice(0, -1) + '\\#';
  const hashes = '#'.repeat(level);
  return hashes + (text ? ' ' + text : '') + (style.closingHashes && text ? ' ' + hashes : '');
}

function fenceFor(content: string, char: '`' | '~', length: number): string {
  let longest = 0;
  for (const line of content.split('\n')) {
    const m = new RegExp(`^\\s*(\\${char}+)`).exec(line);
    if (m) longest = Math.max(longest, m[1]!.length);
  }
  return char.repeat(Math.max(length, longest + 1));
}

export function freshCode(node: PMNode, style: FileStyle, prefix: string): string {
  const content = node.textContent;
  const lines = content === '' ? [] : content.split('\n');
  const fence = node.attrs.fence as string | null;
  if (fence === '') {
    return (lines.length ? lines : ['']).map((l) => '    ' + l).join(style.eol + prefix);
  }
  const char = fence ? (fence[0] as '`' | '~') : style.fence.char;
  const marker = fenceFor(content, char, fence ? fence.length : style.fence.length);
  const body = lines.map((l) => style.eol + prefix + l).join('');
  return marker + ((node.attrs.language as string) ?? '') + body + style.eol + prefix + marker;
}

export function freshDiagram(node: PMNode, style: FileStyle, prefix: string): string {
  const source = node.attrs.source as string;
  const lines = source === '' ? [] : source.split('\n');
  const body = lines.map((l) => style.eol + prefix + l).join('');
  if (node.attrs.syntax === 'container') return '::: mermaid' + body + style.eol + prefix + ':::';
  const marker = fenceFor(source, style.fence.char, style.fence.length);
  return marker + 'mermaid' + body + style.eol + prefix + marker;
}

export function freshRule(node: PMNode, style: FileStyle): string {
  return (node.attrs.marker as string | null) ?? style.rule;
}

type Align = 'left' | 'center' | 'right' | null;

export function delimiterRow(aligns: readonly Align[], style: FileStyle): string {
  const cells = aligns.map((a) => (a === 'left' ? ':---' : a === 'center' ? ':---:' : a === 'right' ? '---:' : '---'));
  return pipeRow(cells, style);
}

function pipeRow(cells: readonly string[], style: FileStyle): string {
  const inner = cells.join(' | ');
  return (style.tablePipes.leading ? '| ' : '') + inner + (style.tablePipes.trailing ? ' |' : '');
}

export function freshRow(row: PMNode, style: FileStyle): string {
  const cells: string[] = [];
  row.forEach((cell) => {
    const nodes: PMNode[] = [];
    cell.content.forEach((n) => {
      nodes.push(n);
    });
    cells.push(inlineLine(nodes, style, true).trim());
  });
  if (!style.tablePipes.leading && cells[0] === '') cells[0] = ' ';
  return pipeRow(cells, style);
}

export function tableAligns(table: PMNode): Align[] {
  const aligns: Align[] = [];
  table.firstChild?.forEach((cell) => {
    aligns.push((cell.attrs.align as Align) ?? null);
  });
  return aligns;
}
