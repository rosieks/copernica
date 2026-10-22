import { Schema, type DOMOutputSpec, type Mark, type Node, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { isAllowedUrl, normalizeDestination } from './urls';

/**
 * The visual editor's document schema (contracts/fidelity.md §1). It is the allow-list the
 * constitution's visual-editor exception requires: only these types exist, `toDOM` builds
 * fixed tags and classes, and `parseDOM` (used by paste) reads a fixed set of attributes,
 * never `style` or event handlers.
 *
 * Blocks that came from the source carry `src` (offsets into the source snapshot) and `srcId`
 * (source order). Attributes such as `marker`, `syntax` or `fence` remember how the source
 * wrote a construct so that changed blocks are written back the same way. Neither kind is
 * rendered into the DOM, so blocks copied through the clipboard become new content.
 */

const sourceAttrs = { src: { default: null }, srcId: { default: null } };

type Align = 'left' | 'center' | 'right' | null;

function alignFromDom(dom: HTMLElement): Align {
  const value = (dom.getAttribute('align') ?? '').toLowerCase();
  return value === 'left' || value === 'center' || value === 'right' ? value : null;
}

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'inline*',
  cellAttributes: {
    align: {
      default: null,
      getFromDOM: (dom) => alignFromDom(dom),
      setDOMAttr: (value, attrs) => {
        if (value) attrs.class = `visual-align-${value as string}`;
      },
    },
  },
});

const nodes = {
  doc: { content: 'block+' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: { ...sourceAttrs },
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },

  heading: {
    group: 'block',
    content: 'inline*',
    defining: true,
    attrs: { ...sourceAttrs, level: { default: 1 }, syntax: { default: null } },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node) => [`h${node.attrs.level as number}`, 0],
  },

  blockquote: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { ...sourceAttrs },
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },

  bullet_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { ...sourceAttrs, tight: { default: true }, marker: { default: null } },
    parseDOM: [{ tag: 'ul' }],
    toDOM: (node) => ['ul', node.attrs.tight ? { class: 'visual-tight' } : {}, 0],
  },

  ordered_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { ...sourceAttrs, start: { default: 1 }, tight: { default: true }, delimiter: { default: null } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => {
          const start = Number((dom as HTMLElement).getAttribute('start') ?? '1');
          return { start: Number.isInteger(start) && start >= 0 ? start : 1 };
        },
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = {};
      if (node.attrs.start !== 1) attrs.start = String(node.attrs.start);
      if (node.attrs.tight) attrs.class = 'visual-tight';
      return ['ol', attrs, 0];
    },
  },

  list_item: {
    content: 'block+',
    defining: true,
    attrs: { ...sourceAttrs, checked: { default: null }, marker: { default: null } },
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom) => {
          const box = (dom as HTMLElement).querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]');
          return { checked: box ? (box as HTMLInputElement).checked : null };
        },
      },
    ],
    toDOM: (node) =>
      node.attrs.checked === null
        ? ['li', 0]
        : ['li', { class: 'visual-task', 'data-checked': node.attrs.checked ? 'true' : 'false' }, 0],
  },

  code_block: {
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    attrs: { ...sourceAttrs, language: { default: '' }, fence: { default: null } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom) => {
          const code = (dom as HTMLElement).querySelector('code');
          const match = /(?:^|\s)language-([\w+#.-]+)/.exec(code?.className ?? '');
          return { language: match ? match[1] : '' };
        },
      },
    ],
    toDOM: (node) => ['pre', ['code', node.attrs.language ? { 'data-language': node.attrs.language } : {}, 0]],
  },

  diagram: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: { ...sourceAttrs, source: { default: '' }, syntax: { default: 'fence' } },
    toDOM: (node) => ['pre', { class: 'visual-diagram-source' }, ['code', node.attrs.source as string]],
  },

  horizontal_rule: {
    group: 'block',
    attrs: { ...sourceAttrs, marker: { default: null } },
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },

  raw_block: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: { ...sourceAttrs, source: { default: '' }, kind: { default: 'unknown' }, label: { default: 'Markdown' } },
    parseDOM: [
      {
        tag: 'div[data-raw]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return { source: el.getAttribute('data-raw') ?? '', kind: el.getAttribute('data-kind') ?? 'unknown', label: el.getAttribute('data-label') ?? 'Markdown' };
        },
      },
    ],
    toDOM: (node) => [
      'div',
      { class: 'visual-raw', 'data-raw': node.attrs.source, 'data-kind': node.attrs.kind, 'data-label': node.attrs.label },
      node.attrs.label as string,
    ],
  },

  ...tables,
  table: { ...tables.table, attrs: { ...sourceAttrs, delimiterRow: { default: null } } },
  table_row: { ...tables.table_row, attrs: { ...sourceAttrs } },

  text: { group: 'inline' },

  soft_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    toDOM: () => ['span', { class: 'visual-soft-break' }, ' '],
    parseDOM: [{ tag: 'span.visual-soft-break' }],
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    attrs: { marker: { default: null } },
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },

  image: {
    inline: true,
    group: 'inline',
    atom: true,
    draggable: true,
    attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null } },
    parseDOM: [
      {
        tag: 'img',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute('data-src') ?? el.getAttribute('src') ?? '',
            alt: el.getAttribute('alt') ?? '',
            title: el.getAttribute('title'),
          };
        },
      },
    ],
    // No `src`: the editor's node view decides what may be loaded (research R9).
    toDOM: (node) => {
      const attrs: Record<string, string> = { 'data-src': node.attrs.src as string, alt: node.attrs.alt as string };
      if (node.attrs.title) attrs.title = node.attrs.title as string;
      return ['img', attrs];
    },
  },

  image_upload: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    attrs: { key: { default: '' }, name: { default: '' } },
    toDOM: (node) => ['span', { class: 'visual-upload' }, `Uploading ${node.attrs.name as string}…`],
  },

  raw_inline: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { source: { default: '' }, kind: { default: 'unknown' }, label: { default: 'Markdown' } },
    parseDOM: [
      {
        tag: 'span[data-raw]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return { source: el.getAttribute('data-raw') ?? '', kind: el.getAttribute('data-kind') ?? 'unknown', label: el.getAttribute('data-label') ?? 'Markdown' };
        },
      },
    ],
    toDOM: (node) => [
      'span',
      { class: 'visual-raw-inline', 'data-raw': node.attrs.source, 'data-kind': node.attrs.kind, 'data-label': node.attrs.label },
      node.attrs.label as string,
    ],
  },
} satisfies Record<string, NodeSpec>;

function linkDom(mark: Mark): DOMOutputSpec {
  const href = mark.attrs.href as string;
  const attrs: Record<string, string> = { 'data-href': href };
  if (isAllowedUrl(href, 'link')) attrs.href = normalizeDestination(href);
  else attrs.class = 'visual-link--blocked';
  if (mark.attrs.title) attrs.title = mark.attrs.title as string;
  return ['a', attrs, 0];
}

const marks = {
  link: {
    attrs: { href: { default: '' }, title: { default: null }, form: { default: 'inline' }, ref: { default: null }, refStyle: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href], a[data-href]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const href = el.getAttribute('data-href') ?? el.getAttribute('href') ?? '';
          return { href, title: el.getAttribute('title') };
        },
      },
    ],
    toDOM: linkDom,
  },
  em: {
    attrs: { marker: { default: null } },
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
    toDOM: () => ['em', 0],
  },
  strong: {
    attrs: { marker: { default: null } },
    parseDOM: [
      { tag: 'strong' },
      // Google Docs wraps whole documents in <b style="font-weight:normal">; only real bold counts.
      { tag: 'b', getAttrs: (dom) => ((dom as HTMLElement).id.startsWith('docs-internal-guid') ? false : null) },
    ],
    toDOM: () => ['strong', 0],
  },
  strike: {
    attrs: { marker: { default: null } },
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
    toDOM: () => ['s', 0],
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },
} satisfies Record<string, MarkSpec>;

export const schema = new Schema({ nodes, marks });

/** Attributes that only record how the source wrote something; ignored when comparing content. */
export const STYLE_ATTRS = new Set(['src', 'srcId', 'marker', 'syntax', 'fence', 'delimiter', 'delimiterRow', 'form', 'ref', 'refStyle', 'tight']);

export type { Node as PMNode };
