import type { ReactNode } from 'react';
import { Toolbar as Primitive } from 'radix-ui';
import './Toolbar.css';

function Root({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Primitive.Root className="ui-toolbar" aria-label={label}>
      {children}
    </Primitive.Root>
  );
}

/** Wrap a ui Button (asChild) so it joins the toolbar's roving focus. */
const Button = Primitive.Button;
const Link = Primitive.Link;

function Separator() {
  return <Primitive.Separator className="ui-toolbar__separator" />;
}

export const Toolbar = { Root, Button, Link, Separator };
