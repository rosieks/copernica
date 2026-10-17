import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

const APP = 'Copernica';

/** Sets the document title, e.g. "Onboarding · Team Handbook · Copernica". */
export function useDocumentTitle(...parts: (string | undefined)[]) {
  const title = [...parts.filter(Boolean), APP].join(' · ');
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/**
 * After client-side navigation, moves focus to the new view's heading and announces its
 * title (FR-013). The first load keeps the browser's default focus.
 */
export function RouteAnnouncer() {
  const location = useLocation();
  const [message, setMessage] = useState('');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // A hash link (e.g. the skip link) is not a new view.
    let cancelled = false;
    let observer: MutationObserver | undefined;
    const main = document.getElementById('main');

    const settle = () => {
      const heading = main?.querySelector<HTMLElement>('h1');
      if (!heading || cancelled) return false;
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      // Keep focus that the view placed deliberately (e.g. inside a form).
      if (!main?.contains(document.activeElement) || document.activeElement === document.body) heading.focus({ preventScroll: true });
      setMessage(document.title);
      return true;
    };

    // Views render asynchronously (data loading); wait for the heading.
    const timer = window.setTimeout(() => {
      if (settle() || !main) return;
      observer = new MutationObserver(() => {
        if (settle()) observer?.disconnect();
      });
      observer.observe(main, { childList: true, subtree: true });
    }, 50);
    const giveUp = window.setTimeout(() => observer?.disconnect(), 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(giveUp);
      observer?.disconnect();
    };
  }, [location.pathname]);

  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
