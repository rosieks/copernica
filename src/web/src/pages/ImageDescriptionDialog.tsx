import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { suggestAlt } from '../editor/altText';
import { Button, Dialog, Field } from '../ui';
import './ImageDescriptionDialog.css';

export interface DescribeRequest {
  key: string;
  name: string;
  previewUrl: string;
}

interface Props {
  request: DescribeRequest | undefined;
  /** Position in a queue of several images, e.g. [2, 3] → "(2 of 3)". */
  position?: [number, number];
  /** Called with the description; "" marks a decorative image. */
  onDone: (alt: string) => void;
  /** Where focus goes after the dialog (the editor). */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/** "Describe the image" (003 FR-005, contracts/ui.md step 4). Skipping keeps the suggestion. */
export function ImageDescriptionDialog({ request, position, onDone, returnFocusTo }: Props) {
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // Reset only when a new image comes up, not on every render.
  const key = request?.key;
  const name = request?.name ?? '';
  useEffect(() => {
    if (!key) return;
    setAlt(suggestAlt(name));
    setDecorative(false);
  }, [key, name]);

  function submit(event: FormEvent) {
    event.preventDefault();
    // React bubbles events through portals: without this, the editor's form would save the page.
    event.stopPropagation();
    onDone(decorative ? '' : alt.trim() || suggestAlt(request?.name ?? ''));
  }

  const skip = () => onDone(suggestAlt(request?.name ?? ''));
  const title = position && position[1] > 1 ? `Describe the image (${position[0]} of ${position[1]})` : 'Describe the image';

  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) skip();
      }}
      title={title}
      returnFocusTo={returnFocusTo}
      description="A short description lets people who cannot see the image know what it shows."
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        field.current?.focus();
        field.current?.select();
      }}
    >
      {request && (
        <form className="stack" onSubmit={submit}>
          {/* The thumbnail is described by the dialog itself. */}
          <img className="image-description__thumb" src={request.previewUrl} alt="" />
          <Field ref={field} label="Description" value={alt} disabled={decorative} onChange={(e) => setAlt(e.target.value)} maxLength={300} />
          <label className="ui-check">
            <input type="checkbox" checked={decorative} onChange={(e) => setDecorative(e.target.checked)} />
            <span>Decorative image (no description)</span>
          </label>
          <div className="row row--end">
            <Button onClick={skip}>Skip</Button>
            <Button type="submit" variant="primary">
              Insert
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
