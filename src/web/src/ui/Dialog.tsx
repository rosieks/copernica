import type { ReactNode, RefObject } from 'react';
import { Dialog as Primitive } from 'radix-ui';
import { Cross2Icon } from '@radix-ui/react-icons';
import { IconButton } from './IconButton';
import { useInertApp } from './inertApp';
import { useReturnFocus } from './returnFocus';
import './Dialog.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required: every dialog has a visible title (accessible name). */
  title: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  children?: ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
  /** Where focus goes on close; defaults to the element focused when the dialog opened. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

export function Dialog({ open, onOpenChange, title, description, size = 'md', footer, children, onOpenAutoFocus, returnFocusTo }: DialogProps) {
  const restoreFocus = useReturnFocus(open, returnFocusTo);
  useInertApp(open);
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="ui-overlay" />
        <Primitive.Content
          className={`ui-dialog ui-dialog--${size}`}
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={restoreFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="ui-dialog__header">
            <Primitive.Title className="ui-dialog__title">{title}</Primitive.Title>
            <Primitive.Close asChild>
              <IconButton label="Close" icon={<Cross2Icon />} size="sm" tooltip={false} />
            </Primitive.Close>
          </div>
          {description && <Primitive.Description className="ui-dialog__description">{description}</Primitive.Description>}
          {children && <div className="ui-dialog__body">{children}</div>}
          {footer && <div className="ui-dialog__footer">{footer}</div>}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

/** Closes the enclosing Dialog when its child is activated. */
export const DialogClose = Primitive.Close;
