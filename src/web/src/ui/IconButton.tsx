import { forwardRef, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { Kbd } from './Kbd';
import { Tooltip } from './Tooltip';

interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'aria-label'> {
  /** Accessible name and tooltip text. */
  label: string;
  icon: ReactNode;
  /** Shortcut hint shown in the tooltip. */
  shortcut?: string;
  /** Close/dismiss buttons in overlays skip the tooltip so Escape reaches the overlay. */
  tooltip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, shortcut, tooltip = true, variant = 'ghost', className, ...props },
  ref,
) {
  const button = (
    <Button
      ref={ref}
      variant={variant}
      aria-label={label}
      className={['ui-button--icon-only', className].filter(Boolean).join(' ')}
      {...props}
    >
      <span className="ui-button__icon" aria-hidden="true">
        {icon}
      </span>
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip
      content={
        <>
          {label}
          {shortcut && (
            <>
              {' '}
              <Kbd>{shortcut}</Kbd>
            </>
          )}
        </>
      }
    >
      {button}
    </Tooltip>
  );
});
