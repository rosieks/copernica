import type { EditorView } from '@codemirror/view';
import { imageMarkdown } from './altText';
import { insertPlaceholder, removePlaceholder, replacePlaceholder } from './placeholders';

/**
 * Where the image flow (003) puts its placeholder and the final image. The Markdown editor and
 * the visual editor (007) each provide one, so uploading works the same in both modes.
 */
export interface ImageTarget {
  /** Where images go when none was given (paste position, cursor). */
  cursor(): number;
  /** Shows "Uploading {name}…" at `pos`; returns where the next image of the same batch goes. */
  insertPlaceholder(pos: number, key: string, name: string): number;
  /** Replaces the placeholder with the image; false when the placeholder is gone. */
  replacePlaceholder(key: string, alt: string, link: string): boolean;
  removePlaceholder(key: string): void;
}

export function codeMirrorTarget(view: EditorView): ImageTarget {
  return {
    cursor: () => view.state.selection.main.head,
    insertPlaceholder(pos, key, name) {
      insertPlaceholder(view, Math.min(pos, view.state.doc.length), key, name);
      return view.state.selection.main.head;
    },
    replacePlaceholder(key, alt, link) {
      const end = replacePlaceholder(view, key, imageMarkdown(alt, link));
      if (end === undefined) return false;
      // The cursor goes right after the inserted reference; the dialog returns focus to the editor.
      view.dispatch({ selection: { anchor: Math.min(end, view.state.doc.length) } });
      return true;
    },
    removePlaceholder: (key) => removePlaceholder(view, key),
  };
}
