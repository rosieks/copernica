import { GFM, parser as baseParser, type BlockContext, type Line, type MarkdownConfig } from '@lezer/markdown';
import type { Tree } from '@lezer/common';

/**
 * Lezer Markdown configured for the visual editor (research R2, R5): CommonMark + GFM, plus
 * the block constructs Markdig renders that a CommonMark parser would read as paragraphs or
 * rules. Grid tables, definition lists, footnotes and `[[_TOC_]]` are recognised later, in
 * parse.ts, from the paragraphs and link references Lezer produces.
 */

/** `---` front matter at the very start of the file, closed by `---` or `...`. */
const FrontMatter: MarkdownConfig = {
  defineNodes: [{ name: 'FrontMatter', block: true }],
  parseBlock: [
    {
      name: 'FrontMatter',
      before: 'IndentedCode',
      parse(cx: BlockContext, line: Line) {
        if (cx.lineStart !== 0 || !/^---[ \t]*$/.test(line.text)) return false;
        // An unclosed block runs to the end of the file. It is still kept verbatim as a
        // placeholder, so the only cost is that such a page is not editable visually.
        const from = cx.lineStart;
        let to = -1;
        while (cx.nextLine()) {
          if (/^(---|\.\.\.)[ \t]*$/.test(line.text)) {
            to = cx.lineStart + line.text.length;
            cx.nextLine();
            break;
          }
        }
        if (to < 0) to = cx.prevLineEnd();
        cx.addElement(cx.elt('FrontMatter', from, to));
        return true;
      },
    },
  ],
};

const containerOpen = /^(:{3,})[ \t]*(\S*)/;

/** Markdig custom containers: `::: name` … `:::` (Azure DevOps uses `::: mermaid`). */
const Containers: MarkdownConfig = {
  defineNodes: [{ name: 'Container', block: true }, { name: 'ContainerInfo' }],
  parseBlock: [
    {
      name: 'Container',
      before: 'IndentedCode',
      parse(cx: BlockContext, line: Line) {
        const open = containerOpen.exec(line.text.slice(line.pos));
        if (!open || line.indent - line.baseIndent >= 4) return false;
        const colons = open[1]!.length;
        const from = cx.lineStart + line.pos;
        const children = [];
        if (open[2]) {
          const infoFrom = from + line.text.slice(line.pos).indexOf(open[2]);
          children.push(cx.elt('ContainerInfo', infoFrom, infoFrom + open[2].length));
        }
        let to = cx.lineStart + line.text.length;
        let depth = 1;
        // `Line.depth` (contexts matched on this line) exists at runtime but is not in the typings.
        while (cx.nextLine() && (line as Line & { depth: number }).depth >= cx.depth) {
          to = cx.lineStart + line.text.length;
          const rest = line.text.slice(line.pos);
          const m = /^(:{3,})[ \t]*(\S*)[ \t]*$/.exec(rest);
          if (m && m[2]) depth++;
          else if (m && m[1]!.length >= colons && --depth === 0) {
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt('Container', from, to, children));
        return true;
      },
    },
  ],
};

export const parser = baseParser.configure([GFM, FrontMatter, Containers]);

export function parseTree(text: string): Tree {
  return parser.parse(text);
}
