import { useMemo, type ReactNode } from 'react';
import { Popover as Primitive } from 'radix-ui';
import './Popover.css';

/** Anything with a bounding box, e.g. a text selection (Range). */
export interface VirtualAnchor {
  getBoundingClientRect(): DOMRect;
}

interface PopoverProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  anchor: VirtualAnchor;
  side?: 'top' | 'bottom';
  /** Defaults to not moving focus into the popover. */
  onOpenAutoFocus?: (event: Event) => void;
  label: string;
  children: ReactNode;
}

/** A popover attached to an arbitrary rectangle (Popover.Anchor virtualRef, research R9). */
export function Popover({ open, onOpenChange, anchor, side = 'top', onOpenAutoFocus, label, children }: PopoverProps) {
  const virtualRef = useMemo(() => ({ current: anchor }), [anchor]);
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Primitive.Anchor virtualRef={virtualRef} />
      <Primitive.Portal>
        <Primitive.Content
          className="ui-popover"
          side={side}
          sideOffset={8}
          collisionPadding={8}
          aria-label={label}
          onOpenAutoFocus={onOpenAutoFocus ?? ((event) => event.preventDefault())}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
