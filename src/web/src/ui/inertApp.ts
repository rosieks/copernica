import { useEffect } from 'react';

let count = 0;

/**
 * While a modal overlay is open, the app behind it is `inert` as well as `aria-hidden`
 * (Radix sets the latter), so nothing behind the overlay is focusable or announced. Overlays
 * are portaled to <body>, outside #root, so they stay interactive. Nested modals are counted.
 */
export function useInertApp(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.getElementById('root');
    if (!root) return;
    count++;
    root.inert = true;
    return () => {
      count--;
      if (count === 0) root.inert = false;
    };
  }, [active]);
}
