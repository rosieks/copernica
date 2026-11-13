import { useRef, type RefObject } from 'react';
import { Button, Dialog, DialogClose, Field } from '../ui';

/** Fallback when the clipboard is unavailable (FR-022, research R9). */
export function CopyLinkDialog({
  url,
  label = 'Link to this page',
  open,
  onOpenChange,
  returnFocusTo,
}: {
  url: string;
  /** The field label, e.g. "Link to this section" (009). */
  label?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Copy link"
      returnFocusTo={returnFocusTo}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }}
      footer={
        <DialogClose asChild>
          <Button>Close</Button>
        </DialogClose>
      }
    >
      <Field ref={input} label={label} hint="Press Ctrl+C (⌘C) to copy." readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
    </Dialog>
  );
}
