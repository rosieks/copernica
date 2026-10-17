import { Link } from 'react-router';
import type { Schemas } from '../api/client';
import { absoluteTime } from '../format';
import { spaceRoute } from '../routes';
import { Button, Callout } from '../ui';
import { usePageInfo } from './PageInfo';

interface Props {
  space: Schemas['Space'];
  path?: string;
  page?: Schemas['Page'];
}

/**
 * Persistent context of the current view (FR-004, FR-005; data-model → State indicator).
 * All that apply are shown, in a fixed order (US1-7).
 */
export function StateIndicators({ space, path, page }: Props) {
  const older = page && page.isCurrent === false;
  const info = usePageInfo(space.id, path ?? '', older ? page.version.commitId : undefined);
  const outOfSync = space.state === 'outOfSync' || space.state === 'unavailable';

  return (
    <>
      {outOfSync && (
        <Callout tone="warning" title="Content may be outdated.">
          {space.lastSyncAt
            ? `This space could not be synchronized since ${absoluteTime(space.lastSyncAt)}.`
            : 'This space could not be synchronized with its repository.'}
          {space.message && <p>{space.message}</p>}
        </Callout>
      )}
      {older && path && (
        <Callout
          tone="warning"
          title={
            info.data?.authoredAt
              ? `You are viewing an older version from ${absoluteTime(info.data.authoredAt)} by ${info.data.authorName}.`
              : 'You are viewing an older version.'
          }
          actions={
            <Button asChild size="sm">
              <Link to={spaceRoute(space.id, path)}>Go to current version</Link>
            </Button>
          }
        />
      )}
      {!space.canWrite && (
        <Callout tone="info" title="Read only">
          You can view this space but not change it. Access follows your repository permissions.
        </Callout>
      )}
    </>
  );
}
