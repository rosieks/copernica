import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type Schemas } from '../api/client';
import { SpaceStateBadge } from '../components/SpaceStateBadge';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { Callout, EmptyState, Tooltip } from '../ui';
import './SpaceList.css';

export function useSpaces() {
  return useQuery({ queryKey: ['spaces'], queryFn: () => api<Schemas['Space'][]>('/api/spaces') });
}

/** S2: the spaces the user can read. */
export function SpaceList() {
  const spaces = useSpaces();
  useDocumentTitle('Spaces');

  return (
    <main id="main" className="main page-section">
      <h1>Spaces</h1>
      {spaces.isPending && (
        <p className="status" role="status">
          Loading spaces…
        </p>
      )}
      {spaces.isError && (
        <Callout tone="danger" title="Could not load spaces.">
          {spaces.error.message}
        </Callout>
      )}
      {spaces.isSuccess && spaces.data.length === 0 && (
        <EmptyState
          title="No spaces are available to you."
          description="Access follows your permissions on the repositories configured in this wiki. Ask for access to a repository to see its space."
        />
      )}
      {spaces.isSuccess && spaces.data.length > 0 && (
        <ul className="space-cards">
          {spaces.data.map((space) => (
            <li key={space.id} className={`space-card${space.state === 'unavailable' ? ' space-card--disabled' : ''}`}>
              {space.state === 'unavailable' ? (
                <Tooltip content={space.message ?? 'This space is not available right now.'}>
                  <span className="space-card__title" tabIndex={0}>
                    {space.displayName}
                  </span>
                </Tooltip>
              ) : (
                <Link className="space-card__title space-card__link" to={`/s/${encodeURIComponent(space.id)}/`}>
                  {space.displayName}
                </Link>
              )}
              <span className="mono muted">{space.id}</span>
              {space.state !== 'ready' && <SpaceStateBadge space={space} />}
              {space.message && <p className="space-card__message">{space.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
