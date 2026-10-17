import { ToggleGroup as Primitive } from 'radix-ui';
import './ToggleGroup.css';

interface ToggleGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  items: { value: T; label: string }[];
}

/** Single-choice segmented control; one item is always selected. */
export function ToggleGroup<T extends string>({ value, onValueChange, label, items }: ToggleGroupProps<T>) {
  return (
    <Primitive.Root
      type="single"
      className="ui-toggle-group"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
    >
      {items.map((item) => (
        <Primitive.Item key={item.value} value={item.value} className="ui-toggle-group__item">
          {item.label}
        </Primitive.Item>
      ))}
    </Primitive.Root>
  );
}
