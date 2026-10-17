import { useSyncExternalStore } from 'react';

/** Breakpoints of the shell (research R5). */
export const WIDE = '(min-width: 1200px)';
export const MEDIUM = '(min-width: 768px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => window.matchMedia?.(query).matches ?? true,
    () => true,
  );
}
