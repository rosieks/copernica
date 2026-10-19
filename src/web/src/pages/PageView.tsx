import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import { ChatBubbleIcon, CounterClockwiseClockIcon, DownloadIcon, Pencil1Icon } from '@radix-ui/react-icons';
import { api, ApiError, encodePath, type Schemas } from '../api/client';
import { DeletePageDialog } from '../components/PageDialogs';
import type { TreeAction } from '../components/TreeItemMenu';
import { DiscussionPanel } from '../discussions/DiscussionPanel';
import { HighlightMarkers } from '../discussions/HighlightMarkers';
import { SelectionPopover, useArticleSelection } from '../discussions/SelectionPopover';
import { rangesForOffsets, type TextAnchorInput } from '../discussions/textAnchor';
import { highlightTargets, useDiscussions } from '../discussions/useDiscussions';
import { useDiagrams } from '../diagrams/useDiagrams';
import { useHighlights } from '../discussions/useHighlights';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { MEDIUM, useMediaQuery, WIDE } from '../layout/useMediaQuery';
import { moveDraft } from '../drafts';
import { fileApi, pageApi, spaceRoute } from '../routes';
import { useShortcut } from '../shortcuts';
import { Button, Callout, EmptyState, Kbd, Sheet, Toolbar, Tooltip } from '../ui';
import { Breadcrumbs } from './Breadcrumbs';
import { PageActions } from './PageActions';
import { PageInfo } from './PageInfo';
import { StateIndicators } from './StateIndicators';
import './PageView.css';

export function usePage(spaceId: string, path: string, version?: string) {
  return useQuery({
    queryKey: ['page', spaceId, path, version ?? 'head'],
    queryFn: () => api<Schemas['Page']>(pageApi(spaceId, path) + (version ? `?version=${encodeURIComponent(version)}` : '')),
  });
}

/** The tree node of a page, for the tree's rename and move dialogs. */
function pageNode(path: string, title: string): Schemas['TreeNode'] {
  return { name: path.split('/').pop() ?? path, path, title, kind: 'page' };
}

interface Props {
  space: Schemas['Space'];
  path: string;
  version?: string;
  /** The grid's aside column (wide screens); discussions render there. */
  asideNode: HTMLElement | null;
  /** Tree management for this page (rename, move; 005 FR-003). */
  onTreeAction?: (action: TreeAction, node: Schemas['TreeNode']) => void;
}

/** S3. Renders a page; the HTML is sanitized by the server and this is the only place it is injected. */
export function PageView({ space, path, version, asideNode, onTreeAction }: Props) {
  const spaceId = space.id;
  const page = usePage(spaceId, path, version);
  const navigate = useNavigate();
  const location = useLocation();
  const movedFrom = (location.state as { movedFrom?: string } | null)?.movedFrom;
  const [dismissedMove, setDismissedMove] = useState<string>();
  const problem = page.error instanceof ApiError ? page.error : undefined;
  const movedTo = problem?.type === 'page-moved' && typeof problem.problem.currentPath === 'string' ? problem.problem.currentPath : undefined;
  const lastVersion = typeof problem?.problem.lastVersion === 'string' ? problem.problem.lastVersion : undefined;

  // An old address of a moved page: go to where it is now and say so (005 FR-010).
  useEffect(() => {
    if (!movedTo || version) return;
    moveDraft(spaceId, path, movedTo);
    navigate(spaceRoute(spaceId, movedTo), { replace: true, state: { movedFrom: path } });
  }, [movedTo, version, spaceId, path, navigate]);
  const article = useRef<HTMLElement>(null);
  const moreActions = useRef<HTMLButtonElement>(null);
  const discussionsToggle = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const [draftAnchor, setDraftAnchor] = useState<TextAnchorInput>();
  const wide = useMediaQuery(WIDE);
  const medium = useMediaQuery(MEDIUM);

  const data = page.data;
  const isCurrent = !version && data?.isCurrent !== false;
  const withDiscussions = !!data && isCurrent && !data.tooLarge;
  const canEdit = space.canWrite && !!data && isCurrent && !data.tooLarge;
  useDocumentTitle(data?.title ?? (page.isError ? 'Page not found' : undefined), space.displayName);

  const open = useDiscussions(spaceId, path, data?.version.commitId ?? '', 'open', withDiscussions);
  const targets = useMemo(() => highlightTargets(open.data), [open.data]);
  const selection = useArticleSelection(article);

  const showDiscussions = useCallback(() => {
    if (!wide) setSheetOpen(true);
  }, [wide]);

  // From a highlight in the page: open its thread.
  const activateFromPage = useCallback(
    (id: string) => {
      setActiveId(id);
      showDiscussions();
    },
    [showDiscussions],
  );

  // From a thread: show its fragment in the page.
  const showInPage = useCallback(
    (id: string) => {
      setActiveId(id);
      const target = targets.find((t) => t.id === id);
      const root = article.current;
      if (!target || !root) return;
      const range = rangesForOffsets(root, target.start, target.end)[0];
      const node = range?.startContainer;
      (node instanceof Element ? node : node?.parentElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!wide && !medium) setSheetOpen(false);
    },
    [targets, wide, medium],
  );

  useHighlights(article, targets, activeId, activateFromPage);
  // Diagram figures in the sanitized HTML are drawn as images (004); the text never waits for them.
  const diagramStatus = useDiagrams(article, data?.html);

  const comment = useCallback(
    (anchor: TextAnchorInput) => {
      setDraftAnchor(anchor);
      showDiscussions();
    },
    [showDiscussions],
  );

  useShortcut({
    key: 'e',
    single: true,
    label: 'e',
    description: 'Edit this page',
    group: 'Page',
    enabled: canEdit,
    handler: () => navigate(`/s/${spaceId}/-/edit/${encodePath(path)}`),
  });
  useShortcut({
    key: 'c',
    single: true,
    label: 'c',
    description: 'Comment on the selected text',
    group: 'Discussions',
    enabled: withDiscussions,
    handler: () => {
      if (selection) comment(selection.anchor);
    },
  });

  function onClick(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('/s/')) return;
    event.preventDefault();
    if (anchor!.classList.contains('broken-link') && space.canWrite) {
      // Offer to create the missing page.
      const [, , target, ...rest] = href.split('/');
      if (target === spaceId) {
        navigate(`/s/${spaceId}/-/new/${rest.join('/')}`);
        return;
      }
    }
    navigate(href);
  }

  if (page.isPending) {
    return (
      <p className="status" role="status">
        Loading page…
      </p>
    );
  }

  if (page.isError && movedTo && !version) {
    return (
      <p className="status" role="status">
        This page has moved. Opening it at its new location…
      </p>
    );
  }

  if (page.isError) {
    const notFound = page.error instanceof ApiError && page.error.status === 404;
    return (
      <>
        <StateIndicators space={space} />
        <h1 className="visually-hidden">{notFound ? 'Page not found' : 'This page could not be loaded'}</h1>
        <EmptyState
          title={notFound ? 'Page not found' : 'This page could not be loaded'}
          description={
            notFound && lastVersion ? (
              <>
                The page at “{path}” was deleted. <Link to={`/s/${spaceId}/-/history/${encodePath(path)}?version=${lastVersion}`}>View its history</Link>
              </>
            ) : notFound ? (
              `There is no page at “${path}”.`
            ) : (
              page.error.message
            )
          }
          action={
            notFound && space.canWrite && !version ? (
              <Button asChild variant="primary">
                <Link to={`/s/${spaceId}/-/new/${encodePath(path)}`}>Create this page</Link>
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  const loaded = data!;
  const hasHeading = /<h1[\s>]/i.test(loaded.html);
  const openCount = targets.length;

  const panel = withDiscussions ? (
    <DiscussionPanel
      spaceId={spaceId}
      path={path}
      page={loaded}
      selection={selection?.anchor}
      draftAnchor={draftAnchor}
      onDraftAnchorChange={setDraftAnchor}
      activeId={activeId}
      onActivate={showInPage}
      article={article}
      layout={wide ? 'margin' : 'list'}
    />
  ) : null;

  return (
    <div className="page">
      <StateIndicators space={space} path={path} page={loaded} />
      {movedFrom && dismissedMove !== movedFrom && (
        <Callout tone="info" title={`This page was moved from “${movedFrom}”.`} onDismiss={() => setDismissedMove(movedFrom)} />
      )}
      <Breadcrumbs spaceId={spaceId} spaceName={space.displayName} path={path} />
      <div className="page__head">
        {hasHeading || loaded.tooLarge ? <span /> : <h1 className="page__title">{loaded.title}</h1>}
        <Toolbar.Root label="Page actions">
          {canEdit && (
            <Tooltip
              content={
                <>
                  Edit <Kbd>e</Kbd>
                </>
              }
            >
              <Toolbar.Link asChild>
                <Button asChild variant="primary">
                  <Link to={`/s/${spaceId}/-/edit/${encodePath(path)}`}>
                    <Pencil1Icon aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              </Toolbar.Link>
            </Tooltip>
          )}
          <Toolbar.Link asChild>
            <Button asChild>
              <Link to={`/s/${spaceId}/-/history/${encodePath(path)}`}>
                <CounterClockwiseClockIcon aria-hidden="true" />
                History
              </Link>
            </Button>
          </Toolbar.Link>
          {withDiscussions && !wide && (
            <Toolbar.Button asChild>
              <Button
                ref={discussionsToggle}
                icon={<ChatBubbleIcon />}
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((o) => !o)}
              >
                Discussions ({openCount})
              </Button>
            </Toolbar.Button>
          )}
          <PageActions
            spaceId={spaceId}
            path={path}
            commitId={loaded.version.commitId}
            isCurrent={isCurrent}
            canDelete={canEdit}
            onDelete={() => setDeleting(true)}
            onRename={canEdit && onTreeAction ? () => onTreeAction('rename', pageNode(path, loaded.title)) : undefined}
            onMove={canEdit && onTreeAction ? () => onTreeAction('move', pageNode(path, loaded.title)) : undefined}
            triggerRef={moreActions}
          />
        </Toolbar.Root>
      </div>
      <PageInfo spaceId={spaceId} path={path} commitId={loaded.version.commitId} />

      {loaded.tooLarge ? (
        <>
          <h1 className="page__title">{loaded.title}</h1>
          <EmptyState
            title="This page is too large to display."
            action={
              <Button asChild icon={<DownloadIcon />}>
                <a href={fileApi(spaceId, path, loaded.version.commitId)} download={path.split('/').pop()}>
                  Download the Markdown file
                </a>
              </Button>
            }
          />
        </>
      ) : (
        <div className="page__article-wrap">
          <article
            ref={article}
            className="prose"
            onClick={onClick}
            // Server-rendered and sanitized (Constitution: server-side Markdown rendering).
            dangerouslySetInnerHTML={{ __html: loaded.html }}
          />
          <p className="visually-hidden" role="status" aria-live="polite">
            {diagramStatus}
          </p>
          {withDiscussions && <HighlightMarkers article={article} targets={targets} activeId={activeId} onActivate={activateFromPage} />}
        </div>
      )}
      {withDiscussions && <SelectionPopover selection={draftAnchor ? undefined : selection} onComment={comment} />}

      {panel && wide && asideNode && createPortal(panel, asideNode)}
      {panel && !wide && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Discussions" side="right" modal={!medium} returnFocusTo={discussionsToggle}>
          {panel}
        </Sheet>
      )}

      {canEdit && (
        <DeletePageDialog
          spaceId={spaceId}
          path={path}
          version={loaded.version}
          open={deleting}
          onClose={() => setDeleting(false)}
          returnFocusTo={moreActions}
        />
      )}
    </div>
  );
}
