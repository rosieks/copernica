import type { MouseEvent } from 'react';

/**
 * First focusable element of every screen (FR-013). It moves focus itself instead of
 * changing the address to `#main`, which the router would treat as a section link (009).
 */
export function SkipLink() {
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById('main');
    if (!main) return;
    event.preventDefault();
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.scrollIntoView({ block: 'start' });
    main.focus({ preventScroll: true });
  }

  return (
    <a className="skip-link" href="#main" onClick={skip}>
      Skip to content
    </a>
  );
}
