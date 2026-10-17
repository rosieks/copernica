import { Separator as Primitive } from 'radix-ui';
import './Separator.css';

export function Separator({ orientation = 'horizontal' }: { orientation?: 'horizontal' | 'vertical' }) {
  return <Primitive.Root className={`ui-separator ui-separator--${orientation}`} orientation={orientation} />;
}
