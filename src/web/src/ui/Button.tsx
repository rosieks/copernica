import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Leading icon (rendered aria-hidden). */
  icon?: ReactNode;
  /** Render the single child (e.g. a router Link) with button styling. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, asChild = false, className, children, type, ...props },
  ref,
) {
  const classes = ['ui-button', `ui-button--${variant}`, `ui-button--${size}`, className].filter(Boolean).join(' ');
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} type={type ?? 'button'} className={classes} {...props}>
      {icon && (
        <span className="ui-button__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
});
