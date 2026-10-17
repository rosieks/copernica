import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChatBubbleIcon, CheckCircledIcon, DotsHorizontalIcon, ResetIcon } from '@radix-ui/react-icons';
import { api, ApiError, type Schemas } from '../api/client';
import { useMe } from '../App';
import { absoluteTime, relativeTime } from '../format';
import { AlertDialog, Avatar, Badge, Button, Callout, Collapsible, EmptyState, Field, IconButton, Menu, ToggleGroup, Tooltip } from '../ui';
import { MarginLayout, type MarginItem } from './MarginLayout';
import type { TextAnchorInput } from './textAnchor';
import { useDiscussions, useRefreshDiscussions, type Discussion, type DiscussionFilter } from './useDiscussions';
import './discussions.css';

type Comment = Schemas['Comment'];

const FILTERS: { value: DiscussionFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

interface Props {
  spaceId: string;
  path: string;
  page: Schemas['Page'];
  /** Current selection inside the article, if any. */
  selection?: TextAnchorInput;
  draftAnchor?: TextAnchorInput;
  onDraftAnchorChange: (anchor: TextAnchorInput | undefined) => void;
  activeId?: string;
  /** Activate a thread and show its fragment in the page. */
  onActivate: (id: string) => void;
  /** The page article; needed to place threads next to their fragments. */
  article: RefObject<HTMLElement | null>;
  /** `margin`: threads at the height of their fragment (wide screens); `list`: a plain list (sheet). */
  layout: 'margin' | 'list';
}

/** Discussions anchored to fragments of the current page (001 US4, 002 US4). */
export function DiscussionPanel({ spaceId, path, page, selection, draftAnchor, onDraftAnchorChange, activeId, onActivate, article, layout }: Props) {
  const [filter, setFilter] = useState<DiscussionFilter>('open');
  const commitId = page.version.commitId;
  const discussions = useDiscussions(spaceId, path, commitId, filter);
  const refresh = useRefreshDiscussions(spaceId, path);

  useEffect(() => {
    if (activeId && layout === 'list') document.getElementById(`discussion-${activeId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId, layout]);

  const composer = draftAnchor ? (
    <DiscussionComposer
      spaceId={spaceId}
      path={path}
      commitId={commitId}
      anchor={draftAnchor}
      onDone={(created) => {
        onDraftAnchorChange(undefined);
        window.getSelection()?.removeAllRanges();
        if (created) {
          setFilter('open');
          void refresh().then(() => onActivate(created));
        }
      }}
    />
  ) : null;

  const thread = (d: Discussion) => (
    <li key={d.id}>
      <DiscussionThread discussion={d} active={d.id === activeId} onActivate={() => onActivate(d.id!)} onChanged={refresh} />
    </li>
  );

  // Margin layout: anchored threads (and the draft) beside their fragments; the rest above.
  const all = discussions.data ?? [];
  const unplaced = all.filter((d) => !isPlaced(d));
  const marginItems: MarginItem[] = [
    ...all.filter(isPlaced).map((d) => ({
      id: d.id!,
      start: d.anchor!.start!,
      end: d.anchor!.end!,
      node: <ul className="discussions__list">{thread(d)}</ul>,
    })),
    ...(draftAnchor && composer ? [{ id: DRAFT, start: draftAnchor.start, end: draftAnchor.end, node: composer }] : []),
  ];

  return (
    <section className="discussions" aria-labelledby="discussions-title">
      <div className="discussions__header">
        <h2 id="discussions-title" className="discussions__title">
          Discussions
        </h2>
        <ToggleGroup label="Show discussions" value={filter} onValueChange={setFilter} items={FILTERS} />
      </div>
      <Button
        size="sm"
        icon={<ChatBubbleIcon />}
        disabled={!selection}
        onClick={() => onDraftAnchorChange(selection)}
        aria-describedby={selection ? undefined : 'comment-hint'}
        className="discussions__comment"
      >
        Comment on selection
      </Button>
      {/* In the margin layout the header stays short, so threads can line up with the text. */}
      {!selection && (
        <p id="comment-hint" className={layout === 'margin' ? 'visually-hidden' : 'muted discussions__hint'}>
          Select text in the page to comment on it.
        </p>
      )}

      {draftAnchor && layout === 'list' && composer}

      {discussions.isPending && (
        <p className="muted" role="status">
          Loading discussions…
        </p>
      )}
      {discussions.isError && <Callout tone="danger" title="Discussions could not be loaded." />}
      {discussions.data?.length === 0 && !draftAnchor && (
        <EmptyState
          title={filter === 'open' ? 'No open discussions.' : filter === 'resolved' ? 'No resolved discussions.' : 'No discussions.'}
          description={filter === 'open' ? 'Select text in the page to start one.' : undefined}
        />
      )}
      {layout === 'list' ? (
        <ul className="discussions__list">{(discussions.data ?? []).map(thread)}</ul>
      ) : (
        <>
          <MarginLayout article={article} items={marginItems} activeId={draftAnchor ? DRAFT : activeId} />
          {unplaced.length > 0 && (
            <section aria-label="Discussions not attached to the text" className="stack">
              <h3 className="discussions__subtitle">Not attached to the text</h3>
              <ul className="discussions__list">{unplaced.map(thread)}</ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}

const DRAFT = '__draft';

function isPlaced(d: Discussion): boolean {
  return d.anchorStatus === 'anchored' && d.anchor?.start !== undefined && d.anchor?.end !== undefined;
}

/** Ctrl/⌘+Enter submits the enclosing form (FR-015). */
function submitOnModEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function DiscussionComposer({
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
    if (body.trim() && !create.isPending) create.mutate();
  }

  return (
    <form className="discussion discussion--draft" onSubmit={submit} aria-label="New discussion">
      <blockquote className="discussion__quote">{anchor.exact}</blockquote>
      <Field
        as="textarea"
        label="Comment"
        hint="Ctrl/⌘ + Enter to post"
        autoFocus
        rows={3}
        maxLength={10000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={submitOnModEnter}
      />
      {create.isError && <Callout tone="danger" title={errorText(create.error)} onDismiss={() => create.reset()} />}
      <div className="row row--end">
        <Button onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={create.isPending || !body.trim()}>
          Comment
        </Button>
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
  onChanged: () => Promise<unknown>;
}) {
  const [reply, setReply] = useState('');
  const [expanded, setExpanded] = useState(true);
  const replyBox = useRef<HTMLTextAreaElement>(null);
  const outdated = discussion.anchorStatus === 'outdated';
  const resolved = discussion.state === 'resolved';
  const base = `/api/discussions/${discussion.id}`;
  const quote = outdated ? discussion.anchor?.originalExact : discussion.anchor?.exact;
  const comments = discussion.comments ?? [];
  const [first, ...replies] = comments;

  const sendReply = useMutation({
    mutationFn: () => api(`${base}/comments`, { method: 'POST', json: { body: reply } }),
    onSuccess: () => {
      setReply('');
      void onChanged();
    },
  });
  const setState = useMutation({
    mutationFn: (state: 'open' | 'resolved') => api(`${base}/state`, { method: 'PUT', json: { state } }),
    onSuccess: () => void onChanged(),
  });

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  return (
    <article
      id={`discussion-${discussion.id}`}
      className={`discussion${active ? ' discussion--active' : ''}`}
      aria-label={`Discussion about “${quote ?? ''}”`}
    >
      <div className="discussion__top">
        <blockquote className={`discussion__quote${outdated ? ' discussion__quote--outdated' : ''}`}>{quote}</blockquote>
        {resolved ? (
          <IconButton label="Reopen" icon={<ResetIcon />} size="sm" onClick={() => setState.mutate('open')} disabled={setState.isPending} />
        ) : (
          <IconButton label="Resolve" icon={<CheckCircledIcon />} size="sm" onClick={() => setState.mutate('resolved')} disabled={setState.isPending} />
        )}
      </div>
      <div className="row discussion__badges">
        {outdated && <Badge tone="warning">Outdated</Badge>}
        {resolved && <Badge>Resolved{discussion.resolvedBy ? ` by ${discussion.resolvedBy.displayName}` : ''}</Badge>}
        {!outdated && !resolved && (
          <Button size="sm" variant="ghost" onClick={onActivate}>
            Show in page
          </Button>
        )}
      </div>
      {outdated && <p className="muted">The text this discussion referred to has changed.</p>}
      {setState.isError && <Callout tone="danger" title={errorText(setState.error)} onDismiss={() => setState.reset()} />}

      {first && <CommentView discussionId={discussion.id!} comment={first} onChanged={onChanged} focusAfterDelete={() => replyBox.current} />}
      {replies.length > 0 && (
        <Collapsible.Root open={expanded} onOpenChange={setExpanded}>
          <Collapsible.Trigger asChild>
            <Button size="sm" variant="ghost" className="discussion__toggle">
              {expanded ? 'Hide replies' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
            </Button>
          </Collapsible.Trigger>
          <Collapsible.Content>
            {replies.map((c) => (
              <CommentView key={c.id} discussionId={discussion.id!} comment={c} onChanged={onChanged} focusAfterDelete={() => replyBox.current} />
            ))}
          </Collapsible.Content>
        </Collapsible.Root>
      )}

      {!resolved && (
        <form
          className="stack discussion__reply"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim() && !sendReply.isPending) sendReply.mutate();
          }}
        >
          <Field
            ref={replyBox}
            as="textarea"
            label="Reply"
            hideLabel
            rows={2}
            placeholder="Reply…"
            maxLength={10000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={submitOnModEnter}
          />
          {sendReply.isError && <Callout tone="danger" title={errorText(sendReply.error)} onDismiss={() => sendReply.reset()} />}
          {reply.trim() && (
            <div className="row row--end">
              <Button type="submit" size="sm" variant="primary" disabled={sendReply.isPending}>
                Reply
              </Button>
            </div>
          )}
        </form>
      )}
    </article>
  );
}

function CommentView({
  discussionId,
  comment,
  onChanged,
  focusAfterDelete,
}: {
  discussionId: string;
  comment: Comment;
  onChanged: () => Promise<unknown>;
  focusAfterDelete: () => HTMLElement | null;
}) {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [text, setText] = useState(comment.body ?? '');
  const self = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const url = `/api/discussions/${discussionId}/comments/${comment.id}`;
  const own = comment.author?.id === me.data?.id && !comment.deleted;

  const save = useMutation({
    mutationFn: () => api(url, { method: 'PATCH', json: { body: text } }),
    onSuccess: () => {
      setEditing(false);
      void onChanged();
    },
  });
  const remove = useMutation({ mutationFn: () => api(url, { method: 'DELETE' }) });

  async function confirmDelete() {
    // Focus a sensible neighbour after the comment disappears (FR-014).
    const article = self.current?.closest('article');
    const comments = article ? [...article.querySelectorAll<HTMLElement>('.comment')] : [];
    const index = comments.indexOf(self.current!);
    const neighbour = comments[index + 1] ?? comments[index - 1];
    await remove.mutateAsync();
    await onChanged();
    // After the dialog has closed (its focus trap would pull focus back otherwise).
    window.setTimeout(() => {
      const target = neighbour?.isConnected ? neighbour : (focusAfterDelete() ?? (article?.isConnected ? article : null));
      if (!target) return;
      if (!target.hasAttribute('tabindex') && !(target instanceof HTMLTextAreaElement)) target.setAttribute('tabindex', '-1');
      target.focus();
    }, 0);
  }

  if (comment.deleted) {
    return <div className="comment muted">Comment deleted</div>;
  }

  const author = comment.author?.displayName ?? 'Unknown';
  return (
    <div className="comment" ref={self}>
      <div className="comment__meta">
        <Avatar name={author} />
        <span className="comment__author">{author}</span>
        <Tooltip content={absoluteTime(comment.createdAt!)}>
          <time className="muted" dateTime={comment.createdAt} tabIndex={0}>
            {relativeTime(comment.createdAt!)}
          </time>
        </Tooltip>
        {comment.editedAt && <span className="muted">(edited)</span>}
        {own && !editing && (
          <span className="comment__menu">
            <Menu.Root>
              <Menu.Trigger asChild>
                <IconButton ref={menuTrigger} label="Comment actions" icon={<DotsHorizontalIcon />} size="sm" />
              </Menu.Trigger>
              <Menu.Content label="Comment actions">
                <Menu.Item onSelect={() => setEditing(true)}>Edit</Menu.Item>
                <Menu.Item tone="danger" onSelect={() => setDeleting(true)}>
                  Delete…
                </Menu.Item>
              </Menu.Content>
            </Menu.Root>
          </span>
        )}
      </div>
      {editing ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) save.mutate();
          }}
        >
          <Field as="textarea" label="Edit comment" hideLabel rows={3} value={text} maxLength={10000} onChange={(e) => setText(e.target.value)} onKeyDown={submitOnModEnter} />
          {save.isError && <Callout tone="danger" title={errorText(save.error)} onDismiss={() => save.reset()} />}
          <div className="row row--end">
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      ) : (
        // Rendered and sanitized by the server.
        <div className="comment__body prose" dangerouslySetInnerHTML={{ __html: comment.html ?? '' }} />
      )}
      <AlertDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this comment?"
        confirmLabel="Delete comment"
        busy={remove.isPending}
        returnFocusTo={menuTrigger}
        onConfirm={confirmDelete}
      >
        {remove.isError && <Callout tone="danger" title={errorText(remove.error)} />}
      </AlertDialog>
    </div>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return [error.problem.title, error.problem.detail].filter(Boolean).join(' ');
  return 'Something went wrong. Your text is kept; try again.';
}
