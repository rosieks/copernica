import { useEffect, type RefObject } from 'react';
import { offsetAt, rangesForOffsets } from './textAnchor';

export interface HighlightTarget {
  id: string;
  start: number;
  end: number;
}

/** CSS Custom Highlight API registry (supported by all target browsers; absent in old ones and jsdom). */
function highlights(): HighlightRegistry | undefined {
  return typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined;
}

/**
 * Paints anchored fragments without touching the sanitized DOM (CSS Custom Highlight API)
 * and reports which discussion was clicked.
 */
export function useHighlights(
  article: RefObject<HTMLElement | null>,
  targets: HighlightTarget[],
  activeId: string | undefined,
  onActivate: (id: string) => void,
) {
  useEffect(() => {
    const root = article.current;
    const registry = highlights();
    if (!root || !registry || typeof Highlight === 'undefined') return;

    const inactive = targets.filter((t) => t.id !== activeId).flatMap((t) => rangesForOffsets(root, t.start, t.end));
    const active = targets.filter((t) => t.id === activeId).flatMap((t) => rangesForOffsets(root, t.start, t.end));
    registry.set('discussion', new Highlight(...inactive));
    registry.set('discussion-active', new Highlight(...active));
    return () => {
      registry.delete('discussion');
      registry.delete('discussion-active');
    };
  }, [article, targets, activeId]);

  useEffect(() => {
    const root = article.current;
    if (!root) return;

    function onClick(event: MouseEvent) {
      if (window.getSelection()?.isCollapsed === false) return;
      const point = caretAt(event.clientX, event.clientY);
      if (!point || !root!.contains(point.node)) return;
      const offset = offsetAt(root!, point.node, point.offset);
      if (offset === undefined) return;
      const hit = targets.find((t) => offset >= t.start && offset <= t.end);
      if (hit) onActivate(hit.id);
    }

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [article, targets, onActivate]);
}

function caretAt(x: number, y: number): { node: Node; offset: number } | undefined {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : undefined;
}
