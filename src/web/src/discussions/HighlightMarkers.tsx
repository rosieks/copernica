import { useCallback, useEffect, useState, type RefObject } from 'react';
import { rangesForOffsets } from './textAnchor';
import type { HighlightTarget } from './useDiscussions';

interface Marker {
  id: string;
  label: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

function firstWords(text: string, count = 8): string {
  const words = text.trim().split(/\s+/);
  return words.slice(0, count).join(' ') + (words.length > count ? '…' : '');
}

/**
 * Keyboard access to highlighted fragments (FR-018). Highlights are painted with the CSS
 * Custom Highlight API, which has no focusable elements, so a transparent button is placed
 * over the first line of each fragment, in document order. It ignores the pointer (mouse
 * clicks on the text are handled by useHighlights) and shows a focus ring when focused.
 */
export function HighlightMarkers({
  article,
  targets,
  activeId,
  onActivate,
}: {
  article: RefObject<HTMLElement | null>;
  targets: HighlightTarget[];
  activeId?: string;
  onActivate: (id: string) => void;
}) {
  const [markers, setMarkers] = useState<Marker[]>([]);

  const measure = useCallback(() => {
    const root = article.current;
    const container = root?.parentElement;
    if (!root || !container) return;
    const origin = container.getBoundingClientRect();
    const next: Marker[] = [];
    for (const target of targets) {
      const rect = rangesForOffsets(root, target.start, target.end)
        .flatMap((range) => [...range.getClientRects()])
        .find((r) => r.width > 0 && r.height > 0);
      if (!rect) continue;
      next.push({
        id: target.id,
        label: `Discussion: ${firstWords(target.exact)}`,
        top: rect.top - origin.top,
        left: rect.left - origin.left,
        width: rect.width,
        height: rect.height,
      });
    }
    setMarkers(next);
  }, [article, targets]);

  useEffect(() => {
    measure();
    const root = article.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [article, measure]);

  if (markers.length === 0) return null;
  return (
    <div className="anchor-markers">
      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`anchor-marker${m.id === activeId ? ' anchor-marker--active' : ''}`}
          aria-label={m.label}
          // Positioned over the painted fragment; style attributes are allowed by the CSP.
          style={{ top: m.top, left: m.left, width: m.width, height: m.height }}
          onClick={() => onActivate(m.id)}
        />
      ))}
    </div>
  );
}
