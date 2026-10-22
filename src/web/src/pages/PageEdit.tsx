import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useDiagrams } from '../diagrams/useDiagrams';
import type { EditorView } from '@codemirror/view';
import { ImageIcon } from '@radix-ui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ApiError, isUnauthenticated, type Schemas } from '../api/client';
import { useMe } from '../App';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { clearDraft, loadDraft, saveDraft, type Draft, type DraftAttachment } from '../drafts';
import { loadEditorMode, storeEditorMode, type EditorMode } from '../editor/editorMode';
import { codeMirrorTarget, type ImageTarget } from '../editor/imageTarget';
import { DEFAULT_LIMITS, formatMegabytes } from '../editor/uploads';
import type { VisualEditorHandle } from '../visual/VisualEditor';
import { useImageUploads } from '../editor/useImageUploads';
import { joinNames, shortCommit } from '../format';
import { useDocumentTitle } from '../layout/RouteAnnouncer';
import { WIDE, useMediaQuery } from '../layout/useMediaQuery';
import { pageApi, spaceRoute } from '../routes';
import { copyText } from './PageActions';
import { useShortcut } from '../shortcuts';
import { AlertDialog, Button, Callout, Dialog, Field, Tabs, ToggleGroup, useToast } from '../ui';
import { ConflictView, type EditConflict } from './ConflictView';
import { ImageDescriptionDialog } from './ImageDescriptionDialog';
import { ReviewChangesDialog } from './ReviewChangesDialog';
import { StateIndicators } from './StateIndicators';
import './PageEdit.css';

interface Props {
  space: Schemas['Space'];
  path: string;
  /** True when creating a new page at `path`. */
  isNew?: boolean;
}

type EditorTab = 'write' | 'preview' | 'split';

/** The visual editor (007) loads on demand, so ProseMirror stays out of the reading path. */
const VisualEditor = lazy(() => import('../visual/VisualEditor'));

const GUARD_MESSAGE = "This page uses Markdown the visual editor can't edit safely, so it opened in Markdown mode.";

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

function usePreview(spaceId: string, path: string, markdown: string, enabled: boolean, attachments: string[]) {
  const [debounced, setDebounced] = useState(markdown);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(markdown), 300);
    return () => clearTimeout(timer);
  }, [markdown]);

  return useQuery({
    queryKey: ['preview', spaceId, path, debounced, attachments],
    enabled,
    // Pending images of this edit are shown from their uploads (003 R5).
    queryFn: () => api<{ html: string }>('/api/render', { method: 'POST', json: { spaceId, path, markdown: debounced, attachments } }),
    placeholderData: (previous) => previous,
  });
}

/**
 * The server-rendered, sanitized preview. Diagrams are drawn as on the page (004 US2); unchanged
 * ones come from the renderer cache, and no status is announced on every keystroke.
 */
function PreviewPane({ as: Element, html }: { as: 'div' | 'section'; html: string }) {
  const pane = useRef<HTMLElement>(null);
  useDiagrams(pane, html);
  return <Element ref={pane as RefObject<HTMLDivElement>} className="preview-pane prose" aria-label="Preview" dangerouslySetInnerHTML={{ __html: html }} />;
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
  /** The page was deleted by someone else while editing (005 research R6). */
  const [deletedMeanwhile, setDeletedMeanwhile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [signInAgain, setSignInAgain] = useState<'local' | 'challenge'>();
  const [reviewing, setReviewing] = useState(false);
  /** Polite status for the live region (007: "No changes to save", mode switches). */
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<EditorTab>(() => loadTab(wide));
  const [mode, setMode] = useState<EditorMode>(loadEditorMode);
  /** The load-time guard rejected this page; it is edited in Markdown mode (FR-019). */
  const [guardFailed, setGuardFailed] = useState(false);
  const messageInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const visualRef = useRef<VisualEditorHandle | null>(null);
  /** Cursor offset to restore in the editor that is about to appear (mode switch). */
  const pendingCursor = useRef<number | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  /** The editor in use, for callbacks created once (focus return, image target). */
  const modeRef = useRef<EditorMode>('markdown');
  // Focus target after describing an image: the editor's content element.
  const editorContent = useMemo(
    () => ({
      get current() {
        return modeRef.current === 'visual' ? (visualRef.current?.view.dom ?? null) : (editorRef.current?.contentDOM ?? null);
      },
    }),
    [],
  );
  // Images go into whichever editor is shown (003 in both modes, 007 FR-020).
  const imageTarget = useMemo(
    () => ({
      get current(): ImageTarget | null {
        if (modeRef.current === 'visual') return visualRef.current?.imageTarget ?? null;
        return editorRef.current ? codeMirrorTarget(editorRef.current) : null;
      },
      set current(_value: ImageTarget | null) {
        // Read-only view of the current editor.
      },
    }),
    [],
  );
  const me = useMe();
  const limits = me.data?.uploads?.maxBytes ? { maxBytes: me.data.uploads.maxBytes, formats: me.data.uploads.formats ?? DEFAULT_LIMITS.formats } : DEFAULT_LIMITS;
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

  // A status such as "No changes to save" no longer applies once the text changes.
  useEffect(() => setStatus((s) => (s === 'No changes to save' ? '' : s)), [draft?.markdown]);

  const shownMode: EditorMode = guardFailed ? 'markdown' : mode;
  modeRef.current = shownMode;

  // After a mode switch, put the cursor where it was (contracts/fidelity.md M2).
  useEffect(() => {
    const offset = pendingCursor.current;
    if (offset === null) return;
    let frames = 0;
    const apply = () => {
      if (shownMode === 'visual') {
        if (!visualRef.current && frames++ < 60) return void requestAnimationFrame(apply);
        visualRef.current?.setCursorOffset(offset);
        visualRef.current?.focus();
      } else {
        const cm = editorRef.current;
        if (!cm && frames++ < 60) return void requestAnimationFrame(apply);
        if (cm) {
          const anchor = Math.min(offset, cm.state.doc.length);
          cm.dispatch({ selection: { anchor }, scrollIntoView: true });
          cm.focus();
        }
      }
      pendingCursor.current = null;
    };
    requestAnimationFrame(apply);
  }, [shownMode]);

  const attachmentIds = useMemo(() => (draft?.attachments ?? []).map((a) => a.id), [draft?.attachments]);
  const preview = usePreview(spaceId, path, draft?.markdown ?? '', shownMode === 'markdown' && shownTab !== 'write', attachmentIds);
  const setMarkdown = useCallback((markdown: string) => setDraft((d) => (d ? { ...d, markdown } : d)), []);
  const images = useImageUploads({
    spaceId,
    path,
    limits,
    target: imageTarget,
    onAttachment: useCallback(
      (attachment: DraftAttachment) => setDraft((d) => (d ? { ...d, attachments: [...(d.attachments ?? []), attachment] } : d)),
      [],
    ),
    onAppend: useCallback((markdown: string) => setDraft((d) => (d ? { ...d, markdown: `${d.markdown.trimEnd()}\n\n${markdown}\n` } : d)), []),
  });

  // Toolbar, "/" menu and Ctrl/⌘+K actions of the visual editor that open page-level UI.
  const visualActions = useMemo(
    () => ({
      onImage: () => filePicker.current?.click(),
    }),
    [],
  );

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
  /** The text as it is now; the visual editor writes its changes back on a short delay. */
  const latestMarkdown = () => (shownMode === 'visual' ? (visualRef.current?.flush() ?? current.markdown) : current.markdown);
  const changed = current.markdown !== pristine;

  function switchMode(next: EditorMode) {
    if (next === shownMode) return;
    let offset = 0;
    if (shownMode === 'visual') offset = visualRef.current?.getCursorOffset() ?? 0;
    else offset = editorRef.current?.state.selection.main.head ?? 0;
    pendingCursor.current = offset;
    storeEditorMode(next);
    setGuardFailed(false);
    setMode(next);
    setStatus(next === 'visual' ? 'Visual mode' : 'Markdown mode');
  }
  const leave = () => {
    clearDraft(spaceId, path);
    navigate(isNew ? `/s/${spaceId}/` : spaceRoute(spaceId, path));
  };

  async function save(event?: FormEvent, override?: Partial<Draft>) {
    event?.preventDefault();
    if (saving) return;
    const toSave = { ...current, markdown: latestMarkdown(), ...override };
    // 007 FR-012: a file identical to the one the edit started from is not saved at all.
    if (!override && !isNew && toSave.markdown === pristine) {
      setMessageError(undefined);
      setStatus('');
      requestAnimationFrame(() => setStatus('No changes to save'));
      return;
    }
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
        json: {
          base: isNew && !toSave.base ? undefined : toSave.base,
          markdown: toSave.markdown,
          message: toSave.message,
          attachments: (toSave.attachments ?? []).map((a) => a.id),
        },
      });
      clearDraft(spaceId, path);
      // The page may have been moved meanwhile; the save then landed at its new path (005 R6).
      const savedPath = result.path ?? path;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['page', spaceId, path] }),
        queryClient.invalidateQueries({ queryKey: ['page', spaceId, savedPath] }),
        queryClient.invalidateQueries({ queryKey: ['tree', spaceId] }),
        queryClient.invalidateQueries({ queryKey: ['history', spaceId, path] }),
        queryClient.invalidateQueries({ queryKey: ['history', spaceId, savedPath] }),
        queryClient.removeQueries({ queryKey: ['page-source', spaceId, path] }),
      ]);
      const authors = result.mergedAuthors ?? [];
      if (savedPath !== path) {
        notify({ tone: 'info', title: `Saved. The page had been moved to “${savedPath}”.` });
        navigate(spaceRoute(spaceId, savedPath), { replace: true });
        return;
      }
      if (result.merged && authors.length > 0) {
        notify({ tone: 'info', title: `Saved — merged with changes by ${joinNames(authors)}` });
      } else {
        notify({ tone: 'success', title: 'Saved', description: `Version ${shortCommit(result.version.commitId)}` });
      }
      navigate(spaceRoute(spaceId, path));
    } catch (e) {
      if (e instanceof ApiError && e.type === 'edit-conflict') {
        setConflict(e.problem as unknown as EditConflict);
      } else if (e instanceof ApiError && e.type === 'page-deleted') {
        saveDraft(spaceId, path, toSave);
        setDeletedMeanwhile(true);
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
      <div className="page-edit__modebar">
        <ToggleGroup<EditorMode>
          label="Editor mode"
          value={shownMode}
          onValueChange={switchMode}
          items={[
            { value: 'visual', label: 'Visual' },
            { value: 'markdown', label: 'Markdown' },
          ]}
        />
        <Button
          size="sm"
          onClick={() => {
            latestMarkdown();
            setReviewing(true);
          }}
        >
          Review changes
        </Button>
      </div>
      {guardFailed && <Callout tone="info" title={GUARD_MESSAGE} />}
      <input
        ref={filePicker}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) images.onFiles(files);
        }}
      />
      {shownMode === 'visual' ? (
        <Suspense
          fallback={
            <p className="status" role="status">
              Loading editor…
            </p>
          }
        >
          <VisualEditor
            value={current.markdown}
            onChange={setMarkdown}
            label="Page content"
            spaceId={spaceId}
            pagePath={path}
            pending={current.attachments ?? []}
            editorRef={visualRef}
            onAnnounce={(text) => {
              setStatus('');
              requestAnimationFrame(() => setStatus(text));
            }}
            onGuardFailure={() => setGuardFailed(true)}
            onFiles={images.onFiles}
            actions={visualActions}
          />
        </Suspense>
      ) : (
        <>
      {shownTab !== 'preview' && (
        <div className="page-edit__toolbar">
          <Button
            size="sm"
            icon={<ImageIcon />}
            onClick={() => filePicker.current?.click()}
          >
            Insert image
          </Button>
          <span className="muted">or paste / drop images · up to {formatMegabytes(limits.maxBytes)}</span>
        </div>
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
          <MarkdownEditor
              label="Page content (Markdown)"
              value={current.markdown}
              onChange={setMarkdown}
              onFiles={images.onFiles}
              editorRef={editorRef}
            />
        </Tabs.Panel>
        <Tabs.Panel value="preview">
          <PreviewPane as="div" html={preview.data?.html ?? ''} />
        </Tabs.Panel>
        {wide && (
          <Tabs.Panel value="split" className="page-edit__split">
            <MarkdownEditor
              label="Page content (Markdown)"
              value={current.markdown}
              onChange={setMarkdown}
              onFiles={images.onFiles}
              editorRef={editorRef}
            />
            <PreviewPane as="section" html={preview.data?.html ?? ''} />
          </Tabs.Panel>
        )}
      </Tabs.Root>
        </>
      )}
      {images.uploads.map((u) => (
        <div key={u.key} className="page-edit__upload">
          <span>
            Uploading {u.name} — {Math.round(u.progress * 100)} %
          </span>
          <progress
            max={100}
            value={Math.round(u.progress * 100)}
            aria-label={`Uploading ${u.name}`}
          />
        </div>
      ))}
      {images.rejections.map((r) => (
        <Callout key={r.key} tone="danger" title={`${r.name} was not added`} onDismiss={() => images.dismissRejection(r.key)}>
          {r.reason.charAt(0).toUpperCase() + r.reason.slice(1)}.
        </Callout>
      ))}
      <div className="visually-hidden" role="status" aria-live="polite">
        {[images.announcement, status].filter(Boolean).join(' ')}
      </div>
      {status === 'No changes to save' && (
        <p className="muted page-edit__status" aria-hidden="true">
          No changes to save
        </p>
      )}
      {error && (
        <Callout tone="danger" title="Your change was not saved." onDismiss={() => setError(undefined)}>
          {error}
        </Callout>
      )}
      {deletedMeanwhile && (
        <Callout
          tone="danger"
          title="The page was deleted by someone else. Your text was not saved."
          actions={
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  // Keep the text as the draft of a new page at the same path.
                  clearDraft(spaceId, path);
                  saveDraft(spaceId, path, { markdown: current.markdown, message: `Create ${path}`, attachments: current.attachments });
                  navigate(`/s/${spaceId}/-/new/${path.split('/').map(encodeURIComponent).join('/')}`);
                }}
              >
                Save as a new page
              </Button>
              <Button
                size="sm"
                onClick={async () => notify(await copyText(current.markdown) ? { tone: 'success', title: 'Text copied' } : { tone: 'danger', title: 'The text could not be copied.' })}
              >
                Copy text
              </Button>
            </>
          }
        />
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
      <ReviewChangesDialog open={reviewing} onOpenChange={setReviewing} from={isNew ? '' : (pristine ?? '')} to={current.markdown} />
      <AlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard your changes?"
        description={
          current.attachments?.length
            ? 'Your edits to this page will be lost. Images added in this edit will be discarded.'
            : 'Your edits to this page will be lost.'
        }
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={leave}
      />
      <ImageDescriptionDialog
        request={images.describing}
        position={images.describePosition}
        onDone={images.describe}
        returnFocusTo={editorContent}
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
