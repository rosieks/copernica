import type { Schemas } from '../api/client';
import { Badge, type BadgeTone } from '../ui';

const LABELS: Record<Schemas['Space']['state'], [string, BadgeTone]> = {
  initializing: ['Synchronizing…', 'info'],
  ready: ['Up to date', 'success'],
  outOfSync: ['Out of sync', 'warning'],
  unavailable: ['Unavailable', 'danger'],
};

export function SpaceStateBadge({ space }: { space: Schemas['Space'] }) {
  const [label, tone] = LABELS[space.state];
  return <Badge tone={tone}>{label}</Badge>;
}
