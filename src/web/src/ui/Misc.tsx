import type { ReactNode } from 'react';
import { VisuallyHidden as Primitive } from 'radix-ui';
import './Misc.css';

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

const AVATAR_HUES = ['slate', 'amber', 'green', 'red'] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

function hue(name: string): (typeof AVATAR_HUES)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length]!;
}

/** Initials only: no images, so nothing is fetched. The name is given as text next to it. */
export function Avatar({ name }: { name: string }) {
  return (
    <span className={`ui-avatar ui-avatar--${hue(name)}`} data-initials={initials(name)} aria-hidden="true" />
  );
}

export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <p className="ui-empty__title">{title}</p>
      {description && <p className="ui-empty__description">{description}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

/** Loading placeholder; the loading state itself is announced by text elsewhere. */
export function Skeleton({ width = '100%' }: { width?: 'short' | 'medium' | '100%' }) {
  return <span className={`ui-skeleton ui-skeleton--${width === '100%' ? 'full' : width}`} aria-hidden="true" />;
}

export function Spinner() {
  return <span className="ui-spinner" aria-hidden="true" />;
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <Primitive.Root>{children}</Primitive.Root>;
}
