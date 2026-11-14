import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { Link2Icon } from '@radix-ui/react-icons';
import { ANCHOR_SKIP_ATTRIBUTE } from '../discussions/textAnchor';
import { canonicalUrl, copyText } from '../pages/PageActions';
import { CopyLinkDialog } from '../pages/CopyLinkDialog';
import { IconButton, useToast } from '../ui';
import { sectionHash, sectionId } from './resolveSection';
import './sections.css';

/** Headings that get a copy-link control (009 FR-001). */
const LINKABLE = 'h1, h2, h3';

interface Decorated {
  container: HTMLElement;
  id: string;
  text: string;
}

/**
 * Adds a "copy link to this section" button to every H1–H3 of the server-rendered article
 * (009 contracts/ui.md). The button lives in a `data-anchor-skip` span at the end of the
 * heading and has no text node, so the heading's text and discussion anchors are unchanged;
 * the heading keeps its own text as its accessible name.
 */
export function SectionLinks({
  article,
  html,
  spaceId,
  path,
  commitId,
  isCurrent,
}: {
  article: RefObject<HTMLElement | null>;
  html: string | undefined;
  spaceId: string;
  path: string;
  commitId: string;
  isCurrent: boolean;
}) {
  const [decorated, setDecorated] = useState<Decorated[]>([]);
  const [fallbackUrl, setFallbackUrl] = useState<string>();
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  useEffect(() => {
    const root = article.current;
    if (!root || !html) {
      setDecorated([]);
      return;
    }
    const added: { heading: HTMLElement; container: HTMLElement; labelled: boolean }[] = [];
    for (const heading of root.querySelectorAll<HTMLElement>(LINKABLE)) {
      const id = sectionId(heading);
      if (!id || heading.closest(`[${ANCHOR_SKIP_ATTRIBUTE}]`)) continue;
      const text = (heading.textContent ?? '').trim();
      const labelled = !heading.hasAttribute('aria-label');
      if (labelled) heading.setAttribute('aria-label', text);
      const container = document.createElement('span');
      container.className = 'section-link';
      container.setAttribute(ANCHOR_SKIP_ATTRIBUTE, '');
      heading.append(container);
      added.push({ heading, container, labelled });
    }
    setDecorated(added.map(({ heading, container }) => ({ container, id: sectionId(heading)!, text: heading.getAttribute('aria-label') ?? '' })));
    return () => {
      for (const { heading, container, labelled } of added) {
        container.remove();
        if (labelled) heading.removeAttribute('aria-label');
      }
    };
  }, [article, html]);

  async function copy(section: Decorated, button: HTMLElement) {
    const hash = sectionHash(section.id);
    const url = canonicalUrl(spaceId, path, commitId, isCurrent) + hash;
    // The address bar shows the section too; the flag keeps the page from scrolling to it.
    navigate({ pathname: location.pathname, search: location.search, hash }, { replace: true, state: { sectionCopy: true } });
    if (await copyText(url)) {
      notify({ tone: 'success', title: 'Link copied' });
    } else {
      returnFocus.current = button;
      setFallbackUrl(url);
    }
  }

  return (
    <>
      {decorated.map((section) =>
        createPortal(
          <IconButton
            className="section-link__button"
            label={`Copy link to section: ${section.text}`}
            icon={<Link2Icon />}
            tooltip={false}
            onClick={(event) => void copy(section, event.currentTarget)}
          />,
          section.container,
          section.id,
        ),
      )}
      <CopyLinkDialog
        url={fallbackUrl ?? ''}
        label="Link to this section"
        open={!!fallbackUrl}
        onOpenChange={(open) => !open && setFallbackUrl(undefined)}
        returnFocusTo={returnFocus}
      />
    </>
  );
}
