import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { DotsHorizontalIcon, PlusIcon } from '@radix-ui/react-icons';
import { apiWithHeaders, type Schemas } from '../api/client';
import { PageTree, type PageTreeHandle } from '../components/PageTree';
import { SpaceStateBadge } from '../components/SpaceStateBadge';
import { TreeItemMenu, writeDisabledReason } from '../components/TreeItemMenu';
import { isValidDrop } from '../components/treeDnd';
import { useTreeManagement } from '../components/TreeManagement';
import { useShell } from '../layout/ShellContext';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { MEDIUM, useMediaQuery, WIDE } from '../layout/useMediaQuery';
import { spaceRoute } from '../routes';
import { Button, Callout, EmptyState, IconButton, Sheet } from '../ui';
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

export interface SpaceTree {
  root: Schemas['TreeNode'];
  /** Commit the tree was built from: the base of tree operations (005 contracts/api.md). */
  commitId: string;
}

/** The page tree; refetched on focus and every minute so changes by others appear (005 R14). */
export function useTree(spaceId: string) {
  return useQuery({
    queryKey: ['tree', spaceId],
    queryFn: async (): Promise<SpaceTree> => {
      const { data, headers } = await apiWithHeaders<Schemas['TreeNode']>(`/api/spaces/${encodeURIComponent(spaceId)}/tree`);
      return { root: data, commitId: headers.get('X-Copernica-Commit') ?? '' };
    },
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
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
  const [asideNode, setAsideNode] = useState<HTMLElement | null>(null);
  const [rootMenu, setRootMenu] = useState(false);
  const newPageButton = useRef<HTMLButtonElement>(null);
  const rootMenuButton = useRef<HTMLButtonElement>(null);
  const treeHandle = useRef<PageTreeHandle>(null);
  const [dragging, setDragging] = useState<Schemas['TreeNode']>();
  const [rootDrop, setRootDrop] = useState(false);

  const prefix = `/s/${spaceId}/`;
  const view = parseView(location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '');
  const space = spaces.data?.find((s) => s.id === spaceId);
  const canWrite = space?.canWrite ?? false;
  const currentPath = view.kind === 'home' ? undefined : view.path;
  const withAside = view.kind === 'page' && wide;
  const disabledReason = space && canWrite ? writeDisabledReason(space) : undefined;
  const management = useTreeManagement({
    spaceId,
    root: tree.data?.root,
    base: tree.data?.commitId ?? '',
    currentPath,
    tree: treeHandle,
    returnFocusTo: newPageButton,
  });

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
    const children = tree.data.root.children ?? [];
    const home = HOME_CANDIDATES.find((c) => children.some((n) => n.kind === 'page' && n.path === c)) ?? firstPage(tree.data.root);
    if (home) return <Navigate to={spaceRoute(spaceId, home)} replace />;
  }

  const navigation = (
    <>
      <div
        className={`space-nav__head${rootDrop ? ' space-nav__head--drop' : ''}`}
        // The space root accepts drops too (contracts/ui.md §6).
        onDragOver={(event) => {
          if (dragging && isValidDrop(dragging, { path: '', kind: 'folder' }, 'into')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setRootDrop(true);
          }
        }}
        onDragLeave={() => setRootDrop(false)}
        onDrop={(event) => {
          event.preventDefault();
          setRootDrop(false);
          if (dragging && isValidDrop(dragging, { path: '', kind: 'folder' }, 'into')) management.openMove(dragging, '');
        }}
      >
        <h2 className="space-nav__title">
          <Link to={`/s/${spaceId}/`}>{space?.displayName ?? spaceId}</Link>
        </h2>
        {space && space.state !== 'ready' && <SpaceStateBadge space={space} />}
      </div>
      {canWrite && (
        <div className="space-nav__actions">
          <Button
            ref={newPageButton}
            size="sm"
            icon={<PlusIcon />}
            disabled={!!disabledReason}
            onClick={() => management.openNewPage(currentPath?.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '')}
            className="space-nav__new"
          >
            New page
          </Button>
          {tree.isSuccess && (
            <TreeItemMenu
              node={tree.data.root}
              canWrite={canWrite}
              writeDisabledReason={disabledReason}
              open={rootMenu}
              onOpenChange={setRootMenu}
              onAction={(action) => management.onAction(action, tree.data.root)}
            >
              <IconButton ref={rootMenuButton} size="sm" label="Space actions" icon={<DotsHorizontalIcon />} variant="secondary" />
            </TreeItemMenu>
          )}
        </div>
      )}
      {tree.isPending && (
        <p className="muted" role="status">
          Loading pages…
        </p>
      )}
      {tree.isError && <Callout tone="danger" title="The page tree could not be loaded." />}
      {tree.isSuccess && (
        <PageTree
          ref={treeHandle}
          spaceId={spaceId}
          root={tree.data.root}
          currentPath={currentPath}
          canWrite={canWrite}
          writeDisabledReason={disabledReason}
          onAction={management.onAction}
          onDraggingChange={setDragging}
          onDropInto={management.openMove}
          onDropReorder={(node, before, target, zone) =>
            void management.reorderItem(node, before, `Moved ${zone} ${target.title ?? target.name}`)
          }
        />
      )}
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
        {space && view.kind === 'page' && (
          <PageView space={space} path={view.path} asideNode={asideNode} onTreeAction={disabledReason ? undefined : management.onAction} />
        )}
        {space && view.kind === 'version' && <PageView space={space} path={view.path} version={view.version} asideNode={null} />}
        {space && view.kind === 'edit' && (canWrite ? <PageEdit key={view.path} space={space} path={view.path} /> : <ReadOnly space={space} />)}
        {space && view.kind === 'new' && (canWrite ? <PageEdit key={`new:${view.path}`} space={space} path={view.path} isNew /> : <ReadOnly space={space} />)}
        {space && view.kind === 'history' && <History space={space} path={view.path} version={new URLSearchParams(location.search).get('version') ?? undefined} />}
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
      {management.dialogs}
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
