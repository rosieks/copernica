import type { MouseEvent } from 'react';
import type { Location, NavigateFunction } from 'react-router';

/** A plain left click, which the wiki may route itself; modified clicks keep the browser's behaviour. */
export function isPlainClick(event: MouseEvent): boolean {
  return !(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

/** The link a click inside rendered content landed on, with its raw `href`. */
export function clickedLink(event: MouseEvent): { anchor: HTMLAnchorElement; href: string } | null {
  const anchor = (event.target as Element).closest('a');
  const href = anchor?.getAttribute('href');
  return anchor && href ? { anchor, href } : null;
}

/**
 * Routes a click on a link in rendered user content (comments; the page article adds its own
 * broken-link handling): `#section` links become history entries of the current page, so the
 * section hook resolves them in the page article (009 FR-013); `/s/…` links are routed in the
 * app instead of reloading it. Returns true when the click was handled.
 */
export function routeContentLinkClick(event: MouseEvent, navigate: NavigateFunction, location: Location): boolean {
  if (!isPlainClick(event)) return false;
  const link = clickedLink(event);
  if (!link) return false;
  if (link.href.startsWith('#')) {
    event.preventDefault();
    navigate({ pathname: location.pathname, search: location.search, hash: link.href });
    return true;
  }
  if (link.href.startsWith('/s/')) {
    event.preventDefault();
    navigate(link.href);
    return true;
  }
  return false;
}
