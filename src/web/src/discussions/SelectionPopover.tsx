import { useEffect, useState, type RefObject } from 'react';
import { ChatBubbleIcon } from '@radix-ui/react-icons';
import { Button, Popover, type VirtualAnchor } from '../ui';
import { anchorFromSelection, type TextAnchorInput } from './textAnchor';

export interface CurrentSelection {
  anchor: TextAnchorInput;
  rect: VirtualAnchor;
}

/** Tracks a selection that lies entirely inside the article (FR-020); otherwise undefined. */
export function useArticleSelection(article: RefObject<HTMLElement | null>): CurrentSelection | undefined {
  const [current, setCurrent] = useState<CurrentSelection>();

  useEffect(() => {
    function update() {
      const root = article.current;
      const selection = window.getSelection();
      const anchor = root ? anchorFromSelection(root, selection) : undefined;
      if (!anchor || !selection || selection.rangeCount === 0) {
        setCurrent(undefined);
        return;
      }
      const range = selection.getRangeAt(0).cloneRange();
      setCurrent({ anchor, rect: { getBoundingClientRect: () => range.getBoundingClientRect() } });
    }
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [article]);

  return current;
}

const coarse = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/**
 * A "Comment" action next to the reader's selection (US4, FR-019). It never takes focus,
 * closes on Escape or when the selection scrolls out of view.
 */
export function SelectionPopover({ selection, onComment }: { selection: CurrentSelection | undefined; onComment: (anchor: TextAnchorInput) => void }) {
  const [dismissed, setDismissed] = useState<TextAnchorInput>();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (!selection) return;
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : undefined;
    const node = range?.startContainer;
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    observer.observe(element);
    return () => observer.disconnect();
  }, [selection]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && selection) setDismissed(selection.anchor);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selection]);

  const open = !!selection && visible && dismissed !== selection.anchor;
  if (!selection) return null;

  return (
    <Popover open={open} anchor={selection.rect} side={coarse() ? 'bottom' : 'top'} label="Selection actions">
      <Button
        size="sm"
        variant="primary"
        icon={<ChatBubbleIcon />}
        // Keep the reader's selection while clicking.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onComment(selection.anchor)}
      >
        Comment
      </Button>
    </Popover>
  );
}
