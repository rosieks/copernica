import type { ReactElement, ReactNode } from 'react';
import { Tooltip as Primitive } from 'radix-ui';
import './Tooltip.css';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Primitive.Provider delayDuration={400}>{children}</Primitive.Provider>;
}

interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** A single focusable element. */
  children: ReactElement;
}

/** Supplementary text on hover and keyboard focus; never the only accessible name. */
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content className="ui-tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {content}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
