import { useEffect, useState, type RefObject } from 'react';
import { ANCHOR_SKIP_ATTRIBUTE } from '../discussions/textAnchor';
import { diagramAltText, svgImageSrc } from './display';
import { rendererClient, type RendererClient } from './rendererClient';
import { currentThemeTokens } from './theme';
import './diagrams.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
// A warning triangle with an exclamation mark (decorative; the callout title carries the meaning).
const WARNING_PATH = 'M7.5 1.5 14 13H1L7.5 1.5ZM7 5.5h1v4H7v-4Zm0 5h1v1H7v-1Z';

export const DRAWING_STATUS = 'Drawing diagrams…';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function warningCallout(title: string, detail?: string): HTMLElement {
  const callout = el('div', 'ui-callout ui-callout--warning diagram__callout');
  callout.setAttribute('role', 'note');
  const icon = el('span', 'ui-callout__icon');
  icon.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 15 15');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', WARNING_PATH);
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  icon.append(svg);
  const body = el('div', 'ui-callout__body');
  body.append(el('p', 'ui-callout__title', title));
  if (detail) body.append(el('p', 'ui-callout__text diagram__message', detail));
  callout.append(icon, body);
  return callout;
}

/**
 * One diagram figure from the server (contracts/rendering.md) and the UI added around it
 * (contracts/ui.md). All added nodes live in one `data-anchor-skip` element, so discussion
 * anchors keep using the server text; the source `<pre>` is only hidden, never removed.
 */
class DiagramFigure {
  private readonly chrome = el('div', 'diagram__chrome');
  private readonly source: HTMLElement | null;
  private readonly text: string;
  private toggle: HTMLButtonElement | null = null;
  private sizeToggle: HTMLButtonElement | null = null;
  private image: HTMLImageElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private showingSource = false;
  private fullSize = false;
  private drawnTheme: boolean | null = null;

  constructor(
    private readonly figure: HTMLElement,
    private readonly client: RendererClient,
  ) {
    this.source = figure.querySelector<HTMLElement>('pre.diagram__source');
    this.text = this.source?.textContent ?? '';
    this.chrome.setAttribute(ANCHOR_SKIP_ATTRIBUTE, '');
    figure.insertBefore(this.chrome, this.source ?? figure.firstChild);
  }

  get tooLarge() {
    return this.figure.getAttribute('data-diagram-too-large') === 'true';
  }

  /** Draws the diagram; resolves when it is drawn or has failed. */
  async draw(isCancelled: () => boolean): Promise<void> {
    if (this.tooLarge || !this.source) {
      this.chrome.replaceChildren(warningCallout('This diagram is too large to draw (over 20 000 characters).'));
      return;
    }

    const theme = currentThemeTokens();
    if (!this.image) {
      const loading = el('div', 'diagram__loading', 'Drawing diagram…');
      this.chrome.replaceChildren(loading);
      this.source.hidden = true;
    }

    try {
      const svg = await this.client.render(this.text, theme);
      if (isCancelled()) return;
      this.showImage(svg);
      this.drawnTheme = theme.dark;
    } catch (error) {
      if (isCancelled()) return;
      this.forgetImage();
      this.source.hidden = false;
      const message = error instanceof Error ? error.message : String(error);
      this.chrome.replaceChildren(warningCallout('This diagram could not be drawn.', message));
    }
  }

  /** Redraws a drawn diagram when the theme has changed since it was drawn. */
  redraw(isCancelled: () => boolean) {
    if (this.image && this.drawnTheme !== document.documentElement.classList.contains('dark')) {
      void this.draw(isCancelled);
    }
  }

  private showImage(svg: string) {
    const name = this.figure.getAttribute('data-diagram-name') || 'Diagram';
    const description = this.figure.getAttribute('data-diagram-description');
    if (!this.image) {
      const toolbar = el('div', 'diagram__toolbar');
      const sizeToggle = el('button', 'ui-button ui-button--ghost ui-button--sm diagram__size');
      sizeToggle.type = 'button';
      sizeToggle.hidden = true;
      sizeToggle.addEventListener('click', () => this.setFullSize(!this.fullSize));
      const toggle = el('button', 'ui-button ui-button--ghost ui-button--sm diagram__toggle');
      toggle.type = 'button';
      toggle.addEventListener('click', () => this.setShowingSource(!this.showingSource));
      toolbar.append(sizeToggle, toggle);
      const image = el('img', 'diagram__image');
      image.alt = diagramAltText(name, description);
      image.decoding = 'async';
      image.addEventListener('load', () => this.updateSizeToggle());
      this.chrome.replaceChildren(toolbar, image);
      this.toggle = toggle;
      this.sizeToggle = sizeToggle;
      this.image = image;
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.updateSizeToggle());
        this.resizeObserver.observe(this.figure);
      }
      this.setFullSize(false);
      this.setShowingSource(false);
    }

    this.image.src = svgImageSrc(svg);
  }

  private setShowingSource(show: boolean) {
    this.showingSource = show;
    if (this.toggle) {
      this.toggle.textContent = show ? 'Show diagram' : 'Show diagram source';
      this.toggle.setAttribute('aria-expanded', String(show));
    }

    if (this.image) this.image.hidden = show;
    if (this.source) this.source.hidden = !show;
    this.updateSizeToggle();
  }

  /** Wide diagrams fit the column by default; full size scrolls inside the figure (FR-011). */
  private setFullSize(full: boolean) {
    this.fullSize = full;
    this.figure.classList.toggle('diagram--full-size', full);
    if (this.sizeToggle) this.sizeToggle.textContent = full ? 'Fit to width' : 'Show full size';
  }

  /** The size toggle is offered only while the drawn image is wider than the column. */
  private updateSizeToggle() {
    if (!this.image || !this.sizeToggle) return;
    const wider = this.image.naturalWidth > this.figure.clientWidth;
    if (!wider && this.fullSize) this.setFullSize(false);
    this.sizeToggle.hidden = !wider || this.showingSource;
  }

  private forgetImage() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.figure.classList.remove('diagram--full-size');
    this.fullSize = false;
    this.image = null;
    this.toggle = null;
    this.sizeToggle = null;
  }

  /** Restores the server markup. */
  dispose() {
    this.forgetImage();
    this.chrome.remove();
    if (this.source) this.source.hidden = false;
  }
}

/**
 * Draws the Mermaid figures inside `container` whenever `key` (the page HTML) changes, and
 * redraws them when the theme changes. Returns the text for a polite live region:
 * "Drawing diagrams…" while the first drawing of this HTML is in progress.
 */
export function useDiagrams(container: RefObject<HTMLElement | null>, key: unknown, client: RendererClient = rendererClient()): string {
  const [status, setStatus] = useState('');

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const figures = Array.from(root.querySelectorAll<HTMLElement>('figure[data-diagram="mermaid"]')).map((f) => new DiagramFigure(f, client));
    if (figures.length === 0) return;

    let cancelled = false;
    const isCancelled = () => cancelled;
    if (figures.some((f) => !f.tooLarge)) setStatus(DRAWING_STATUS);
    // Diagrams are drawn one after another by the renderer; the page text never waits for them.
    void Promise.all(figures.map((f) => f.draw(isCancelled))).then(() => {
      if (!cancelled) setStatus('');
    });

    // The OS theme switches the `dark` class on <html> (002 theme.ts).
    const observer = new MutationObserver(() => figures.forEach((f) => f.redraw(isCancelled)));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelled = true;
      observer.disconnect();
      figures.forEach((f) => f.dispose());
      setStatus('');
    };
  }, [container, key, client]);

  return status;
}
