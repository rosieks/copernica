import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { DropdownMenu as Primitive } from 'radix-ui';
import './Menu.css';

function Root({
  children,
  modal = false,
  open,
  onOpenChange,
}: {
  children: ReactNode;
  modal?: boolean;
  /** Controlled state, for menus also opened from the keyboard (e.g. Shift+F10 on a tree item). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Primitive.Root modal={modal} open={open} onOpenChange={onOpenChange}>
      {children}
    </Primitive.Root>
  );
}

const Trigger = Primitive.Trigger;

function Content({
  children,
  align = 'end',
  label,
  onCloseAutoFocus,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  label?: string;
  /** Where focus goes when the menu closes; call `event.preventDefault()` to move it yourself. */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Content className="ui-menu" align={align} sideOffset={4} collisionPadding={8} aria-label={label} onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

interface ItemProps extends ComponentPropsWithoutRef<typeof Primitive.Item> {
  tone?: 'danger';
  icon?: ReactNode;
}

const Item = forwardRef<HTMLDivElement, ItemProps>(function Item({ tone, icon, className, children, asChild, ...props }, ref) {
  const classes = ['ui-menu__item', tone ? `ui-menu__item--${tone}` : '', className].filter(Boolean).join(' ');
  if (asChild) {
    return (
      <Primitive.Item ref={ref} className={classes} asChild {...props}>
        {children}
      </Primitive.Item>
    );
  }
  return (
    <Primitive.Item ref={ref} className={classes} {...props}>
      {icon && (
        <span className="ui-menu__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </Primitive.Item>
  );
});

function Separator() {
  return <Primitive.Separator className="ui-menu__separator" />;
}

function Label({ children }: { children: ReactNode }) {
  return <Primitive.Label className="ui-menu__label">{children}</Primitive.Label>;
}

/** Dropdown menu; non-modal by default so the page does not lock scrolling. */
export const Menu = { Root, Trigger, Content, Item, Separator, Label };
