import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';
import { useToast } from '../ui';
import { decodeFragment, resolveSection } from './resolveSection';

/** How long the target heading is highlighted. */
export const HIGHLIGHT_MS = 2000;
/** How long the target is kept in place while images and diagrams above it load (FR-010). */
export const FOLLOW_LAYOUT_MS = 3000;
const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/** Set on a navigation that only puts the section in the address bar (the copy control). */
export interface SectionLocationState {
  sectionCopy?: boolean;
}

/**
 * Brings the section named by the location's fragment into view (009 contracts/ui.md,
 * "Opening a section"): on first load, in-app navigation and Back/Forward. The heading lands
 * below the sticky header (its scroll-margin-top), gets focus and a short highlight, and stays
 * in place while content above it changes height. A missing section is reported once per
 * location. Only `article`, the page's own content, is searched.
 */
export function useSectionNavigation(article: RefObject<HTMLElement | null>, html: string | undefined) {
  const location = useLocation();
  const { notify } = useToast();
  const handled = useRef<string>(undefined);

  useEffect(() => {
    const root = article.current;
    const state = location.state as SectionLocationState | null;
    if (!root || !html || !location.hash || state?.sectionCopy) return;
    if (handled.current === location.key) return;
    handled.current = location.key;

    const target = resolveSection(root, location.hash);
    if (!target) {
      notify({
        tone: 'info',
        title: 'Section not found',
        description: `The page has no section “${decodeFragment(location.hash)}”; it may have been renamed.`,
      });
      return;
    }

    const align = () => target.scrollIntoView({ block: 'start' });
    align();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.classList.add('section-target');
    const unhighlight = window.setTimeout(() => target.classList.remove('section-target'), HIGHLIGHT_MS);

    // Images and diagrams above the heading may still change the layout: keep it in place until
    // the reader takes over or the page has settled.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(align);
    observer?.observe(root);
    const stop = () => {
      observer?.disconnect();
      for (const type of USER_INPUT) window.removeEventListener(type, stop);
    };
    for (const type of USER_INPUT) window.addEventListener(type, stop, { passive: true });
    const settle = window.setTimeout(stop, FOLLOW_LAYOUT_MS);

    return () => {
      // Run again for the same location if the effect is re-applied (new HTML, StrictMode).
      handled.current = undefined;
      stop();
      window.clearTimeout(settle);
      window.clearTimeout(unhighlight);
      target.classList.remove('section-target');
    };
  }, [article, html, location.key, location.hash, location.state, notify]);
}
