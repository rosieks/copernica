import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ApiError, isUnauthenticated, type Schemas } from '../api/client';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { ConflictView, type EditConflict } from './ConflictView';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../drafts';
import { pageApi, spaceRoute } from '../routes';
import { useSaveNotice } from '../components/SaveNotice';

interface Props {
  spaceId: string;
  path: string;
  /** True when creating a new page at `path`. */
  isNew?: boolean;
}

function usePreview(spaceId: string, path: string, markdown: string) {
  const [debounced, setDebounced] = useState(markdown);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(markdown), 300);
    return () => clearTimeout(timer);
  }, [markdown]);

  return useQuery({
    queryKey: ['preview', spaceId, path, debounced],
    queryFn: () => api<{ html: string }>('/api/render', { method: 'POST', json: { spaceId, path, markdown: debounced } }),
    placeholderData: (previous) => previous,
  });
}

export function PageEdit({ spaceId, path, isNew = false }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notice = useSaveNotice();
  const page = useQuery({
    queryKey: ['page-source', spaceId, path],
    queryFn: () => api<Schemas['Page']>(`${pageApi(spaceId, path)}?source=true`),
    enabled: !isNew,
    staleTime: Infinity,
  });

  const initialDraft = useMemo(() => loadDraft(spaceId, path), [spaceId, path]);
  const [draft, setDraft] = useState<Draft | undefined>(initialDraft);
  const [restored, setRestored] = useState(!!initialDraft);
  const [pristine, setPristine] = useState<string>();
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<EditConflict>();
  const [saving, setSaving] = useState(false);
  const messageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft) return;
    if (isNew) {
      const markdown = `# ${titleFromPath(path)}\n\n`;
      setPristine(markdown);
      setDraft({ markdown, message: `Create ${path}` });
    } else if (page.data) {
      setPristine(page.data.source ?? '');
      setDraft({ markdown: page.data.source ?? '', message: '', base: page.data.version });
    }
  }, [draft, isNew, page.data, path]);

  // Only real edits are kept as a draft; opening the editor alone must not pin stale content.
  useEffect(() => {
    if (draft && (restored || draft.markdown !== pristine)) saveDraft(spaceId, path, draft);
  }, [draft, pristine, restored, spaceId, path]);

  const preview = usePreview(spaceId, path, draft?.markdown ?? '');

  if (!isNew && page.isPending && !draft) return <p className="status">Loading editor…</p>;
  if (!isNew && page.isError && !draft) return <p className="status error">{page.error.message}</p>;
  if (!draft) return null;

  const current = draft;

  async function save(event?: FormEvent, override?: Partial<Draft>) {
    event?.preventDefault();
    const toSave = { ...current, ...override };
    if (!toSave.message.trim()) {
      setError('Describe your change before saving.');
      messageInput.current?.focus();
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const result = await api<Schemas['SaveResult']>(pageApi(spaceId, path), {
        method: 'PUT',
        json: { base: isNew && !toSave.base ? undefined : toSave.base, markdown: toSave.markdown, message: toSave.message },
      });
      clearDraft(spaceId, path);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['page', spaceId, path] }),
        queryClient.invalidateQueries({ queryKey: ['tree', spaceId] }),
        queryClient.invalidateQueries({ queryKey: ['history', spaceId, path] }),
        queryClient.removeQueries({ queryKey: ['page-source', spaceId, path] }),
      ]);
      if (result.merged) notice('Saved. Your change was combined with changes made by someone else.');
      else notice('Saved.');
      navigate(spaceRoute(spaceId, path));
    } catch (e) {
      if (e instanceof ApiError && e.type === 'edit-conflict') {
        setConflict(e.problem as unknown as EditConflict);
      } else if (isUnauthenticated(e)) {
        saveDraft(spaceId, path, toSave);
        const returnUrl = encodeURIComponent(window.location.pathname);
        window.location.assign(`/signin?returnUrl=${returnUrl}`);
      } else if (e instanceof ApiError && e.type === 'reauthentication-required') {
        saveDraft(spaceId, path, toSave);
        window.location.assign(`/auth/challenge?returnUrl=${encodeURIComponent(window.location.pathname)}`);
      } else if (e instanceof ApiError) {
        setError([e.problem.title, e.problem.detail].filter(Boolean).join(' '));
      } else {
        setError('The page could not be saved. Your text is kept; try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (conflict) {
    return (
      <ConflictView
        conflict={conflict}
        mine={current.markdown}
        saving={saving}
        onResolve={(resolved) => {
          const next = { ...current, markdown: resolved, base: conflict.theirsVersion };
          setDraft(next);
          setConflict(undefined);
          void save(undefined, next);
        }}
        onAbandon={() => {
          setConflict(undefined);
          setDraft({ ...current, base: conflict.theirsVersion, markdown: conflict.theirsSource });
        }}
      />
    );
  }

  return (
    <form className="page-edit" onSubmit={save}>
      <h1>{isNew ? `New page: ${path}` : `Editing ${page.data?.title ?? path}`}</h1>
      {restored && (
        <div role="status" className="banner info">
          Your unsaved changes from earlier were restored.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              clearDraft(spaceId, path);
              setRestored(false);
              setDraft(undefined);
              void page.refetch();
            }}
          >
            Discard them and start from the current version
          </button>
        </div>
      )}
      <div className="editor-layout">
        <MarkdownEditor label="Page content (Markdown)" value={current.markdown} onChange={(markdown) => setDraft({ ...current, markdown })} />
        <section className="preview-pane" aria-label="Preview">
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: preview.data?.html ?? '' }} />
        </section>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="editor-footer">
        <label className="visually-hidden" htmlFor="change-message">
          Change description
        </label>
        <input
          id="change-message"
          ref={messageInput}
          placeholder="Describe your change"
          maxLength={500}
          value={current.message}
          onChange={(e) => setDraft({ ...current, message: e.target.value })}
        />
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            clearDraft(spaceId, path);
            navigate(isNew ? `/s/${spaceId}/` : spaceRoute(spaceId, path));
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function titleFromPath(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}
