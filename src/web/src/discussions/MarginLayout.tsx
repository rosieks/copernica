import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { rangesForOffsets } from './textAnchor';

export interface MarginItem {
  id: string;
  start: number;
  end: number;
  node: ReactNode;
}

const GAP = 12;

/**
 * Places each thread at the height of the fragment it discusses (wide screens), like comments
 * in the margin of a document. Threads that would overlap are pushed down; the active thread
 * is aligned with its fragment and the threads above it move up to make room. The column
 * scrolls with the page, so there is a single scrollbar.
 */
export function MarginLayout({ article, items, activeId }: { article: RefObject<HTMLElement | null>; items: MarginItem[]; activeId?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLDivElement>());
  const [tops, setTops] = useState<Record<string, number>>({});
  const [height, setHeight] = useState(0);

  const layout = useCallback(() => {
    const root = article.current;
    const box = container.current;
    if (!root || !box) return;
    const origin = box.getBoundingClientRect().top;
    const placed = items
      .map((item) => {
        const rect = rangesForOffsets(root, item.start, item.end)
          .flatMap((range) => [...range.getClientRects()])
          .find((r) => r.height > 0);
        return { id: item.id, anchor: rect ? Math.max(0, rect.top - origin) : 0, height: slots.current.get(item.id)?.offsetHeight ?? 0 };
      })
      .sort((a, b) => a.anchor - b.anchor);

    // Pass 1: everyone at its anchor, pushed down past the previous thread.
    const next: number[] = [];
    placed.forEach((p, i) => {
      next[i] = i === 0 ? p.anchor : Math.max(p.anchor, next[i - 1]! + placed[i - 1]!.height + GAP);
    });
    // Pass 2: the active thread sits exactly at its fragment; threads above move up.
    const active = placed.findIndex((p) => p.id === activeId);
    if (active >= 0 && next[active]! > placed[active]!.anchor) {
      next[active] = placed[active]!.anchor;
      for (let i = active - 1; i >= 0; i--) next[i] = Math.min(next[i]!, next[i + 1]! - placed[i]!.height - GAP);
      const shift = Math.max(0, -next[0]!);
      for (let i = 0; i < next.length; i++) next[i] = next[i]! + shift;
      for (let i = active + 1; i < next.length; i++) next[i] = Math.max(placed[i]!.anchor, next[i - 1]! + placed[i - 1]!.height + GAP);
    }

    const result: Record<string, number> = {};
    placed.forEach((p, i) => (result[p.id] = Math.round(next[i]!)));
    const bottom = placed.reduce((max, p, i) => Math.max(max, next[i]! + p.height), 0);
    setTops((prev) => (sameTops(prev, result) ? prev : result));
    setHeight(Math.round(bottom));
  }, [article, items, activeId]);

  useLayoutEffect(() => {
    layout();
    if (typeof ResizeObserver === 'undefined') return;
    // Re-layout when the page reflows or a thread grows (replies, editing).
    const observer = new ResizeObserver(() => layout());
    if (article.current) observer.observe(article.current);
    slots.current.forEach((slot) => observer.observe(slot));
    window.addEventListener('resize', layout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', layout);
    };
  }, [layout, article]);

  return (
    <div ref={container} className="discussions__margin" style={{ minHeight: height }}>
      {items.map((item) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) slots.current.set(item.id, el);
            else slots.current.delete(item.id);
          }}
          className="discussions__slot"
          // Positions are measured from the page; style attributes are allowed by the CSP.
          style={{ top: tops[item.id] ?? 0, visibility: item.id in tops ? 'visible' : 'hidden' }}
        >
          {item.node}
        </div>
      ))}
    </div>
  );
}

function sameTops(a: Record<string, number>, b: Record<string, number>) {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}
