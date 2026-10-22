import { useState, type FormEvent } from 'react';
import { NodeSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Button, Dialog, Field } from '../ui';
import { altMarkdown } from './imageInput';

/** Alt text as Markdown → as read. */
function readable(alt: string): string {
  return alt.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** Actions for a selected image: change its description or remove it (US4-5). */
export function ImageBar({ view, state, container, onAnnounce }: { view: EditorView; state: EditorState; container: HTMLElement | null; onAnnounce: (text: string) => void }) {
  const [editing, setEditing] = useState<{ pos: number; alt: string } | null>(null);
  const selection = state.selection;
  const image = selection instanceof NodeSelection && selection.node.type.name === 'image' ? selection : null;

  const save = (event: FormEvent) => {
    // The dialog sits in a portal; its submit must not reach the page editor's form.
    event.preventDefault();
    event.stopPropagation();
    if (!editing) return;
    const node = view.state.doc.nodeAt(editing.pos);
    if (node?.type.name === 'image') {
      view.dispatch(view.state.tr.setNodeMarkup(editing.pos, undefined, { ...node.attrs, alt: altMarkdown(editing.alt.trim()) }));
      onAnnounce('Image description changed');
    }
    setEditing(null);
    view.focus();
  };

  let bar = null;
  if (image && container) {
    const coords = view.coordsAtPos(image.from);
    const box = container.getBoundingClientRect();
    const position = { left: `${Math.max(0, coords.left - box.left)}px`, top: `${coords.bottom - box.top + 4}px` };
    bar = (
      <div className="visual-linkbar" style={position} role="group" aria-label="Image">
        <button
          type="button"
          className="ui-button ui-button--ghost ui-button--sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing({ pos: image.from, alt: readable(image.node.attrs.alt as string) })}
        >
          Change description
        </button>
        <button
          type="button"
          className="ui-button ui-button--ghost ui-button--sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            view.dispatch(view.state.tr.deleteSelection());
            onAnnounce('Image removed');
            view.focus();
          }}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <>
      {bar}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            view.focus();
          }
        }}
        title="Describe the image"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="visual-image-description">
              Save
            </Button>
          </>
        }
      >
        <form id="visual-image-description" onSubmit={save}>
          <Field
            label="Description"
            hint="What the image shows, for people who cannot see it. Leave empty for a decorative image."
            autoFocus
            maxLength={300}
            value={editing?.alt ?? ''}
            onChange={(e) => setEditing((current) => (current ? { ...current, alt: e.target.value } : current))}
          />
        </form>
      </Dialog>
    </>
  );
}
