import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { svgImageSrc } from '../diagrams/display';
import { rendererClient } from '../diagrams/rendererClient';
import { currentThemeTokens } from '../diagrams/theme';
import { resolveImageSrc, type PendingImage } from './markdown/urls';

/**
 * Node views for content the editor shows but does not edit as text (contracts/ui.md §5).
 * Every element is built with `createElement` and `textContent`; user-derived strings never
 * become markup (constitution v1.4.0, visual-editor exception).
 */

export interface NodeViewContext {
  spaceId: string;
  pagePath: string;
  /** Uploads of this edit that are not saved yet (003). */
  pending: () => readonly PendingImage[];
  /** Opens the diagram dialog for the diagram at `pos` (US4). */
  onEditDiagram?: (pos: number) => void;
}

/** Same limit as the server's (004 DiagramBlock.MaxSourceLength). */
export const MAX_DIAGRAM_SOURCE = 20000;

export function diagramType(source: string): string {
  const line = source.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('%%')) ?? '';
  return line.split(/\s+/)[0] || 'diagram';
}

/**
 * Draws Mermaid source with the isolated renderer of 004 into `img`. Resolves with an error
 * message, or null when drawn.
 */
export async function drawDiagram(source: string, img: HTMLImageElement): Promise<string | null> {
  if (source.length > MAX_DIAGRAM_SOURCE) return 'This diagram is too large to draw (over 20 000 characters).';
  try {
    const svg = await rendererClient().render(source, currentThemeTokens());
    img.src = svgImageSrc(svg);
    return null;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : 'The diagram could not be drawn.';
  }
}

/** A diagram shown drawn, as on the page (FR-021); edited in the diagram dialog. */
class DiagramView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;
  private readonly img = el('img', 'visual-diagram__image');
  private readonly status = el('p', 'visual-diagram__status');
  private readonly themeObserver: MutationObserver;
  private drawn: { source: string; dark: boolean } | null = null;

  constructor(
    node: PMNode,
    private readonly getPos: () => number | undefined,
    private readonly ctx: NodeViewContext,
  ) {
    this.node = node;
    this.dom = el('figure', 'visual-diagram');
    this.dom.contentEditable = 'false';
    const edit = el('button', 'ui-button ui-button--secondary ui-button--sm visual-diagram__edit', 'Edit diagram');
    edit.type = 'button';
    edit.addEventListener('click', () => {
      const pos = this.getPos();
      if (pos !== undefined) this.ctx.onEditDiagram?.(pos);
    });
    this.img.hidden = true;
    this.dom.append(this.img, this.status, edit);
    this.draw();
    // Diagrams follow the theme like on the page (004 US3).
    this.themeObserver = new MutationObserver(() => this.draw());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  private draw() {
    const source = this.node.attrs.source as string;
    const dark = document.documentElement.classList.contains('dark');
    if (this.drawn && this.drawn.source === source && this.drawn.dark === dark) return;
    this.drawn = { source, dark };
    const name = `Diagram (${diagramType(source)})`;
    this.dom.setAttribute('aria-label', name);
    this.img.alt = name;
    this.status.textContent = 'Drawing diagram…';
    this.status.hidden = false;
    void drawDiagram(source, this.img).then((error) => {
      if (this.drawn?.source !== source) return;
      this.img.hidden = error !== null;
      this.status.hidden = error === null;
      this.status.textContent = error ? `This diagram could not be drawn: ${error}` : '';
    });
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.draw();
    return true;
  }

  stopEvent(event: Event) {
    return event.target instanceof HTMLButtonElement;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.themeObserver.disconnect();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function firstLine(source: string, max = 80): string {
  const line = source.split(/\r?\n/).find((l) => l.trim()) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Read-only placeholder for Markdown the visual editor does not represent (FR-011). */
class RawBlockView implements NodeView {
  dom: HTMLElement;

  constructor(node: PMNode) {
    const label = node.attrs.label as string;
    this.dom = el('div', 'visual-raw');
    this.dom.contentEditable = 'false';
    this.dom.setAttribute('role', 'group');
    this.dom.setAttribute('aria-label', `${label}, can be edited in Markdown mode`);
    this.dom.title = `${label} — can be edited in Markdown mode`;
    this.dom.append(el('span', 'visual-raw__label', label), el('code', 'visual-raw__source', firstLine(node.attrs.source as string)));
  }

  ignoreMutation() {
    return true;
  }
}

class RawInlineView implements NodeView {
  dom: HTMLElement;

  constructor(node: PMNode) {
    const kind = node.attrs.kind as string;
    const source = node.attrs.source as string;
    if (kind === 'entity') {
      // A character reference reads as the character it stands for.
      this.dom = el('span', 'visual-entity', node.attrs.label as string);
      this.dom.title = source;
    } else {
      const label = kind === 'html' ? 'HTML' : (node.attrs.label as string);
      this.dom = el('span', 'visual-raw-inline', firstLine(source, 40));
      this.dom.setAttribute('role', 'img');
      this.dom.setAttribute('aria-label', `${label}: ${firstLine(source, 60)}, can be edited in Markdown mode`);
      this.dom.title = `${label} — can be edited in Markdown mode`;
    }
    this.dom.contentEditable = 'false';
  }

  ignoreMutation() {
    return true;
  }
}

/** Unescapes the alt text as written in Markdown for display. */
function altText(raw: string): string {
  return raw.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

class ImageView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;

  constructor(
    node: PMNode,
    private readonly ctx: NodeViewContext,
  ) {
    this.node = node;
    this.dom = el('span', 'visual-image');
    this.dom.contentEditable = 'false';
    this.render();
  }

  private render() {
    const alt = altText(this.node.attrs.alt as string);
    const src = resolveImageSrc(this.node.attrs.src as string, this.ctx.spaceId, this.ctx.pagePath, this.ctx.pending());
    this.dom.replaceChildren();
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = alt;
      if (this.node.attrs.title) img.title = this.node.attrs.title as string;
      this.dom.append(img);
    } else {
      // External images are never loaded in the editor (research R9).
      const frame = el('span', 'visual-image__external');
      frame.setAttribute('role', 'img');
      frame.setAttribute('aria-label', alt ? `External image: ${alt}` : 'External image');
      frame.append(el('span', 'visual-image__external-label', 'External image (not shown in the editor)'));
      if (alt) frame.append(el('span', 'visual-image__alt', alt));
      this.dom.append(frame);
    }
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.src !== this.node.attrs.src || node.attrs.alt !== this.node.attrs.alt || node.attrs.title !== this.node.attrs.title) {
      this.node = node;
      this.render();
    }
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

/** List item; task items get a real checkbox that toggles `checked` (US1-6). */
class ListItemView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private box: HTMLInputElement | null = null;
  private task: boolean;

  constructor(
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
  ) {
    this.task = node.attrs.checked !== null;
    this.dom = el('li');
    if (this.task) {
      this.dom.className = 'visual-task';
      const box = el('input');
      box.type = 'checkbox';
      box.className = 'visual-task__box';
      box.checked = node.attrs.checked === true;
      box.contentEditable = 'false';
      box.setAttribute('aria-label', 'Done');
      box.addEventListener('change', () => {
        const pos = getPos();
        if (pos === undefined) return;
        const current = view.state.doc.nodeAt(pos);
        if (!current) return;
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, checked: box.checked }));
      });
      this.box = box;
      this.dom.append(box);
    }
    this.contentDOM = el('div', this.task ? 'visual-task__content' : undefined);
    this.dom.append(this.contentDOM);
  }

  update(node: PMNode) {
    if (node.type.name !== 'list_item' || (node.attrs.checked !== null) !== this.task) return false;
    if (this.box) this.box.checked = node.attrs.checked === true;
    return true;
  }

  stopEvent(event: Event) {
    return event.target === this.box;
  }

  ignoreMutation(mutation: { target: Node; type: string }) {
    return mutation.target === this.box || (mutation.target === this.dom && mutation.type === 'attributes');
  }
}

export function createNodeViews(ctx: NodeViewContext): Record<string, NodeViewConstructor> {
  return {
    raw_block: (node) => new RawBlockView(node),
    raw_inline: (node) => new RawInlineView(node),
    image: (node) => new ImageView(node, ctx),
    list_item: (node, view, getPos) => new ListItemView(node, view, getPos),
    diagram: (node, _view, getPos) => new DiagramView(node, getPos, ctx),
  };
}

export type { EditorView };
