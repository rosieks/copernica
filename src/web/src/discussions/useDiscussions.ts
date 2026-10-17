import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Schemas } from '../api/client';

export type Discussion = Schemas['Discussion'];
export type DiscussionFilter = 'open' | 'resolved' | 'all';

/** Discussions of one page version; the `open` list also drives highlights and the toggle count. */
export function useDiscussions(spaceId: string, path: string, commitId: string, filter: DiscussionFilter, enabled = true) {
  return useQuery({
    queryKey: ['discussions', spaceId, path, commitId, filter],
    enabled,
    queryFn: () =>
      api<Discussion[]>(
        `/api/spaces/${encodeURIComponent(spaceId)}/discussions?path=${encodeURIComponent(path)}&state=${filter}`,
      ),
  });
}

export function useRefreshDiscussions(spaceId: string, path: string) {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['discussions', spaceId, path] }), [queryClient, spaceId, path]);
}

export interface HighlightTarget {
  id: string;
  start: number;
  end: number;
  /** Quote, for the accessible name of the keyboard marker. */
  exact: string;
}

export function highlightTargets(discussions: Discussion[] | undefined): HighlightTarget[] {
  return (discussions ?? [])
    .filter((d) => d.state === 'open' && d.anchorStatus === 'anchored' && d.anchor?.start !== undefined && d.anchor?.end !== undefined)
    .map((d) => ({ id: d.id!, start: d.anchor!.start!, end: d.anchor!.end!, exact: d.anchor!.exact ?? '' }))
    .sort((a, b) => a.start - b.start);
}
