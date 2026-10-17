import { useCallback, useEffect, useMemo, useState, type FormEvent, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Schemas } from '../api/client';
import { anchorFromSelection, type TextAnchorInput } from './textAnchor';
import { useHighlights } from './useHighlights';
import { useMe } from '../App';

type Discussion = Schemas['Discussion'];
type Comment = Schemas['Comment'];
type Filter = 'open' | 'resolved' | 'all';

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

interface Props {
  spaceId: string;
  path: string;
  page: Schemas['Page'];
  article: RefObject<HTMLElement | null>;
}

/** Discussions anchored to fragments of the current page (US4). */
export function DiscussionPanel({ spaceId, path, page, article }: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('open');
  const [activeId, setActiveId] = useState<string>();
  const [selection, setSelection] = useState<TextAnchorInput>();
  const [draftAnchor, setDraftAnchor] = useState<TextAnchorInput>();
  const commitId = page.version.commitId;

  const key = ['discussions', spaceId, path, commitId, filter];
  const discussions = useQuery({
    queryKey: key,
    queryFn: () =>
      api<Discussion[]>(
        `/api/spaces/${encodeURIComponent(spaceId)}/discussions?path=${encodeURIComponent(path)}&state=${filter}`,
      ),
  });
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['discussions', spaceId, path] }),
    [queryClient, spaceId, path],
  );

  // Track the reader's selection inside the article.
  useEffect(() => {
    function update() {
      const root = article.current;
      setSelection(root ? anchorFromSelection(root, window.getSelection()) : undefined);
    }
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [article]);

  const targets = useMemo(
    () =>
      (discussions.data ?? [])
        .filter((d) => d.state === 'open' && d.anchorStatus === 'anchored')
        .map((d) => ({ id: d.id!, start: d.anchor!.start!, end: d.anchor!.end! })),
    [discussions.data],
  );
  const activate = useCallback((id: string) => {
    setActiveId(id);
    document.getElementById(`discussion-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);
  useHighlights(article, targets, activeId, activate);

  return (
    <aside className="discussion-panel" aria-label="Discussions">
      <h2>Discussions</h2>
      <div className="discussion-tools">
        <button
          type="button"
          className="primary"
          disabled={!selection}
          onClick={() => setDraftAnchor(selection)}
          title={selection ? undefined : 'Select text in the page first'}
        >
          Comment on selection
        </button>
        <label>
          <span className="visually-hidden">Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Show discussions">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {draftAnchor && (
        <NewDiscussion
          spaceId={spaceId}
          path={path}
          commitId={commitId}
          anchor={draftAnchor}
          onDone={(created) => {
            setDraftAnchor(undefined);
            window.getSelection()?.removeAllRanges();
            if (created) {
              setActiveId(created);
              void refresh();
            }
          }}
        />
      )}

      {discussions.isPending && <p className="status">Loading discussions…</p>}
      {discussions.isError && <p className="error">{discussions.error.message}</p>}
      {discussions.data?.length === 0 && !draftAnchor && (
        <p className="muted">
          {filter === 'open' ? 'No open discussions. Select text in the page to start one.' : 'No discussions.'}
        </p>
      )}
      {discussions.data?.map((d) => (
        <DiscussionThread
          key={d.id}
          discussion={d}
          active={d.id === activeId}
          onActivate={() => activate(d.id!)}
          onChanged={refresh}
        />
      ))}
    </aside>
  );
}

function NewDiscussion({
  spaceId,
  path,
  commitId,
  anchor,
  onDone,
}: {
  spaceId: string;
  path: string;
  commitId: string;
  anchor: TextAnchorInput;
  onDone: (createdId?: string) => void;
}) {
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api<Discussion>(`/api/spaces/${encodeURIComponent(spaceId)}/discussions`, {
        method: 'POST',
        json: { path, anchor: { ...anchor, commitId }, body },
      }),
    onSuccess: (created) => onDone(created.id),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) create.mutate();
  }

  return (
    <form className="discussion new-discussion form" onSubmit={submit} aria-label="New discussion">
      <blockquote className="discussion-quote">{anchor.exact}</blockquote>
      <label>
        Comment
        <textarea autoFocus rows={3} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {create.isError && <p role="alert" className="error">{errorText(create.error)}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={() => onDone()}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={create.isPending || !body.trim()}>
          Start discussion
        </button>
      </div>
    </form>
  );
}

function DiscussionThread({
  discussion,
  active,
  onActivate,
  onChanged,
}: {
  discussion: Discussion;
  active: boolean;
  onActivate: () => void;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState('');
  const outdated = discussion.anchorStatus === 'outdated';
  const resolved = discussion.state === 'resolved';
  const base = `/api/discussions/${discussion.id}`;

  const sendReply = useMutation({
    mutationFn: () => api(`${base}/comments`, { method: 'POST', json: { body: reply } }),
    onSuccess: () => {
      setReply('');
      onChanged();
    },
  });
  const setState = useMutation({
    mutationFn: (state: 'open' | 'resolved') => api(`${base}/state`, { method: 'PUT', json: { state } }),
    onSuccess: onChanged,
  });

  return (
    <article
      id={`discussion-${discussion.id}`}
      className={`discussion ${active ? 'active' : ''}`}
      aria-label={`Discussion about “${outdated ? discussion.anchor?.originalExact : discussion.anchor?.exact}”`}
    >
      <blockquote className="discussion-quote">
        {outdated ? discussion.anchor?.originalExact : discussion.anchor?.exact}
      </blockquote>
      <p className="muted">
        {outdated && <span className="badge badge-unavailable">Outdated — the text was changed</span>}{' '}
        {resolved && <span className="badge">Resolved{discussion.resolvedBy ? ` by ${discussion.resolvedBy.displayName}` : ''}</span>}{' '}
        {!outdated && !resolved && (
          <button type="button" className="link-button" onClick={onActivate}>
            Show in page
          </button>
        )}
      </p>
      {discussion.comments?.map((c) => (
        <CommentView key={c.id} discussionId={discussion.id!} comment={c} onChanged={onChanged} />
      ))}
      {!resolved && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) sendReply.mutate();
          }}
        >
          <label>
            <span className="visually-hidden">Reply</span>
            <textarea rows={2} placeholder="Reply…" maxLength={10000} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" />
          </label>
          {sendReply.isError && <p role="alert" className="error">{errorText(sendReply.error)}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={() => setState.mutate('resolved')} disabled={setState.isPending}>
              Resolve
            </button>
            <button type="submit" className="primary" disabled={!reply.trim() || sendReply.isPending}>
              Reply
            </button>
          </div>
        </form>
      )}
      {resolved && (
        <button type="button" onClick={() => setState.mutate('open')} disabled={setState.isPending}>
          Reopen
        </button>
      )}
    </article>
  );
}

function CommentView({ discussionId, comment, onChanged }: { discussionId: string; comment: Comment; onChanged: () => void }) {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body ?? '');
  const url = `/api/discussions/${discussionId}/comments/${comment.id}`;
  const own = comment.author?.id === me.data?.id && !comment.deleted;

  const save = useMutation({
    mutationFn: () => api(url, { method: 'PATCH', json: { body: text } }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });
  const remove = useMutation({ mutationFn: () => api(url, { method: 'DELETE' }), onSuccess: onChanged });

  if (comment.deleted) {
    return <div className="comment muted">Comment deleted</div>;
  }

  return (
    <div className="comment">
      <div className="comment-meta">
        <strong>{comment.author?.displayName}</strong> · {timeFormat.format(new Date(comment.createdAt!))}
        {comment.editedAt && ' · edited'}
      </div>
      {editing ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) save.mutate();
          }}
        >
          <textarea rows={3} value={text} maxLength={10000} onChange={(e) => setText(e.target.value)} aria-label="Edit comment" />
          <div className="dialog-actions">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={save.isPending}>
              Save
            </button>
          </div>
        </form>
      ) : (
        // Rendered and sanitized by the server.
        <div className="comment-body" dangerouslySetInnerHTML={{ __html: comment.html ?? '' }} />
      )}
      {own && !editing && (
        <div className="comment-actions">
          <button type="button" className="link-button" onClick={() => setEditing(true)}>
            Edit
          </button>{' '}
          <button
            type="button"
            className="link-button danger"
            onClick={() => {
              if (window.confirm('Delete this comment?')) remove.mutate();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return [error.problem.title, error.problem.detail].filter(Boolean).join(' ');
  return 'Something went wrong. Try again.';
}

