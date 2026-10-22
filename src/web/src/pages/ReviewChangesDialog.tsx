import type { RefObject } from 'react';
import { DiffView } from '../components/DiffView';
import { Dialog } from '../ui';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page file as the edit started (empty for a new page). */
  from: string;
  /** The page file as it would be saved now. */
  to: string;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/** 007 FR-013: the change to the page file, before saving (contracts/ui.md §1). */
export function ReviewChangesDialog({ open, onOpenChange, from, to, returnFocusTo }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Review changes" size="lg" returnFocusTo={returnFocusTo}>
      {from === to ? <p className="muted">No changes</p> : <DiffView from={from} to={to} label="Changes to the page file" />}
    </Dialog>
  );
}
