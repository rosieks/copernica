import { useEffect, useId, useMemo, useState, type MutableRefObject } from 'react';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { CLOSE_SLASH, slashKey, slashState } from './slash';

export interface SlashItem {
  id: string;
  label: string;
  /** Extra words the filter matches, e.g. "h1" for Heading 1. */
  keywords?: string;
  run: (view: EditorView) => void;
}

/** Keyboard handling the editor delegates to the open menu. */
export interface SlashController {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  view: EditorView;
  state: EditorState;
  items: SlashItem[];
  controller: MutableRefObject<SlashController | null>;
  /** Editor wrapper the menu is positioned in. */
  container: HTMLElement | null;
}

export function filterItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => `${item.label} ${item.keywords ?? ''}`.toLowerCase().includes(q));
}

/**
 * The "/" menu (contracts/ui.md §4): a listbox the editor controls with
 * `aria-activedescendant`, so focus stays in the text while choosing.
 */
export function SlashMenu({ view, state, items, controller, container }: Props) {
  const slash = slashState(state);
  const listId = useId();
  const matches = useMemo(() => filterItems(items, slash.query), [items, slash.query]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [slash.query, slash.active]);

  const close = () => view.dispatch(view.state.tr.setMeta(slashKey, CLOSE_SLASH));

  const choose = (item: SlashItem | undefined) => {
    if (!item) return;
    const { from } = slashState(view.state);
    const to = view.state.selection.from;
    view.dispatch(view.state.tr.delete(from, to).setMeta(slashKey, CLOSE_SLASH));
    item.run(view);
    view.focus();
  };

  useEffect(() => {
    if (!slash.active) {
      controller.current = null;
      return;
    }
    controller.current = {
      onKeyDown(event) {
        if (event.key === 'ArrowDown') setIndex((i) => (matches.length ? (i + 1) % matches.length : 0));
        else if (event.key === 'ArrowUp') setIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));
        else if (event.key === 'Enter') {
          if (matches.length) choose(matches[Math.min(index, matches.length - 1)]);
          else close();
        } else if (event.key === 'Escape') close();
        else return false;
        event.preventDefault();
        return true;
      },
    };
  });

  // The editor carries the combobox relationship to the list (aria-activedescendant).
  const activeId = slash.active && matches.length ? `${listId}-${Math.min(index, matches.length - 1)}` : null;
  useEffect(() => {
    const dom = view.dom;
    if (slash.active) {
      dom.setAttribute('aria-controls', listId);
      dom.setAttribute('aria-expanded', 'true');
      dom.setAttribute('aria-autocomplete', 'list');
      if (activeId) dom.setAttribute('aria-activedescendant', activeId);
      else dom.removeAttribute('aria-activedescendant');
    } else {
      for (const name of ['aria-controls', 'aria-expanded', 'aria-autocomplete', 'aria-activedescendant']) dom.removeAttribute(name);
    }
  }, [view, slash.active, activeId, listId]);

  if (!slash.active || !container) return null;

  const coords = view.coordsAtPos(slash.from);
  const box = container.getBoundingClientRect();
  const position = { left: `${coords.left - box.left}px`, top: `${coords.bottom - box.top + 4}px` };

  return (
    <div className="visual-slash" style={position}>
      <ul id={listId} role="listbox" aria-label="Insert block" className="visual-slash__list">
        {matches.map((item, i) => (
          <li
            key={item.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === index}
            className="visual-slash__item"
            onMouseDown={(event) => {
              // Keep focus in the editor.
              event.preventDefault();
              choose(item);
            }}
            onMouseEnter={() => setIndex(i)}
          >
            {item.label}
          </li>
        ))}
      </ul>
      {matches.length === 0 && <p className="visual-slash__empty">No matching blocks</p>}
    </div>
  );
}
