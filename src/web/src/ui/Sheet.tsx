import type { ReactNode, RefObject } from 'react';
import { Dialog as Primitive } from 'radix-ui';
import { Cross2Icon } from '@radix-ui/react-icons';
import { IconButton } from './IconButton';
import { useInertApp } from './inertApp';
import { useReturnFocus } from './returnFocus';
import './Dialog.css';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  side: 'left' | 'right';
  /** Non-modal sheets leave the page usable next to them (no overlay, no focus trap). */
  modal?: boolean;
  children: ReactNode;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/** A panel sliding in from the side, used for the page tree and discussions on narrow screens (R5). */
export function Sheet({ open, onOpenChange, title, side, modal = true, children, returnFocusTo }: SheetProps) {
  const restoreFocus = useReturnFocus(open, returnFocusTo);
  useInertApp(open && modal);
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Primitive.Portal>
        {modal && <Primitive.Overlay className="ui-overlay" />}
        <Primitive.Content
          className={`ui-sheet ui-sheet--${side}${modal ? '' : ' ui-sheet--non-modal'}`}
          aria-describedby={undefined}
          onCloseAutoFocus={restoreFocus}
          // A non-modal sheet must not close when the reader interacts with the page next to it.
          onInteractOutside={modal ? undefined : (event) => event.preventDefault()}
        >
          <div className="ui-sheet__header">
            <Primitive.Title className="ui-sheet__title">{title}</Primitive.Title>
            <Primitive.Close asChild>
              <IconButton label="Close" icon={<Cross2Icon />} size="sm" tooltip={false} />
            </Primitive.Close>
          </div>
          <div className="ui-sheet__body">{children}</div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
