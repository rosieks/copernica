import { useEffect, useMemo, useState, type FormEvent, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, encodePath, type Schemas } from '../api/client';
import {
  deleteFolder,
  invalidateAfterTreeChange,
  move,
  previewDeleteFolder,
  previewMove,
  type DeleteFolderResult,
  type MovePreview,
  type MoveResult,
} from '../api/treeApi';
import { AlertDialog, Button, Callout, Dialog, Field } from '../ui';
import './TreeDialogs.css';

type TreeNode = Schemas['TreeNode'];

// ----- Names (mirror of the server rules, 005 research R15) -----

const INVALID_NAME = /[<>:"|?*/\\]/;

/** Why a single file or folder name is not allowed, or undefined. */
export function nameError(name: string): string | undefined {
  if (!name.trim()) return 'Enter a name.';
  if (name !== name.trim()) return 'Names cannot start or end with a space.';
  if (name === '.' || name === '..') return 'This name is not allowed.';
  if (INVALID_NAME.test(name) || /[\u0000-\u001f\u007f]/.test(name)) return 'Names cannot contain / \\ < > : " | ? * or control characters.';
  if (name.toLowerCase() === '.order') return '“.order” is reserved for the page order.';
  if (new TextEncoder().encode(name).length > 255) return 'The name is too long.';
  return undefined;
}

/** File name for a page title: spaces become hyphens and `.md` is added (as in the new-page dialog). */
export function pageFileName(title: string): string {
  const slug = title.trim().replace(/\s+/g, '-');
  return slug.toLowerCase().endsWith('.md') ? slug : `${slug}.md`;
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function join(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

function describe(e: unknown, fallback: string): string {
  return e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : fallback;
}

/** Dry run of a move, debounced; undefined while loading or when the input is invalid. */
function useMovePreview(spaceId: string, base: string, node: TreeNode, to: string | undefined, open: boolean) {
  const [preview, setPreview] = useState<MovePreview>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setPreview(undefined);
    if (!open || !to || to === node.path) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      previewMove(spaceId, { base, kind: node.kind, from: node.path, to }, controller.signal)
        .then(setPreview)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setLoading(false);
    };
  }, [spaceId, base, node.kind, node.path, to, open]);
  return { preview, loading };
}

function Effects({ preview, loading, folder }: { preview?: MovePreview; loading: boolean; folder: boolean }) {
  if (loading) return <p className="muted" role="status">Checking links…</p>;
  if (!preview) return null;
  const parts: string[] = [];
  if (folder) {
    const others = preview.fileCount - preview.pageCount;
    parts.push(`Moves ${preview.pageCount} ${preview.pageCount === 1 ? 'page' : 'pages'}${others > 0 ? ` and ${others} other ${others === 1 ? 'file' : 'files'}` : ''}.`);
  }
  const linking = preview.linkingPages.length;
  if (linking > 0) parts.push(`${linking} other ${linking === 1 ? 'page links' : 'pages link'} here. Their links will be updated.`);
  return parts.length ? (
    <p className="muted" role="status">
      {parts.join(' ')}
    </p>
  ) : null;
}

interface MoveFormState {
  error?: string;
  fieldError?: string;
  busy: boolean;
}

/** Shared submit for Rename and Move: commit, refresh, report. */
function useMoveSubmit(spaceId: string, onDone: (result: MoveResult) => void) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<MoveFormState>({ busy: false });

  async function submit(request: Parameters<typeof move>[1]) {
    setState({ busy: true });
    try {
      const result = await move(spaceId, request);
      await invalidateAfterTreeChange(queryClient, spaceId);
      setState({ busy: false });
      onDone(result);
    } catch (e) {
      if (e instanceof ApiError && (e.type === 'target-exists' || e.type === 'validation' || e.type === 'invalid-move')) {
        setState({ busy: false, fieldError: describe(e, '') });
      } else if (e instanceof ApiError && e.type === 'tree-changed') {
        await queryClient.invalidateQueries({ queryKey: ['tree', spaceId] });
        setState({ busy: false, error: 'The tree changed since you opened it. It has been reloaded; check and try again.' });
      } else {
        setState({ busy: false, error: describe(e, 'The change could not be saved. Try again.') });
      }
    }
  }

  return { ...state, submit, reset: () => setState({ busy: false }) };
}

interface ItemDialogProps {
  spaceId: string;
  /** Commit the tree was loaded at. */
  base: string;
  node: TreeNode;
  open: boolean;
  onClose: () => void;
  onDone: (result: MoveResult) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

// ----- Rename (contracts/ui.md §2) -----

export function RenameDialog({ spaceId, base, node, open, onClose, onDone, returnFocusTo }: ItemDialogProps) {
  const isPage = node.kind === 'page';
  const currentTitle = node.title ?? node.name;
  const [title, setTitle] = useState(currentTitle);
  const [name, setName] = useState(node.name);
  const [nameEdited, setNameEdited] = useState(false);
  const [message, setMessage] = useState('');
  const [messageEdited, setMessageEdited] = useState(false);
  const form = useMoveSubmit(spaceId, onDone);

  useEffect(() => {
    if (!open) return;
    setTitle(currentTitle);
    setName(node.name);
    setNameEdited(false);
    setMessageEdited(false);
    form.reset();
  }, [open, node.path]);

  const fileName = isPage && !nameEdited ? (title.trim() === currentTitle ? node.name : pageFileName(title)) : name;
  const error = nameError(fileName) ?? (isPage && !fileName.toLowerCase().endsWith('.md') ? 'Page file names end in .md.' : undefined);
  const to = error ? undefined : join(parentOf(node.path), fileName);
  const autoMessage = `Rename ${node.path} to ${to ?? '…'}`;
  const shownMessage = messageEdited ? message : autoMessage;
  const { preview, loading } = useMovePreview(spaceId, base, node, to, open);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!to || to === node.path && title.trim() === currentTitle) return;
    if (!shownMessage.trim()) return;
    void form.submit({
      base,
      kind: node.kind,
      from: node.path,
      to,
      retitle: isPage && title.trim() !== currentTitle ? title.trim() : null,
      message: shownMessage.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} title={isPage ? 'Rename page' : 'Rename folder'} returnFocusTo={returnFocusTo}>
      <form className="stack" onSubmit={submit}>
        {isPage && (
          <Field label="Title" hint="The first heading of the page, shown in the tree." autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        )}
        <Field
          label={isPage ? 'File name' : 'Name'}
          hint={isPage ? 'Part of the page address.' : undefined}
          autoFocus={!isPage}
          value={fileName}
          error={form.fieldError ?? (fileName !== node.name ? error : undefined)}
          onChange={(e) => {
            setNameEdited(true);
            setName(e.target.value);
          }}
        />
        <Field
          label="Change description"
          value={shownMessage}
          maxLength={500}
          required
          onChange={(e) => {
            setMessageEdited(true);
            setMessage(e.target.value);
          }}
        />
        <Effects preview={preview} loading={loading} folder={!isPage} />
        {form.error && <Callout tone="danger" title={form.error} />}
        <div className="row row--end">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            aria-busy={form.busy}
            disabled={form.busy || !to || (to === node.path && title.trim() === currentTitle) || !shownMessage.trim()}
          >
            {form.busy ? 'Renaming…' : 'Rename'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ----- Move (contracts/ui.md §3) -----

/** Every folder of the tree, depth-first, for the destination list. */
export function allFolders(root: TreeNode): string[] {
  const result: string[] = [];
  const walk = (node: TreeNode) => {
    for (const child of node.children ?? []) {
      if (child.kind === 'folder') {
        result.push(child.path);
        walk(child);
      }
    }
  };
  walk(root);
  return result;
}

export function MoveDialog({
  spaceId,
  base,
  node,
  root,
  open,
  onClose,
  onDone,
  returnFocusTo,
  initialDestination,
}: ItemDialogProps & { root: TreeNode; initialDestination?: string }) {
  const isFolder = node.kind === 'folder';
  const currentFolder = parentOf(node.path);
  const [destination, setDestination] = useState(initialDestination ?? currentFolder);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState(node.name);
  const [message, setMessage] = useState('');
  const [messageEdited, setMessageEdited] = useState(false);
  const form = useMoveSubmit(spaceId, onDone);

  useEffect(() => {
    if (!open) return;
    setDestination(initialDestination ?? currentFolder);
    setFilter('');
    setName(node.name);
    setMessageEdited(false);
    form.reset();
  }, [open, node.path, initialDestination]);

  const folders = useMemo(() => ['', ...allFolders(root)], [root]);
  const shown = folders.filter((f) => (f || 'Space root').toLowerCase().includes(filter.trim().toLowerCase()));
  const invalidDestination = (folder: string) => isFolder && (folder === node.path || folder.startsWith(`${node.path}/`));
  const error = nameError(name) ?? (!isFolder && !name.toLowerCase().endsWith('.md') ? 'Page file names end in .md.' : undefined);
  const to = error || invalidDestination(destination) ? undefined : join(destination, name);
  const autoMessage = `Move ${node.path} to ${to ?? '…'}`;
  const shownMessage = messageEdited ? message : autoMessage;
  const { preview, loading } = useMovePreview(spaceId, base, node, to, open);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!to || to === node.path || !shownMessage.trim()) return;
    void form.submit({ base, kind: node.kind, from: node.path, to, message: shownMessage.trim() });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`Move “${node.title ?? node.name}”`}
      returnFocusTo={returnFocusTo}
      size="lg"
    >
      <form className="stack" onSubmit={submit}>
        <Field label="Find a folder" type="search" autoFocus={!initialDestination} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <fieldset className="move-dialog__folders">
          <legend>Destination</legend>
          <div className="move-dialog__list">
            {shown.map((folder) => {
              const disabled = invalidDestination(folder);
              const id = `move-dest-${folder || 'root'}`;
              return (
                <div key={folder || '/'} className={`move-dialog__option${disabled ? ' move-dialog__option--disabled' : ''}`}>
                  <input
                    type="radio"
                    id={id}
                    name="destination"
                    value={folder}
                    checked={destination === folder}
                    disabled={disabled}
                    aria-describedby={disabled ? `${id}-why` : undefined}
                    onChange={() => setDestination(folder)}
                  />
                  <label htmlFor={id}>
                    {folder || 'Space root'}
                    {folder === currentFolder && <span className="muted"> (current)</span>}
                  </label>
                  {disabled && (
                    <span id={`${id}-why`} className="muted move-dialog__why">
                      A folder cannot be moved into itself.
                    </span>
                  )}
                </div>
              );
            })}
            {shown.length === 0 && <p className="muted">No folder matches.</p>}
          </div>
        </fieldset>
        <Field label="Name" value={name} error={form.fieldError ?? (name !== node.name ? error : undefined)} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Change description"
          value={shownMessage}
          maxLength={500}
          required
          onChange={(e) => {
            setMessageEdited(true);
            setMessage(e.target.value);
          }}
        />
        <Effects preview={preview} loading={loading} folder={isFolder} />
        {form.error && <Callout tone="danger" title={form.error} />}
        <div className="row row--end">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            aria-busy={form.busy}
            autoFocus={!!initialDestination}
            disabled={form.busy || !to || to === node.path || !shownMessage.trim()}
          >
            {form.busy ? 'Moving…' : 'Move'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ----- New folder (contracts/ui.md §5) -----

export function NewFolderDialog({
  spaceId,
  parent,
  open,
  onClose,
  returnFocusTo,
}: {
  spaceId: string;
  parent: string;
  open: boolean;
  onClose: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const [folder, setFolder] = useState('');
  const [page, setPage] = useState('README');
  const [errors, setErrors] = useState<{ folder?: string; page?: string }>({});

  useEffect(() => {
    if (!open) return;
    setFolder('');
    setPage('README');
    setErrors({});
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const file = pageFileName(page);
    const next = { folder: nameError(folder.trim()), page: nameError(file) };
    if (!next.folder && folder.trim().toLowerCase().endsWith('.md')) next.folder = 'Folder names cannot end in .md.';
    setErrors(next);
    if (next.folder || next.page) return;
    onClose();
    navigate(`/s/${spaceId}/-/new/${encodePath(join(join(parent, folder.trim()), file))}`);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} title="New folder" returnFocusTo={returnFocusTo}>
      <form className="stack" onSubmit={submit}>
        <Field
          label={parent ? `Folder name (in ${parent}/)` : 'Folder name'}
          hint="The folder is created when its first page is saved."
          autoFocus
          value={folder}
          error={errors.folder}
          onChange={(e) => setFolder(e.target.value)}
        />
        <Field
          label="First page name"
          hint="A README page opens when the folder is clicked."
          value={page}
          error={errors.page}
          onChange={(e) => setPage(e.target.value)}
        />
        <div className="row row--end">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ----- Delete folder (contracts/ui.md §4) -----

export function DeleteFolderDialog({
  spaceId,
  base,
  node,
  open,
  onClose,
  onDone,
  returnFocusTo,
}: {
  spaceId: string;
  base: string;
  node: TreeNode;
  open: boolean;
  onClose: () => void;
  onDone: (result: DeleteFolderResult) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const queryClient = useQueryClient();
  const [counts, setCounts] = useState<{ pageCount: number; fileCount: number }>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string>();
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCounts(undefined);
    setMessage(`Delete ${node.path}`);
    setError(undefined);
    setChanged(false);
    previewDeleteFolder(spaceId, { base, folder: node.path })
      .then(setCounts)
      .catch((e) => setError(describe(e, 'The folder could not be checked.')));
  }, [open, spaceId, base, node.path]);

  async function confirm() {
    if (!counts) throw new Error('not ready');
    if (!message.trim()) {
      setError('Describe your change.');
      throw new Error('missing description');
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await deleteFolder(spaceId, { base, folder: node.path, expectedPageCount: counts.pageCount, message: message.trim() });
      await invalidateAfterTreeChange(queryClient, spaceId);
      onDone(result);
    } catch (e) {
      if (e instanceof ApiError && e.type === 'tree-changed' && typeof e.problem.pageCount === 'number') {
        // Someone changed the folder: show the real count and ask again (research R2).
        setCounts({ pageCount: e.problem.pageCount, fileCount: counts.fileCount - counts.pageCount + e.problem.pageCount });
        setChanged(true);
      } else {
        setError(describe(e, 'The folder could not be deleted.'));
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const others = counts ? counts.fileCount - counts.pageCount : 0;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`Delete folder “${node.name}”?`}
      description={
        counts
          ? `This removes ${counts.pageCount} ${counts.pageCount === 1 ? 'page' : 'pages'}${others > 0 ? ` and ${others} other ${others === 1 ? 'file' : 'files'}` : ''}. They stay available in the repository history.`
          : 'Counting the pages in this folder…'
      }
      confirmLabel="Delete folder"
      busy={busy || !counts}
      onConfirm={confirm}
      returnFocusTo={returnFocusTo}
    >
      <Field label="Change description" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} required />
      {changed && <Callout tone="warning" title="The folder changed since you opened this dialog. Check the new count and confirm again." />}
      {error && <Callout tone="danger" title={error} />}
    </AlertDialog>
  );
}
