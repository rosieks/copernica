import type { SyntaxNode, Tree } from '@lezer/common';
import { parseTree } from './lezer';

/** How a file writes Markdown; applied to new and changed blocks (research R6). */
export interface FileStyle {
  bullet: '-' | '*' | '+';
  ordered: { delimiter: '.' | ')'; increment: boolean };
  emphasis: '*' | '_';
  strong: '**' | '__';
  fence: { char: '`' | '~'; length: number };
  heading: 'atx' | 'setext';
  closingHashes: boolean;
  rule: string;
  eol: '\n' | '\r\n';
  finalNewline: boolean;
  listIndent: number;
  tablePipes: { leading: boolean; trailing: boolean };
}

export const DEFAULT_STYLE: FileStyle = {
  bullet: '-',
  ordered: { delimiter: '.', increment: true },
  emphasis: '*',
  strong: '**',
  fence: { char: '`', length: 3 },
  heading: 'atx',
  closingHashes: false,
  rule: '---',
  eol: '\n',
  finalNewline: true,
  listIndent: 1,
  tablePipes: { leading: true, trailing: true },
};

/** Counts votes; the most frequent value wins, ties keep the default. */
class Votes<T> {
  private counts = new Map<T, number>();
  add(value: T) {
    this.counts.set(value, (this.counts.get(value) ?? 0) + 1);
  }
  winner(fallback: T): T {
    let best = fallback;
    let bestCount = this.counts.get(fallback) ?? 0;
    let tied = false;
    for (const [value, count] of this.counts) {
      if (value === fallback) continue;
      if (count > bestCount) {
        best = value;
        bestCount = count;
        tied = false;
      } else if (count === bestCount && count > 0) {
        tied = true;
      }
    }
    return tied ? fallback : best;
  }
}

function lineOf(text: string, pos: number): string {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  const end = text.indexOf('\n', pos);
  return text.slice(start, end < 0 ? text.length : end).replace(/\r$/, '');
}

export function detectStyle(text: string, tree: Tree = parseTree(text)): FileStyle {
  const bullet = new Votes<FileStyle['bullet']>();
  const delimiter = new Votes<'.' | ')'>();
  const increment = new Votes<boolean>();
  const emphasis = new Votes<'*' | '_'>();
  const strong = new Votes<'**' | '__'>();
  const fence = new Votes<string>();
  const heading = new Votes<'atx' | 'setext'>();
  const closing = new Votes<boolean>();
  const rule = new Votes<string>();
  const indent = new Votes<number>();
  const leading = new Votes<boolean>();
  const trailing = new Votes<boolean>();

  const visitList = (list: SyntaxNode, ordered: boolean) => {
    const numbers: number[] = [];
    for (let item = list.firstChild; item; item = item.nextSibling) {
      if (item.name !== 'ListItem') continue;
      const mark = item.getChild('ListMark');
      if (!mark) continue;
      const marker = text.slice(mark.from, mark.to);
      if (ordered) {
        delimiter.add(marker.endsWith(')') ? ')' : '.');
        numbers.push(Number(marker.slice(0, -1)));
      } else {
        bullet.add(marker as FileStyle['bullet']);
      }
      const content = mark.nextSibling;
      if (content && content.from > mark.to && !text.slice(mark.to, content.from).includes('\n')) {
        indent.add(content.from - mark.to);
      }
    }
    if (ordered && numbers.length > 1) increment.add(numbers.some((n, i) => i > 0 && n !== numbers[0]));
  };

  tree.iterate({
    enter: (ref) => {
      const node = ref.node;
      switch (ref.name) {
        case 'BulletList':
          visitList(node, false);
          break;
        case 'OrderedList':
          visitList(node, true);
          break;
        case 'Emphasis':
        case 'StrongEmphasis': {
          const mark = node.getChild('EmphasisMark');
          if (mark) {
            const ch = text[mark.from] as '*' | '_';
            if (ref.name === 'Emphasis') emphasis.add(ch);
            else strong.add(ch === '_' ? '__' : '**');
          }
          break;
        }
        case 'FencedCode': {
          const mark = node.getChild('CodeMark');
          if (mark) fence.add(text.slice(mark.from, mark.to));
          break;
        }
        case 'SetextHeading1':
        case 'SetextHeading2':
          heading.add('setext');
          break;
        case 'HorizontalRule':
          rule.add(text.slice(ref.from, ref.to).trim());
          break;
        case 'TableHeader':
        case 'TableRow': {
          const line = lineOf(text, ref.from).trim();
          leading.add(line.startsWith('|'));
          trailing.add(line.endsWith('|') && !line.endsWith('\\|'));
          break;
        }
        default:
          if (ref.name.startsWith('ATXHeading')) {
            heading.add('atx');
            const marks = node.getChildren('HeaderMark');
            closing.add(marks.length > 1);
          }
      }
    },
  });

  const fenceText = fence.winner('```');
  const firstBreak = text.indexOf('\n');
  return {
    bullet: bullet.winner(DEFAULT_STYLE.bullet),
    ordered: { delimiter: delimiter.winner('.'), increment: increment.winner(true) },
    emphasis: emphasis.winner(DEFAULT_STYLE.emphasis),
    strong: strong.winner(DEFAULT_STYLE.strong),
    fence: { char: fenceText[0] === '~' ? '~' : '`', length: Math.max(3, fenceText.length) },
    heading: heading.winner('atx'),
    closingHashes: closing.winner(false),
    rule: rule.winner(DEFAULT_STYLE.rule),
    eol: firstBreak > 0 && text[firstBreak - 1] === '\r' ? '\r\n' : '\n',
    finalNewline: text.length === 0 ? true : text.endsWith('\n'),
    listIndent: indent.winner(1),
    tablePipes: { leading: leading.winner(true), trailing: trailing.winner(true) },
  };
}
