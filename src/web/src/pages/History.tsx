import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, encodePath, type Schemas } from '../api/client';
import { DiffView } from '../components/DiffView';
import { spaceRoute } from '../routes';

type Version = Schemas['PageVersion'];

interface HistoryPage {
  items: Version[];
  nextCursor: string | null;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Page history with version selection and diff (FR-014). */
export function History({ spaceId, path }: { spaceId: string; path: string }) {
  const base = `/api/spaces/${encodeURIComponent(spaceId)}`;
  const history = useInfiniteQuery({
    queryKey: ['history', spaceId, path],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<HistoryPage>(`${base}/history/${encodePath(path)}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const [selected, setSelected] = useState<string[]>([]);

  const versions = history.data?.pages.flatMap((p) => p.items) ?? [];
  const pair = selected.length === 2 ? orderPair(selected, versions) : undefined;

  const diff = useQuery({
    queryKey: ['diff', spaceId, path, pair?.[0], pair?.[1]],
    enabled: !!pair,
    queryFn: () =>
      api<{ fromSource: string; toSource: string }>(
        `${base}/diff/${encodePath(path)}?from=${pair![0]}&to=${pair![1]}`,
      ),
  });

  function toggle(commitId: string) {
    setSelected((prev) =>
      prev.includes(commitId) ? prev.filter((c) => c !== commitId) : [...prev, commitId].slice(-2),
    );
  }

  if (history.isPending) return <p className="status">Loading history…</p>;
  if (history.isError) return <p className="status error">{history.error.message}</p>;

  return (
    <section>
      <h1>History of {path}</h1>
      <p className="muted">Select two versions to compare them.</p>
      <ul className="history-list">
        {versions.map((v, i) => (
          <li key={v.commitId}>
            <input
              type="checkbox"
              aria-label={`Compare version from ${dateFormat.format(new Date(v.authoredAt!))} by ${v.authorName}`}
              checked={selected.includes(v.commitId!)}
              onChange={() => toggle(v.commitId!)}
            />
            <span>
              <strong>{v.message}</strong>
              <br />
              <span className="muted">
                {v.authorName} · {dateFormat.format(new Date(v.authoredAt!))}
              </span>
            </span>
            {i === 0 ? (
              <Link to={spaceRoute(spaceId, path)}>Current</Link>
            ) : (
              <Link to={`/s/${spaceId}/-/version/${v.commitId}/${encodePath(path)}`}>View</Link>
            )}
          </li>
        ))}
      </ul>
      {history.hasNextPage && (
        <button type="button" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
          Show older versions
        </button>
      )}
      {pair && diff.data && (
        <section aria-label="Differences">
          <h2>Differences</h2>
          <DiffView from={diff.data.fromSource} to={diff.data.toSource} label="Differences between the selected versions" />
        </section>
      )}
    </section>
  );
}

function orderPair(selected: string[], versions: Version[]): [string, string] {
  const [a = '', b = ''] = selected;
  const ia = versions.findIndex((v) => v.commitId === a);
  const ib = versions.findIndex((v) => v.commitId === b);
  // Newest first in the list: the higher index is the older version.
  return ia > ib ? [a, b] : [b, a];
}
