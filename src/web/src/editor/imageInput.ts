import { EditorView } from '@codemirror/view';

const IMAGE = /^image\//;

/** Image files in a clipboard or drop; empty when there are none (text is then pasted as usual). */
export function pickImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files].filter((f) => IMAGE.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name));
  if (files.length > 0) return files;
  // Some browsers expose pasted image data only as items.
  return [...data.items]
    .filter((item) => item.kind === 'file' && IMAGE.test(item.type))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

/** True when a drop carries files, i.e. not text being dragged inside the editor. */
function hasFiles(data: DataTransfer | null): boolean {
  return !!data && [...data.types].includes('Files');
}

/**
 * Paste and drop handling for images (FR-001). Anything that is not an image falls through
 * to CodeMirror's default handling. Files dropped that are not images are passed on too, so
 * the editor can say why they were not added.
 */
export function imageInput(onFiles: (files: File[], pos: number) => void) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = pickImageFiles(event.clipboardData);
      if (files.length === 0) return false;
      event.preventDefault();
      onFiles(files, view.state.selection.main.head);
      return true;
    },
    dragover(event) {
      if (!hasFiles(event.dataTransfer)) return false;
      event.preventDefault();
      return true;
    },
    drop(event, view) {
      if (!hasFiles(event.dataTransfer)) return false;
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      onFiles(files, pos);
      return true;
    },
  });
}
