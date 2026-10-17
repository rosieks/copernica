// @vitest-environment jsdom
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SelectionPopover, useArticleSelection } from './SelectionPopover';
import type { TextAnchorInput } from './textAnchor';

// jsdom has no layout: give ranges a box so the popover can be positioned.
Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({}) }) as DOMRect;
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

function Harness({ onComment }: { onComment: (anchor: TextAnchorInput) => void }) {
  const article = useRef<HTMLElement>(null);
  const selection = useArticleSelection(article);
  return (
    <>
      <nav>
        <p>Navigation text</p>
      </nav>
      <article ref={article}>
        <p>The first sentence of the page. The second sentence.</p>
      </article>
      <button type="button">Elsewhere</button>
      <SelectionPopover selection={selection} onComment={onComment} />
    </>
  );
}

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
});

describe('SelectionPopover', () => {
  it('offers Comment for a selection inside the article without moving focus', () => {
    const onComment = vi.fn();
    render(<Harness onComment={onComment} />);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    const text = screen.getByText(/first sentence/).firstChild!;

    select(text, 4, text, 18);

    const button = screen.getByRole('button', { name: 'Comment' });
    expect(document.activeElement).toBe(elsewhere);
    fireEvent.click(button);
    expect(onComment).toHaveBeenCalledWith(expect.objectContaining({ exact: 'first sentence' }));
  });

  it('offers nothing for a selection that leaves the article', () => {
    render(<Harness onComment={() => {}} />);
    const nav = screen.getByText('Navigation text').firstChild!;
    const text = screen.getByText(/first sentence/).firstChild!;

    select(nav, 0, text, 10);

    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();
  });

  it('closes when the selection is cleared or Escape is pressed', () => {
    render(<Harness onComment={() => {}} />);
    const text = screen.getByText(/first sentence/).firstChild!;

    select(text, 4, text, 18);
    expect(screen.getByRole('button', { name: 'Comment' })).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();

    select(text, 4, text, 18);
    window.getSelection()!.removeAllRanges();
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();
  });
});
