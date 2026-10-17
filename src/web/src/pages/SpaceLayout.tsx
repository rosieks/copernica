import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { PlusIcon } from '@radix-ui/react-icons';
import { api, type Schemas } from '../api/client';
import { PageTree } from '../components/PageTree';
import { SpaceStateBadge } from '../components/SpaceStateBadge';
import { NewPageDialog } from '../components/PageDialogs';
import { useShell } from '../layout/ShellContext';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { MEDIUM, useMediaQuery, WIDE } from '../layout/useMediaQuery';
import { spaceRoute } from '../routes';
import { Button, Callout, EmptyState, Sheet } from '../ui';
import { useSpaces } from './SpaceList';
import { PageView } from './PageView';
import { PageEdit } from './PageEdit';
import { History } from './History';
import { StateIndicators } from './StateIndicators';

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

/** `/s/:spaceId/...`: tree | view | discussions, collapsing into sheets on narrow screens (R5). */
export function SpaceLayout() {
  const { spaceId = '' } = useParams();
  const location = useLocation();
  const spaces = useSpaces();
  const tree = useTree(spaceId);
  const shell = useShell();
  const medium = useMediaQuery(MEDIUM);
  const wide = useMediaQuery(WIDE);
  const [creating, setCreating] = useState(false);
  const [asideNode, setAsideNode] = useState<HTMLElement | null>(null);
  const newPageButton = useRef<HTMLButtonElement>(null);

  const prefix = `/s/${spaceId}/`;
  const view = parseView(location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '');
  const space = spaces.data?.find((s) => s.id === spaceId);
  const canWrite = space?.canWrite ?? false;
  const currentPath = view.kind === 'home' ? undefined : view.path;
  const withAside = view.kind === 'page' && wide;

  const { setHasNav, setNavOpen } = shell;
  useEffect(() => {
    setHasNav(true);
    return () => setHasNav(false);
  }, [setHasNav]);
  // Navigating closes the navigation sheet.
  useEffect(() => setNavOpen(false), [location.pathname, setNavOpen]);
  useDocumentTitle(view.kind === 'home' ? space?.displayName : undefined);

  if (spaces.isSuccess && !space) {
    return (
      <main id="main" className="main page-section">
        <h1>Space not available</h1>
        <EmptyState title="This space does not exist or you do not have access to it." action={<Link to="/">Go to the space list</Link>} />
      </main>
    );
  }

  if (view.kind === 'home' && tree.isSuccess) {
    const children = tree.data.children ?? [];
    const home = HOME_CANDIDATES.find((c) => children.some((n) => n.kind === 'page' && n.path === c)) ?? firstPage(tree.data);
    if (home) return <Navigate to={spaceRoute(spaceId, home)} replace />;
  }

  const navigation = (
    <>
      <div className="space-nav__head">
        <h2 className="space-nav__title">
          <Link to={`/s/${spaceId}/`}>{space?.displayName ?? spaceId}</Link>
        </h2>
        {space && space.state !== 'ready' && <SpaceStateBadge space={space} />}
      </div>
      {canWrite && (
        <Button ref={newPageButton} size="sm" icon={<PlusIcon />} onClick={() => setCreating(true)} className="space-nav__new">
          New page
        </Button>
      )}
      {tree.isPending && (
        <p className="muted" role="status">
          Loading pages…
        </p>
      )}
      {tree.isError && <Callout tone="danger" title="The page tree could not be loaded." />}
      {tree.isSuccess && <PageTree spaceId={spaceId} root={tree.data} currentPath={currentPath} />}
    </>
  );

  return (
    <div className={`space-grid${withAside ? ' space-grid--with-aside' : ''}`}>
      {medium ? (
        <nav className="space-grid__nav" aria-label="Space navigation">
          {navigation}
        </nav>
      ) : (
        <Sheet open={shell.navOpen} onOpenChange={setNavOpen} title="Space navigation" side="left" returnFocusTo={shell.navTrigger}>
          <nav aria-label="Space navigation">{navigation}</nav>
        </Sheet>
      )}
      <main id="main" className="main">
        {!space && (
          <p className="status" role="status">
            Loading…
          </p>
        )}
        {space && view.kind === 'page' && <PageView space={space} path={view.path} asideNode={asideNode} />}
        {space && view.kind === 'version' && <PageView space={space} path={view.path} version={view.version} asideNode={null} />}
        {space && view.kind === 'edit' && (canWrite ? <PageEdit key={view.path} space={space} path={view.path} /> : <ReadOnly space={space} />)}
        {space && view.kind === 'new' && (canWrite ? <PageEdit key={`new:${view.path}`} space={space} path={view.path} isNew /> : <ReadOnly space={space} />)}
        {space && view.kind === 'history' && <History space={space} path={view.path} />}
        {space && view.kind === 'home' && tree.isSuccess && (
          <>
            <StateIndicators space={space} />
            <h1>{space.displayName}</h1>
            <EmptyState
              title="This space has no pages yet."
              description={canWrite ? 'Use “New page” to create the first one.' : undefined}
            />
          </>
        )}
      </main>
      {withAside && <aside className="space-grid__aside" aria-label="Discussions" ref={setAsideNode} />}
      <NewPageDialog
        spaceId={spaceId}
        folder={currentPath?.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : undefined}
        open={creating}
        onClose={() => setCreating(false)}
        returnFocusTo={newPageButton}
      />
    </div>
  );
}

function ReadOnly({ space }: { space: Schemas['Space'] }) {
  return (
    <>
      <StateIndicators space={space} />
      <h1>Read only</h1>
      <p>You do not have permission to change this space.</p>
    </>
  );
}
