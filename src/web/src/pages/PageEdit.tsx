import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ApiError, isUnauthenticated, type Schemas } from '../api/client';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../drafts';
import { joinNames, shortCommit } from '../format';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { WIDE, useMediaQuery } from '../layout/useMediaQuery';
import { pageApi, spaceRoute } from '../routes';
import { useShortcut } from '../shortcuts';
import { AlertDialog, Button, Callout, Dialog, Field, Tabs, useToast } from '../ui';
import { ConflictView, type EditConflict } from './ConflictView';
import { StateIndicators } from './StateIndicators';
import './PageEdit.css';

interface Props {
  space: Schemas['Space'];
  path: string;
  /** True when creating a new page at `path`. */
  isNew?: boolean;
}

type EditorTab = 'write' | 'preview' | 'split';

/** Browser-only preference (data-model.md → Interface preference). */
const TAB_KEY = 'copernica.editorTab';

function loadTab(wide: boolean): EditorTab {
  try {
    const value = localStorage.getItem(TAB_KEY);
    if (value === 'write' || value === 'preview') return value;
    if (value === 'split') return wide ? 'split' : 'write';
  } catch {
    // Storage unavailable: use the default.
  }
  return wide ? 'split' : 'write';
}

function storeTab(tab: EditorTab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // Preference only.
  }
}

function usePreview(spaceId: string, path: string, markdown: string, enabled: boolean) {
  const [debounced, setDebounced] = useState(markdown);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(markdown), 300);
    return () => clearTimeout(timer);
  }, [markdown]);

  return useQuery({
    queryKey: ['preview', spaceId, path, debounced],
    enabled,
    queryFn: () => api<{ html: string }>('/api/render', { method: 'POST', json: { spaceId, path, markdown: debounced } }),
    placeholderData: (previous) => previous,
  });
}

/** S4. Markdown editor with preview; save outcomes per contracts/ui.md (FR-006–FR-008). */
export function PageEdit({ space, path, isNew = false }: Props) {
  const spaceId = space.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const wide = useMediaQuery(WIDE);
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
  const [messageError, setMessageError] = useState<string>();
  const [conflict, setConflict] = useState<EditConflict>();
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [signInAgain, setSignInAgain] = useState<'local' | 'challenge'>();
  const [tab, setTab] = useState<EditorTab>(() => loadTab(wide));
  const messageInput = useRef<HTMLInputElement>(null);
  const shownTab: EditorTab = tab === 'split' && !wide ? 'write' : tab;
  useDocumentTitle(isNew ? `New page ${path}` : `Editing ${page.data?.title ?? path}`, space.displayName);

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

  const preview = usePreview(spaceId, path, draft?.markdown ?? '', shownTab !== 'write');

  useShortcut({
    key: 's',
    single: false,
    label: 'Ctrl/⌘ S',
    description: 'Save',
    group: 'Editor',
    enabled: !!draft && !conflict,
    handler: () => void save(),
  });

  if (!isNew && page.isPending && !draft) {
    return (
      <p className="status" role="status">
        Loading editor…
      </p>
    );
  }
  if (!isNew && page.isError && !draft) {
    return <Callout tone="danger" title="The page could not be loaded for editing.">{page.error.message}</Callout>;
  }
  if (!draft) return null;

  const current = draft;
  const changed = current.markdown !== pristine;
  const leave = () => {
    clearDraft(spaceId, path);
    navigate(isNew ? `/s/${spaceId}/` : spaceRoute(spaceId, path));
  };

  async function save(event?: FormEvent, override?: Partial<Draft>) {
    event?.preventDefault();
    if (saving) return;
    const toSave = { ...current, ...override };
    if (!toSave.message.trim()) {
      setMessageError('Describe your change.');
      messageInput.current?.focus();
      return;
    }

    setSaving(true);
    setError(undefined);
    setMessageError(undefined);
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
      const authors = result.mergedAuthors ?? [];
      if (result.merged && authors.length > 0) {
        notify({ tone: 'info', title: `Saved — merged with changes by ${joinNames(authors)}` });
      } else {
        notify({ tone: 'success', title: 'Saved', description: `Version ${shortCommit(result.version.commitId)}` });
      }
      navigate(spaceRoute(spaceId, path));
    } catch (e) {
      if (e instanceof ApiError && e.type === 'edit-conflict') {
        setConflict(e.problem as unknown as EditConflict);
      } else if (isUnauthenticated(e)) {
        saveDraft(spaceId, path, toSave);
        setSignInAgain('local');
      } else if (e instanceof ApiError && e.type === 'reauthentication-required') {
        saveDraft(spaceId, path, toSave);
        setSignInAgain('challenge');
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

  const returnUrl = encodeURIComponent(window.location.pathname);
  const signInUrl = signInAgain === 'challenge' ? `/auth/challenge?returnUrl=${returnUrl}` : `/signin?returnUrl=${returnUrl}`;

  return (
    <form className="page-edit" onSubmit={save}>
      <StateIndicators space={space} />
      <div>
        <h1 className="page-edit__title">{isNew ? 'New page' : `Editing “${page.data?.title ?? path}”`}</h1>
        <p className="mono muted page-edit__path">{path}</p>
      </div>
      {restored && (
        <Callout
          tone="info"
          title="Your unsaved changes from earlier were restored."
          actions={
            <Button
              size="sm"
              onClick={() => {
                clearDraft(spaceId, path);
                setRestored(false);
                setDraft(undefined);
                void page.refetch();
              }}
            >
              Discard draft
            </Button>
          }
        />
      )}
      <Tabs.Root
        label="Editor view"
        value={shownTab}
        onValueChange={(value) => {
          setTab(value as EditorTab);
          storeTab(value as EditorTab);
        }}
        activationMode="manual"
        tabs={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'Preview' },
          ...(wide ? [{ value: 'split', label: 'Split' }] : []),
        ]}
      >
        <Tabs.Panel value="write">
          <MarkdownEditor label="Page content (Markdown)" value={current.markdown} onChange={(markdown) => setDraft({ ...current, markdown })} />
        </Tabs.Panel>
        <Tabs.Panel value="preview">
          <div className="preview-pane prose" aria-label="Preview" dangerouslySetInnerHTML={{ __html: preview.data?.html ?? '' }} />
        </Tabs.Panel>
        {wide && (
          <Tabs.Panel value="split" className="page-edit__split">
            <MarkdownEditor label="Page content (Markdown)" value={current.markdown} onChange={(markdown) => setDraft({ ...current, markdown })} />
            <section className="preview-pane prose" aria-label="Preview" dangerouslySetInnerHTML={{ __html: preview.data?.html ?? '' }} />
          </Tabs.Panel>
        )}
      </Tabs.Root>
      {error && (
        <Callout tone="danger" title="Your change was not saved." onDismiss={() => setError(undefined)}>
          {error}
        </Callout>
      )}
      <div className="editor-footer">
        <Field
          ref={messageInput}
          className="editor-footer__message"
          label="Change description"
          id="change-message"
          placeholder="Describe your change"
          maxLength={500}
          aria-required="true"
          error={messageError}
          value={current.message}
          onChange={(e) => {
            setMessageError(undefined);
            setDraft({ ...current, message: e.target.value });
          }}
        />
        <div className="row editor-footer__actions">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={() => (changed ? setDiscarding(true) : leave())}>Cancel</Button>
        </div>
      </div>
      <AlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard your changes?"
        description="Your edits to this page will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={leave}
      />
      <Dialog
        open={!!signInAgain}
        onOpenChange={(open) => !open && setSignInAgain(undefined)}
        title="Sign in again to save"
        description="Your session has ended. Your text is kept in this browser; sign in again in a new tab, then save here."
        footer={
          <>
            <Button onClick={() => setSignInAgain(undefined)}>Close</Button>
            <Button asChild variant="primary">
              <a href={signInUrl} target="_blank" rel="noopener">
                Sign in
              </a>
            </Button>
          </>
        }
      />
    </form>
  );
}

function titleFromPath(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}
