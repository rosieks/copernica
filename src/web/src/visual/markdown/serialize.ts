import type { Mark, Node as PMNode } from 'prosemirror-model';
import {
  delimiterRow,
  freshCode,
  freshDiagram,
  freshHeading,
  freshParagraph,
  freshRow,
  freshRule,
  inlineLine,
  escapeLineStart,
  splitLines,
  tableAligns,
} from './fresh';
import type { SourceSnapshot } from './parse';
import { STYLE_ATTRS } from './schema';
import { normalizeDestination } from './urls';

/**
 * Visual document → Markdown that preserves the source (research R4, contracts/fidelity.md
 * S1–S10). A block whose content is still what was parsed from its source text is written back
 * as that exact text; containers with changes keep their markers and their unchanged children;
 * changed paragraphs keep their unchanged lines. Only new or changed parts are written fresh,
 * in the file's style.
 */

/** The address a destination means. Autolink targets are literal text, without escapes. */
function addressOf(attrs: Record<string, unknown>, value: string): string {
  return attrs.form === 'autolink' || attrs.form === 'bare' ? value : normalizeDestination(value);
}

function sameAttrs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  for (const key of Object.keys(a)) {
    if (STYLE_ATTRS.has(key)) continue;
    const x = a[key];
    const y = b[key];
    // Destinations are stored as written; `<a b>` and escaped spellings mean the same address.
    if ((key === 'href' || key === 'src') && typeof x === 'string' && typeof y === 'string') {
      if (addressOf(a, x) !== addressOf(b, y)) return false;
    } else if (x !== y) return false;
  }
  return true;
}

function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((mark, i) => mark.type === b[i]!.type && sameAttrs(mark.attrs, b[i]!.attrs));
}

/** Content equality ignoring source bookkeeping and style-only attributes (FR-009). */
export function sameContent(a: PMNode, b: PMNode): boolean {
  if (a === b) return true;
  if (a.type !== b.type || !sameAttrs(a.attrs, b.attrs)) return false;
  // Marks on a line break do not change what is shown.
  if (a.type.name === 'soft_break' || a.type.name === 'hard_break') return true;
  if (!sameMarks(a.marks, b.marks)) return false;
  if (a.isText) return a.text === b.text;
  if (a.childCount !== b.childCount) return false;
  for (let i = 0; i < a.childCount; i++) if (!sameContent(a.child(i), b.child(i))) return false;
  return true;
}

function sameLine(a: readonly PMNode[], b: readonly PMNode[]): boolean {
  return a.length === b.length && a.every((node, i) => sameContent(node, b[i]!));
}

type Src = { from: number; to: number };

class Serializer {
  private readonly eol: string;

  constructor(private readonly snap: SourceSnapshot) {
    this.eol = snap.style.eol;
  }

  private srcOf(node: PMNode): Src | null {
    return (node.attrs.src as Src | null | undefined) ?? null;
  }

  private idOf(node: PMNode): number | null {
    return (node.attrs.srcId as number | null | undefined) ?? null;
  }

  /** The original node when `node` still sits where its source text can be reused. */
  private originalAt(node: PMNode, prefix: string): PMNode | null {
    const id = this.idOf(node);
    if (id === null || this.srcOf(node) === null) return null;
    if (this.snap.prefix.get(id) !== prefix) return null;
    return this.snap.originals.get(id) ?? null;
  }

  private slice(src: Src): string {
    return this.snap.body.slice(src.from, src.to);
  }

  document(doc: PMNode): string {
    const snap = this.snap;
    const first = doc.firstChild;
    if (snap.empty && doc.childCount === 1 && first?.type.name === 'paragraph' && first.content.size === 0) {
      return snap.text;
    }
    const firstId = snap.firstChild.get(-1);
    const lastId = snap.lastChild.get(-1);
    const head = first && firstId !== undefined && this.idOf(first) === firstId ? snap.body.slice(0, this.srcOf(snap.originals.get(firstId)!)!.from) : '';
    const last = doc.lastChild;
    const tail =
      last && lastId !== undefined && this.idOf(last) === lastId
        ? snap.body.slice(this.srcOf(snap.originals.get(lastId)!)!.to)
        : snap.style.finalNewline
          ? this.eol
          : '';
    return snap.preamble + head + this.children(doc, '', this.eol + this.eol) + tail;
  }

  /** Children of a container, joined by their original gaps where possible. */
  private children(parent: PMNode, prefix: string, freshGap: string, list?: PMNode): string {
    let out = '';
    let prev: PMNode | null = null;
    let number = list ? (list.attrs.start as number) : 0;
    parent.forEach((child, _offset, index) => {
      // An empty new paragraph (e.g. after Enter at the end) has no Markdown form; writing it
      // would only add blank lines.
      if (!list && child.type.name === 'paragraph' && child.content.size === 0 && this.srcOf(child) === null && parent.childCount > 1) return;
      if (prev) out += this.gap(prev, child, prefix, freshGap);
      if (list) {
        if (index > 0) number = this.nextNumber(prev!, number);
        out += this.listItem(child, prefix, list, number);
      } else {
        out += this.block(child, prefix);
      }
      prev = child;
    });
    return out;
  }

  private gap(prev: PMNode, cur: PMNode, prefix: string, freshGap: string): string {
    const prevId = this.idOf(prev);
    const curId = this.idOf(cur);
    if (
      prevId !== null &&
      curId !== null &&
      this.snap.nextSibling.get(prevId) === curId &&
      this.snap.prefix.get(prevId) === prefix &&
      this.snap.prefix.get(curId) === prefix
    ) {
      return this.snap.body.slice(this.srcOf(prev)!.to, this.srcOf(cur)!.from);
    }
    return freshGap;
  }

  block(node: PMNode, prefix: string): string {
    const original = this.originalAt(node, prefix);
    if (original && sameContent(node, original)) return this.slice(this.srcOf(node)!);
    const style = this.snap.style;
    switch (node.type.name) {
      case 'paragraph':
        return (original && this.mergeLines(node, original, prefix)) ?? freshParagraph(node, style, prefix);
      case 'heading':
        return freshHeading(node, style, prefix);
      case 'blockquote':
        return this.quote(node, original, prefix);
      case 'bullet_list':
      case 'ordered_list':
        return this.list(node, original, prefix);
      case 'code_block':
        return freshCode(node, style, prefix);
      case 'diagram':
        return freshDiagram(node, style, prefix);
      case 'horizontal_rule':
        return freshRule(node, style);
      case 'raw_block':
        return node.attrs.source as string;
      case 'table':
        return this.table(node, original, prefix);
      case 'list_item': {
        // A list item outside a list cannot occur in a valid document; write its content.
        return this.children(node, prefix, this.eol + this.eol);
      }
      default:
        return '';
    }
  }

  /** Text before a container's first original child (its markers) and after its last. */
  private frame(node: PMNode, original: PMNode | null): { opening: string | null; closing: string } {
    const id = this.idOf(node);
    const src = this.srcOf(node);
    if (!original || id === null || !src) return { opening: null, closing: '' };
    const firstId = this.snap.firstChild.get(id);
    const lastId = this.snap.lastChild.get(id);
    const firstSrc = firstId !== undefined ? this.srcOf(this.snap.originals.get(firstId)!) : null;
    const lastSrc = lastId !== undefined ? this.srcOf(this.snap.originals.get(lastId)!) : null;
    const opening = firstSrc ? this.snap.body.slice(src.from, firstSrc.from) : null;
    const closing = lastSrc && node.lastChild && this.idOf(node.lastChild) === lastId ? this.snap.body.slice(lastSrc.to, src.to) : '';
    return { opening, closing };
  }

  private quote(node: PMNode, original: PMNode | null, prefix: string): string {
    const { opening, closing } = this.frame(node, original);
    const id = this.idOf(node);
    const childPrefix = original && id !== null ? (this.snap.childPrefix.get(id) ?? prefix + '> ') : prefix + '> ';
    const freshGap = this.eol + childPrefix.trimEnd() + this.eol + childPrefix;
    return (opening ?? '> ') + this.children(node, childPrefix, freshGap) + closing;
  }

  private list(node: PMNode, original: PMNode | null, prefix: string): string {
    const { opening, closing } = this.frame(node, original);
    const tight = node.attrs.tight as boolean;
    const freshGap = tight ? this.eol + prefix : this.eol + prefix.trimEnd() + this.eol + prefix;
    return (opening ?? '') + this.children(node, prefix, freshGap, node) + closing;
  }

  private markerNumber(item: PMNode): number | null {
    const marker = item.attrs.marker as string | null;
    if (!marker || !/^\d/.test(marker)) return null;
    return Number(marker.slice(0, -1));
  }

  private nextNumber(prev: PMNode, prevNumber: number): number {
    const prevOwn = this.markerNumber(prev) ?? prevNumber;
    return this.snap.style.ordered.increment ? prevOwn + 1 : prevOwn;
  }

  private freshMarker(list: PMNode, number: number): string {
    if (list.type.name === 'bullet_list') return (list.attrs.marker as string | null) ?? this.snap.style.bullet;
    const delimiter = (list.attrs.delimiter as string | null) ?? this.snap.style.ordered.delimiter;
    return `${number}${delimiter}`;
  }

  private listItem(item: PMNode, prefix: string, list: PMNode, number: number): string {
    const original = this.originalAt(item, prefix);
    if (original && sameContent(item, original)) return this.slice(this.srcOf(item)!);
    const tight = list.attrs.tight as boolean;
    const id = this.idOf(item);
    const checked = item.attrs.checked as boolean | null;
    let opening: string;
    let childPrefix: string;
    if (original && id !== null) {
      const frame = this.frame(item, original);
      childPrefix = this.snap.childPrefix.get(id) ?? prefix + '  ';
      opening = frame.opening ?? this.slice(this.srcOf(item)!).replace(/\s*$/, '') + ' ';
      const was = original.attrs.checked as boolean | null;
      if (checked !== was) {
        if (checked === null) opening = opening.replace(/\[[ xX]\][ \t]?/, '');
        else if (was === null) opening = opening + (checked ? '[x] ' : '[ ] ');
        else opening = opening.replace(/\[[ xX]\]/, checked ? '[x]' : '[ ]');
      }
      const freshGap = tight ? this.eol + childPrefix : this.eol + childPrefix.trimEnd() + this.eol + childPrefix;
      return opening + this.children(item, childPrefix, freshGap) + frame.closing;
    }
    const marker = (item.attrs.marker as string | null) ?? this.freshMarker(list, number);
    childPrefix = prefix + ' '.repeat(marker.length + 1);
    opening = marker + ' ' + (checked === null ? '' : checked ? '[x] ' : '[ ] ');
    const freshGap = tight ? this.eol + childPrefix : this.eol + childPrefix.trimEnd() + this.eol + childPrefix;
    const content = this.children(item, childPrefix, freshGap);
    return content === '' ? opening.trimEnd() : opening + content;
  }

  private table(node: PMNode, original: PMNode | null, prefix: string): string {
    const style = this.snap.style;
    const aligns = tableAligns(node);
    const delimiter = (node.attrs.delimiterRow as string | null) ?? delimiterRow(aligns, style);
    const sameShape =
      original !== null && JSON.stringify(tableAligns(original)) === JSON.stringify(aligns) && (node.firstChild?.childCount ?? 0) === (original.firstChild?.childCount ?? 0);
    if (!original || !sameShape) {
      const rows: string[] = [];
      node.forEach((row, _o, i) => {
        rows.push(freshRow(row, style));
        if (i === 0) rows.push(delimiterRow(aligns, style));
      });
      return rows.join(this.eol + prefix);
    }
    const { opening, closing } = this.frame(node, original);
    let out = opening ?? '';
    let prev: PMNode | null = null;
    node.forEach((row, _o, index) => {
      if (prev) {
        const header = index === 1;
        out += this.gap(prev, row, prefix, header ? this.eol + prefix + delimiter + this.eol + prefix : this.eol + prefix);
      }
      const rowOriginal = this.originalAt(row, prefix);
      out += rowOriginal && sameContent(row, rowOriginal) ? this.slice(this.srcOf(row)!) : freshRow(row, style);
      prev = row;
    });
    if (node.childCount === 1 && closing === '') out += this.eol + prefix + delimiter;
    return out + closing;
  }

  /**
   * Line-level merge for a changed paragraph (FR-008): lines whose content is unchanged are
   * written back as they were; only the others are written fresh. Null when the paragraph's
   * lines cannot be matched safely (marks or raw syntax spanning a line break).
   */
  private mergeLines(node: PMNode, original: PMNode, prefix: string): string | null {
    const raw = this.slice(this.srcOf(node)!).split('\n');
    const oldLines = splitLines(original.content);
    const newLines = splitLines(node.content);
    if (oldLines.length !== raw.length) return null;
    const spansBreak = (lines: PMNode[][]) =>
      lines.some((line) => line.some((n) => (n.type.name === 'soft_break' || n.type.name === 'hard_break') && n.marks.length > 0));
    if (spansBreak(oldLines)) return null;
    if (original.content.size > 0 && oldLines.some((line) => line.some((n) => n.type.name === 'raw_inline' && (n.attrs.source as string).includes('\n')))) return null;

    // Longest common subsequence of unchanged lines.
    const n = oldLines.length;
    const m = newLines.length;
    const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i]![j] = sameLine(oldLines[i]!, newLines[j]!) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    const matchOf = new Array<number>(m).fill(-1);
    for (let i = 0, j = 0; i < n && j < m; ) {
      if (sameLine(oldLines[i]!, newLines[j]!)) {
        matchOf[j] = i;
        i++;
        j++;
      } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
      else j++;
    }

    const style = this.snap.style;
    let out = '';
    for (let j = 0; j < m; j++) {
      const i = matchOf[j]!;
      let line: string;
      if (i >= 0) {
        const text = raw[i]!.replace(/\r$/, '');
        if (j === 0) line = i === 0 ? text : text.replace(/^[ \t>]*/, '');
        else line = i === 0 ? prefix + text : text;
      } else {
        const fresh = escapeLineStart(inlineLine(newLines[j]!, style).replace(/^[ \t]+/, ''));
        line = j === 0 ? fresh : prefix + fresh;
      }
      if (j > 0) {
        const prevOriginal = matchOf[j - 1]!;
        out += prevOriginal >= 0 && raw[prevOriginal]!.endsWith('\r') ? '\r\n' : this.eol;
      }
      out += line;
    }
    return out;
  }
}

export function serialize(doc: PMNode, snapshot: SourceSnapshot): string {
  return new Serializer(snapshot).document(doc);
}
