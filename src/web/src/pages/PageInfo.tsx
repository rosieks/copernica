import { useQuery } from '@tanstack/react-query';
import { api, encodePath, type Schemas } from '../api/client';
import { absoluteTime, relativeTime } from '../format';
import { Skeleton, Tooltip } from '../ui';

type Version = Schemas['PageVersion'];

/**
 * The change that produced the shown version (FR-021). Loaded separately and after the
 * page, so it never delays the content (FR-024); immutable per commit.
 */
export function usePageInfo(spaceId: string, path: string, commitId: string | undefined) {
  return useQuery({
    queryKey: ['pageInfo', spaceId, path, commitId],
    enabled: !!commitId,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const result = await api<{ items: Version[] }>(
        `/api/spaces/${encodeURIComponent(spaceId)}/history/${encodePath(path)}?version=${encodeURIComponent(commitId!)}&limit=1`,
      );
      return result.items[0] ?? null;
    },
  });
}

export function PageInfo({ spaceId, path, commitId }: { spaceId: string; path: string; commitId: string }) {
  const info = usePageInfo(spaceId, path, commitId);

  if (info.isPending) {
    return (
      <p className="page__info">
        <Skeleton width="medium" />
      </p>
    );
  }
  if (!info.data) return null;

  const { authorName, authoredAt, message } = info.data;
  return (
    <p className="page__info muted">
      Last changed by <span className="page__info-author">{authorName}</span>{' '}
      {authoredAt && (
        <Tooltip content={absoluteTime(authoredAt)}>
          <time dateTime={authoredAt} tabIndex={0}>
            {relativeTime(authoredAt)}
          </time>
        </Tooltip>
      )}
      {message && <> — {message}</>}
    </p>
  );
}
