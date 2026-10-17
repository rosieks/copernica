import { useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api, ApiError, encodePath, type Schemas } from '../api/client';
import { DeletePageDialog } from '../components/PageDialogs';
import { fileApi, pageApi, spaceRoute } from '../routes';

export function usePage(spaceId: string, path: string, version?: string) {
  return useQuery({
    queryKey: ['page', spaceId, path, version ?? 'head'],
    queryFn: () => api<Schemas['Page']>(pageApi(spaceId, path) + (version ? `?version=${encodeURIComponent(version)}` : '')),
  });
}

interface Props {
  spaceId: string;
  path: string;
  version?: string;
  canWrite: boolean;
  /** Rendered next to the article (discussions). */
  aside?: (page: Schemas['Page'], article: RefObject<HTMLElement | null>) => ReactNode;
}

/** Renders a page. The HTML is sanitized by the server; this is the only place it is injected. */
export function PageView({ spaceId, path, version, canWrite, aside }: Props) {
  const page = usePage(spaceId, path, version);
  const navigate = useNavigate();
  const article = useRef<HTMLElement>(null);
  const [deleting, setDeleting] = useState(false);

  function onClick(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('/s/')) return;
    event.preventDefault();
    if (anchor!.classList.contains('broken-link') && canWrite) {
      // Offer to create the missing page.
      const [, , target, ...rest] = href.split('/');
      if (target === spaceId) {
        navigate(`/s/${spaceId}/-/new/${rest.join('/')}`);
        return;
      }
    }
    navigate(href);
  }

  if (page.isPending) return <p className="status">Loading page…</p>;

  if (page.isError) {
    const notFound = page.error instanceof ApiError && page.error.status === 404;
    return (
      <div className="page-missing">
        <h1>{notFound ? 'Page not found' : 'This page could not be loaded'}</h1>
        <p>{notFound ? `There is no page at “${path}”.` : page.error.message}</p>
        {notFound && canWrite && !version && (
          <Link className="button primary" to={`/s/${spaceId}/-/new/${encodePath(path)}`}>
            Create this page
          </Link>
        )}
      </div>
    );
  }

  const data = page.data;
  return (
    <div className="page">
      <div className="page-toolbar">
        {!data.isCurrent && (
          <span className="banner info">
            You are viewing an older version. <Link to={spaceRoute(spaceId, path)}>Go to the current version</Link>
          </span>
        )}
        <Link className="button" to={`/s/${spaceId}/-/history/${encodePath(path)}`}>
          History
        </Link>
        {canWrite && data.isCurrent && !data.tooLarge && (
          <>
            <Link className="button primary" to={`/s/${spaceId}/-/edit/${encodePath(path)}`}>
              Edit
            </Link>
            <button type="button" onClick={() => setDeleting(true)}>
              Delete
            </button>
          </>
        )}
      </div>
      {data.tooLarge ? (
        <div className="page-too-large">
          <h1>{data.title}</h1>
          <p>This page is too large to display.</p>
          <a className="button" href={fileApi(spaceId, path, data.version.commitId)}>
            Download the Markdown file
          </a>
        </div>
      ) : (
        <div className={aside ? 'page-with-discussions' : undefined}>
          <article
            ref={article}
            className="markdown-body"
            onClick={onClick}
            // Server-rendered and sanitized (Constitution: server-side Markdown rendering).
            dangerouslySetInnerHTML={{ __html: data.html }}
          />
          {aside?.(data, article)}
        </div>
      )}
      {canWrite && (
        <DeletePageDialog spaceId={spaceId} path={path} version={data.version} open={deleting} onClose={() => setDeleting(false)} />
      )}
    </div>
  );
}
