import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

interface Placeholder {
  id: string;
  from: number;
  to: number;
  text: string;
}

const add = StateEffect.define<Placeholder>();
const drop = StateEffect.define<string>();

/**
 * Where each uploading image's placeholder text is. Ranges are mapped through later edits,
 * so the user can keep typing while uploads run (FR-004).
 */
export const placeholderField = StateField.define<readonly Placeholder[]>({
  create: () => [],
  update(value, tr) {
    // A placeholder stays only while its exact text is still there (the user may delete or retype it).
    let next = tr.docChanged
      ? value
          .map((p) => ({ ...p, from: tr.changes.mapPos(p.from, 1), to: tr.changes.mapPos(p.to, -1) }))
          .filter((p) => p.to > p.from && tr.state.doc.sliceString(p.from, p.to) === p.text)
      : value;
    for (const effect of tr.effects) {
      if (effect.is(add)) next = [...next, effect.value];
      if (effect.is(drop)) next = next.filter((p) => p.id !== effect.value);
    }
    return next;
  },
});

export function placeholderText(name: string): string {
  return `![Uploading ${name.replace(/[[\]]/g, '')}…]()`;
}

/** Inserts a placeholder at `pos`; adds line breaks so the image stands on its own line. */
export function insertPlaceholder(view: EditorView, pos: number, id: string, name: string): void {
  const doc = view.state.doc;
  const before = pos > 0 && doc.sliceString(pos - 1, pos) !== '\n' ? '\n' : '';
  const after = pos < doc.length && doc.sliceString(pos, pos + 1) !== '\n' ? '\n' : '';
  const text = placeholderText(name);
  const from = pos + before.length;
  view.dispatch({
    changes: { from: pos, insert: before + text + after },
    effects: add.of({ id, from, to: from + text.length, text }),
    selection: { anchor: from + text.length + after.length },
  });
}

export function findPlaceholder(state: EditorState, id: string): Placeholder | undefined {
  return state.field(placeholderField, false)?.find((p) => p.id === id);
}

/** Replaces the placeholder with `text`; returns the position right after it, or undefined if it was deleted. */
export function replacePlaceholder(view: EditorView, id: string, text: string): number | undefined {
  const placeholder = findPlaceholder(view.state, id);
  if (!placeholder) return undefined;
  view.dispatch({ changes: { from: placeholder.from, to: placeholder.to, insert: text }, effects: drop.of(id) });
  return placeholder.from + text.length;
}

export function removePlaceholder(view: EditorView, id: string): void {
  const placeholder = findPlaceholder(view.state, id);
  if (!placeholder) return;
  const doc = view.state.doc;
  // Also remove the line break added for it when the line becomes empty.
  const to = doc.sliceString(placeholder.to, placeholder.to + 1) === '\n' ? placeholder.to + 1 : placeholder.to;
  view.dispatch({ changes: { from: placeholder.from, to }, effects: drop.of(id) });
}
