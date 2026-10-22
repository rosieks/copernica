import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { pickImageFiles } from '../editor/imageInput';
import type { ImageTarget } from '../editor/imageTarget';
import { schema } from './markdown/schema';

/**
 * The image flow of 003 in the visual editor (FR-020): pasted, dropped and picked images get an
 * "Uploading…" placeholder node that is replaced by the image once it is described.
 */

/** The image's `alt` attribute holds the alt text as Markdown, so brackets are escaped. */
export function altMarkdown(alt: string): string {
  return alt.replace(/([[\]\\])/g, '\\$1');
}

function findUpload(view: EditorView, key: string): { pos: number; size: number } | null {
  let found: { pos: number; size: number } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type === schema.nodes.image_upload && node.attrs.key === key) found = { pos, size: node.nodeSize };
    return true;
  });
  return found;
}

export function visualTarget(view: EditorView): ImageTarget {
  return {
    cursor: () => view.state.selection.from,
    insertPlaceholder(pos, key, name) {
      const at = Math.max(0, Math.min(pos, view.state.doc.content.size));
      const tr = view.state.tr.replaceRangeWith(at, at, schema.nodes.image_upload.create({ key, name }));
      const after = tr.mapping.map(at, 1);
      tr.setSelection(TextSelection.near(tr.doc.resolve(after)));
      view.dispatch(tr.scrollIntoView());
      return view.state.selection.from;
    },
    replacePlaceholder(key, alt, link) {
      const upload = findUpload(view, key);
      if (!upload) return false;
      const image = schema.nodes.image.create({ src: link, alt: altMarkdown(alt) });
      const tr = view.state.tr.replaceWith(upload.pos, upload.pos + upload.size, image);
      tr.setSelection(TextSelection.near(tr.doc.resolve(upload.pos + image.nodeSize)));
      view.dispatch(tr);
      return true;
    },
    removePlaceholder(key) {
      const upload = findUpload(view, key);
      if (upload) view.dispatch(view.state.tr.delete(upload.pos, upload.pos + upload.size));
    },
  };
}

function hasFiles(data: DataTransfer | null): boolean {
  return !!data && [...data.types].includes('Files');
}

/** Paste and drop of image files; anything else is handled as usual. */
export function imageInputPlugin(onFiles: (files: File[], pos: number) => void): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const files = pickImageFiles(event.clipboardData);
        if (files.length === 0) return false;
        onFiles(files, view.state.selection.from);
        return true;
      },
      handleDrop(view, event) {
        if (!hasFiles(event.dataTransfer)) return false;
        const files = [...event.dataTransfer!.files];
        if (files.length === 0) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        onFiles(files, pos);
        return true;
      },
    },
  });
}
