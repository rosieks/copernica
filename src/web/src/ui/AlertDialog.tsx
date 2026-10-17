import { useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { AlertDialog as Primitive } from 'radix-ui';
import { Button } from './Button';
import { useInertApp } from './inertApp';
import { useReturnFocus } from './returnFocus';
import './Dialog.css';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** Return a promise to keep the dialog open while the action runs; reject to keep it open. */
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  children?: ReactNode;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * Confirmation for destructive or work-discarding actions (FR-003). Focus starts on the
 * safe choice.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  busy = false,
  children,
  returnFocusTo,
}: AlertDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const restoreFocus = useReturnFocus(open, returnFocusTo);
  useInertApp(open);

  async function confirm(event: MouseEvent) {
    event.preventDefault();
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller shows the error inside the dialog; keep it open.
    }
  }

  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="ui-overlay" />
        <Primitive.Content
          className="ui-dialog ui-dialog--md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancel.current?.focus();
          }}
          onCloseAutoFocus={restoreFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <Primitive.Title className="ui-dialog__title">{title}</Primitive.Title>
          {description && <Primitive.Description className="ui-dialog__description">{description}</Primitive.Description>}
          {children && <div className="ui-dialog__body">{children}</div>}
          <div className="ui-dialog__footer">
            <Primitive.Cancel asChild>
              <Button ref={cancel}>{cancelLabel}</Button>
            </Primitive.Cancel>
            <Primitive.Action asChild>
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
                {confirmLabel}
              </Button>
            </Primitive.Action>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
