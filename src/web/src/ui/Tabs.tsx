import type { ReactNode } from 'react';
import { Tabs as Primitive } from 'radix-ui';
import './Tabs.css';

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  tabs: { value: string; label: ReactNode }[];
  activationMode?: 'automatic' | 'manual';
  children: ReactNode;
}

function Root({ value, onValueChange, label, tabs, activationMode = 'automatic', children }: TabsProps) {
  return (
    <Primitive.Root className="ui-tabs" value={value} onValueChange={onValueChange} activationMode={activationMode}>
      <Primitive.List className="ui-tabs__list" aria-label={label}>
        {tabs.map((tab) => (
          <Primitive.Trigger key={tab.value} value={tab.value} className="ui-tabs__trigger">
            {tab.label}
          </Primitive.Trigger>
        ))}
      </Primitive.List>
      {children}
    </Primitive.Root>
  );
}

function Panel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <Primitive.Content value={value} className={['ui-tabs__panel', className].filter(Boolean).join(' ')}>
      {children}
    </Primitive.Content>
  );
}

export const Tabs = { Root, Panel };
