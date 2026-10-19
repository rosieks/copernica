import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, encodePath, type Schemas } from '../api/client';
import { DiffView } from '../components/DiffView';
import { absoluteTime, relativeTime, shortCommit } from '../format';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { spaceRoute } from '../routes';
import { Button, Callout, Tooltip } from '../ui';
import { StateIndicators } from './StateIndicators';
import './History.css';

type Version = Schemas['PageVersion'];

interface HistoryPage {
  items: Version[];
  nextCursor: string | null;
}

/** S5. Page history with From/To selection and a difference view (001 FR-014). */
/** `version` starts the history at an older commit, e.g. for a page that was deleted since (005). */
export function History({ space, path, version }: { space: Schemas['Space']; path: string; version?: string }) {
  const spaceId = space.id;
  const base = `/api/spaces/${encodeURIComponent(spaceId)}`;
  useDocumentTitle(`History of ${path}`, space.displayName);
  const history = useInfiniteQuery({
    queryKey: ['history', spaceId, path, version],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      if (pageParam) query.set('cursor', pageParam);
      if (version) query.set('version', version);
      const search = query.toString();
      return api<HistoryPage>(`${base}/history/${encodePath(path)}${search ? `?${search}` : ''}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const versions = history.data?.pages.flatMap((p) => p.items) ?? [];
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const [compared, setCompared] = useState<[string, string]>();

  // Defaults: compare the previous version with the latest one.
  const fromId = from ?? versions[1]?.commitId;
  const toId = to ?? versions[0]?.commitId;

  const diff = useQuery({
    queryKey: ['diff', spaceId, path, compared?.[0], compared?.[1]],
    enabled: !!compared,
    queryFn: () =>
      api<{ fromSource: string; toSource: string }>(`${base}/diff/${encodePath(path)}?from=${compared![0]}&to=${compared![1]}`),
  });

  function compare() {
    if (!fromId || !toId || fromId === toId) return;
    // Older version first, whichever column the user used.
    const order = (id: string) => versions.findIndex((v) => v.commitId === id);
    setCompared(order(fromId) > order(toId) ? [fromId, toId] : [toId, fromId]);
  }

  return (
    <section className="stack">
      <StateIndicators space={space} />
      <div>
        <h1 className="history__title">History</h1>
        <p className="mono muted history__path">
          <Link to={spaceRoute(spaceId, path)}>{path}</Link>
        </p>
      </div>
      {history.isPending && (
        <p className="muted" role="status">
          Loading history…
        </p>
      )}
      {history.isError && <Callout tone="danger" title="The history could not be loaded.">{history.error.message}</Callout>}
      {history.isSuccess && (
        <>
          <div className="history__table-wrap">
            <table className="history__table">
              <caption className="visually-hidden">Versions of {path}, newest first. Choose two to compare.</caption>
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Version</th>
                  <th scope="col">Author</th>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v, i) => {
                  const when = absoluteTime(v.authoredAt!);
                  return (
                    <tr key={v.commitId}>
                      <td>
                        <input
                          type="radio"
                          name="from"
                          aria-label={`Compare from the version of ${when} by ${v.authorName}`}
                          checked={fromId === v.commitId}
                          onChange={() => setFrom(v.commitId)}
                        />
                      </td>
                      <td>
                        <input
                          type="radio"
                          name="to"
                          aria-label={`Compare to the version of ${when} by ${v.authorName}`}
                          checked={toId === v.commitId}
                          onChange={() => setTo(v.commitId)}
                        />
                      </td>
                      <td className="mono">
                        {i === 0 ? (
                          <Link to={spaceRoute(spaceId, path)}>Current</Link>
                        ) : (
                          <Link
                            to={`/s/${spaceId}/-/version/${v.commitId}/${encodePath(path)}`}
                            aria-label={`${shortCommit(v.commitId!)}, version of ${when} by ${v.authorName}`}
                          >
                            {shortCommit(v.commitId!)}
                          </Link>
                        )}
                      </td>
                      <td>{v.authorName}</td>
                      <td>
                        <Tooltip content={when}>
                          <time dateTime={v.authoredAt} tabIndex={0}>
                            {relativeTime(v.authoredAt!)}
                          </time>
                        </Tooltip>
                      </td>
                      <td className="history__message">{v.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row">
            <Button variant="primary" onClick={compare} disabled={!fromId || !toId || fromId === toId}>
              Compare selected
            </Button>
            {history.hasNextPage && (
              <Button onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
                Load more
              </Button>
            )}
          </div>
        </>
      )}
      {compared && diff.data && (
        <section aria-labelledby="differences-title" className="stack">
          <h2 id="differences-title">Differences</h2>
          <DiffView from={diff.data.fromSource} to={diff.data.toSource} label="Differences between the selected versions" />
        </section>
      )}
    </section>
  );
}
