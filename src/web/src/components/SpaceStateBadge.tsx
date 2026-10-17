import type { Schemas } from '../api/client';

const LABELS: Record<Schemas['Space']['state'], string> = {
  initializing: 'Synchronizing…',
  ready: 'Up to date',
  outOfSync: 'Out of sync',
  unavailable: 'Unavailable',
};

export function SpaceStateBadge({ space }: { space: Schemas['Space'] }) {
  return <span className={`badge badge-${space.state}`}>{LABELS[space.state]}</span>;
}
