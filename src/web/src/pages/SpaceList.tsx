import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type Schemas } from '../api/client';
import { SpaceStateBadge } from '../components/SpaceStateBadge';

export function useSpaces() {
  return useQuery({ queryKey: ['spaces'], queryFn: () => api<Schemas['Space'][]>('/api/spaces') });
}

export function SpaceList() {
  const spaces = useSpaces();

  if (spaces.isPending) return <p className="status">Loading spaces…</p>;
  if (spaces.isError) return <p className="status error">Could not load spaces: {spaces.error.message}</p>;

  return (
    <main className="space-list">
      <h1>Spaces</h1>
      {spaces.data.length === 0 ? (
        <p>No spaces are available to you. Ask for access to a repository configured in this wiki.</p>
      ) : (
        <ul className="cards">
          {spaces.data.map((space) => (
            <li key={space.id} className="card">
              {space.state === 'unavailable' ? (
                <span className="card-title">{space.displayName}</span>
              ) : (
                <Link className="card-title" to={`/s/${space.id}/`}>
                  {space.displayName}
                </Link>
              )}
              <SpaceStateBadge space={space} />
              {space.message && <p className="card-message">{space.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
