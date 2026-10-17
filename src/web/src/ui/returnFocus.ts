import { useRef, type RefObject } from 'react';

/**
 * Radix returns focus only to its own Trigger; our overlays are often opened from other
 * controls (buttons, menu items, shortcuts). This remembers what had focus when the overlay
 * opened (or an explicit target) and restores it on close, so focus never falls to <body>
 * (FR-014).
 */
export function useReturnFocus(open: boolean, explicit?: RefObject<HTMLElement | null>) {
  const target = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  if (open && !wasOpen.current) {
    target.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }
  wasOpen.current = open;

  return (event: Event) => {
    const element = explicit?.current ?? target.current;
    if (element && element.isConnected) {
      event.preventDefault();
      element.focus();
    }
  };
}
