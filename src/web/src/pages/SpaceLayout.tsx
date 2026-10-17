import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { api, type Schemas } from '../api/client';
import { PageTree } from '../components/PageTree';
import { SpaceStateBadge } from '../components/SpaceStateBadge';
import { NewPageDialog } from '../components/PageDialogs';
import { useSpaces } from './SpaceList';
import { PageView } from './PageView';
import { PageEdit } from './PageEdit';
import { History } from './History';
import { DiscussionPanel } from '../discussions/DiscussionPanel';
import { spaceRoute } from '../routes';

const HOME_CANDIDATES = ['index.md', 'README.md', 'readme.md', 'Home.md', 'home.md'];

type View =
  | { kind: 'page'; path: string }
  | { kind: 'version'; path: string; version: string }
  | { kind: 'edit'; path: string }
  | { kind: 'new'; path: string }
  | { kind: 'history'; path: string }
  | { kind: 'home' };

/** Decodes `/s/:spaceId/<rest>`; reserved prefixes start with `-/` (pages always end in .md). */
export function parseView(rest: string): View {
  const segments = rest.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  if (segments[0] === '-') {
    const [, action, ...tail] = segments;
    switch (action) {
      case 'edit':
        return { kind: 'edit', path: tail.join('/') };
      case 'new':
        return { kind: 'new', path: tail.join('/') };
      case 'history':
        return { kind: 'history', path: tail.join('/') };
      case 'version': {
        const [version = '', ...path] = tail;
        return { kind: 'version', version, path: path.join('/') };
      }
    }
  }
  return segments.length ? { kind: 'page', path: segments.join('/') } : { kind: 'home' };
}

function firstPage(node: Schemas['TreeNode']): string | undefined {
  for (const child of node.children ?? []) {
    if (child.kind === 'page') return child.path;
  }
  for (const child of node.children ?? []) {
    const found = child.kind === 'folder' ? firstPage(child) : undefined;
    if (found) return found;
  }
  return undefined;
}

export function useTree(spaceId: string) {
  return useQuery({
    queryKey: ['tree', spaceId],
    queryFn: () => api<Schemas['TreeNode']>(`/api/spaces/${encodeURIComponent(spaceId)}/tree`),
  });
}

/** `/s/:spaceId/...` — tree on the left, the selected view on the right. */
export function SpaceLayout() {
  const { spaceId = '' } = useParams();
  const location = useLocation();
  const spaces = useSpaces();
  const tree = useTree(spaceId);
  const [creating, setCreating] = useState(false);

  const prefix = `/s/${spaceId}/`;
  const view = parseView(location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '');
  const space = spaces.data?.find((s) => s.id === spaceId);
  const canWrite = space?.canWrite ?? false;

  if (spaces.isSuccess && !space) {
    return <p className="status">This space does not exist or you do not have access to it.</p>;
  }

  if (view.kind === 'home' && tree.isSuccess) {
    const children = tree.data.children ?? [];
    const home = HOME_CANDIDATES.find((c) => children.some((n) => n.kind === 'page' && n.path === c)) ?? firstPage(tree.data);
    if (home) return <Navigate to={spaceRoute(spaceId, home)} replace />;
  }

  const currentPath = view.kind === 'home' ? undefined : view.path;

  return (
    <div className="space-layout">
      <nav className="sidebar" aria-label="Space navigation">
        <h2 className="sidebar-title">
          <Link to={`/s/${spaceId}/`}>{space?.displayName ?? spaceId}</Link>
        </h2>
        {space && space.state !== 'ready' && <SpaceStateBadge space={space} />}
        {canWrite && (
          <p>
            <button type="button" onClick={() => setCreating(true)}>
              New page
            </button>
          </p>
        )}
        {tree.isPending && <p className="status">Loading pages…</p>}
        {tree.isError && <p className="status error">{tree.error.message}</p>}
        {tree.isSuccess && <PageTree spaceId={spaceId} root={tree.data} currentPath={currentPath} />}
      </nav>
      <div className="content">
        {space && space.state !== 'ready' && space.message && (
          <div role="status" className="banner warning">
            {space.message}
          </div>
        )}
        {view.kind === 'page' && (
          <PageView
            spaceId={spaceId}
            path={view.path}
            canWrite={canWrite}
            aside={(page, article) => (
              <DiscussionPanel key={page.version.commitId} spaceId={spaceId} path={view.path} page={page} article={article} />
            )}
          />
        )}
        {view.kind === 'version' && <PageView spaceId={spaceId} path={view.path} version={view.version} canWrite={false} />}
        {view.kind === 'edit' && (canWrite ? <PageEdit key={view.path} spaceId={spaceId} path={view.path} /> : <ReadOnly />)}
        {view.kind === 'new' && (canWrite ? <PageEdit key={`new:${view.path}`} spaceId={spaceId} path={view.path} isNew /> : <ReadOnly />)}
        {view.kind === 'history' && <History spaceId={spaceId} path={view.path} />}
        {view.kind === 'home' && tree.isSuccess && (
          <p className="status">This space has no pages yet.{canWrite && ' Use “New page” to create the first one.'}</p>
        )}
      </div>
      <NewPageDialog
        spaceId={spaceId}
        folder={currentPath?.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : undefined}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}

function ReadOnly() {
  return <p className="status">You do not have permission to change this space.</p>;
}
