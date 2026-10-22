import { useEffect, useRef, useState } from 'react';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { Button, Dialog } from '../ui';
import { diagramType, drawDiagram } from './nodeViews';

export const NEW_DIAGRAM = 'flowchart TD\n  A --> B';

interface Props {
  /** The source to edit; null when the dialog is closed. */
  source: string | null;
  onApply: (source: string) => void;
  onCancel: () => void;
}

/**
 * "Edit diagram" (contracts/ui.md §8): the Mermaid source with the drawing updated alongside
 * through the isolated renderer of 004. Nothing changes in the page until Apply.
 */
export function DiagramDialog({ source, onApply, onCancel }: Props) {
  const [text, setText] = useState(source ?? '');
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (source !== null) setText(source);
  }, [source]);

  useEffect(() => {
    if (source === null) return;
    let cancelled = false;
    setDrawing(true);
    const timer = setTimeout(() => {
      if (!img.current) return;
      void drawDiagram(text, img.current).then((message) => {
        if (cancelled) return;
        setError(message);
        setDrawing(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, source]);

  return (
    <Dialog
      open={source !== null}
      onOpenChange={(open) => !open && onCancel()}
      title="Edit diagram"
      size="lg"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onApply(text)}>
            Apply
          </Button>
        </>
      }
    >
      <div className="visual-diagram-dialog">
        <div className="visual-diagram-dialog__source">
          <MarkdownEditor label="Diagram source" value={text} onChange={setText} />
        </div>
        <figure className="visual-diagram-dialog__preview" aria-label={`Preview: diagram (${diagramType(text)})`}>
          <img ref={img} alt={`Diagram (${diagramType(text)})`} hidden={error !== null} />
          <p className="visual-diagram__status" role="status">
            {error ? `This diagram could not be drawn: ${error}` : drawing ? 'Drawing diagram…' : ''}
          </p>
        </figure>
      </div>
    </Dialog>
  );
}
