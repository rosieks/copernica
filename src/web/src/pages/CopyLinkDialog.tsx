import { useRef, type RefObject } from 'react';
import { Button, Dialog, DialogClose, Field } from '../ui';

/** Fallback when the clipboard is unavailable (FR-022, research R9). */
export function CopyLinkDialog({
  url,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  url: string;
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
      <Field ref={input} label="Link to this page" hint="Press Ctrl+C (⌘C) to copy." readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
    </Dialog>
  );
}
