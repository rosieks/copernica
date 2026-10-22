import type { Mark } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { schema } from './markdown/schema';

/** The link mark at the cursor and the range it covers, or null. */
export function linkAt(state: EditorState): { mark: Mark; from: number; to: number } | null {
  const { $from, from, to } = state.selection;
  const type = schema.marks.link;
  const mark = type.isInSet($from.marks()) ?? (from === to ? type.isInSet($from.nodeBefore?.marks ?? []) : null);
  if (!mark) return null;
  // Extend over the neighbouring text that carries the same link.
  const parent = $from.parent;
  const start = $from.start();
  let rangeFrom = -1;
  let rangeTo = -1;
  let pos = start;
  let open = -1;
  parent.forEach((child) => {
    const has = mark.isInSet(child.marks);
    if (has && open < 0) open = pos;
    if (!has && open >= 0) {
      if (open <= from && pos >= from) {
        rangeFrom = open;
        rangeTo = pos;
      }
      open = -1;
    }
    pos += child.nodeSize;
  });
  if (open >= 0 && open <= from && pos >= from) {
    rangeFrom = open;
    rangeTo = pos;
  }
  if (rangeFrom < 0) return null;
  return { mark, from: rangeFrom, to: Math.max(rangeTo, to) };
}

/** Sets the link on the existing link, the selection, or inserts `text` as a new link. */
export function setLinkCommand(href: string, text: string): Command {
  return (state, dispatch) => {
    const mark = schema.marks.link.create({ href, form: 'inline' });
    const existing = linkAt(state);
    const tr = state.tr;
    if (existing) {
      tr.removeMark(existing.from, existing.to, schema.marks.link).addMark(existing.from, existing.to, mark);
    } else if (!state.selection.empty) {
      tr.addMark(state.selection.from, state.selection.to, mark);
    } else {
      const { from } = state.selection;
      tr.insert(from, schema.text(text, [...state.selection.$from.marks().filter((m) => m.type !== schema.marks.link), mark]));
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** Removes the link at the cursor and keeps its text. */
export const removeLinkCommand: Command = (state, dispatch) => {
  const existing = linkAt(state);
  if (!existing) return false;
  dispatch?.(state.tr.removeMark(existing.from, existing.to, schema.marks.link));
  return true;
};
