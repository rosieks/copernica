import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { pageApi } from '../routes';

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

/** Asks for the path of a new page and opens the editor for it. */
export function NewPageDialog({ spaceId, folder, open, onClose }: { spaceId: string; folder?: string; open: boolean; onClose: () => void }) {
  const ref = useDialog(open);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const slug = name.trim().replace(/\s+/g, '-');
    const file = slug.toLowerCase().endsWith('.md') ? slug : `${slug}.md`;
    const path = folder ? `${folder}/${file}` : file;
    if (!slug || path.split('/').some((s) => s === '' || s === '.' || s === '..')) {
      setError('Enter a page name, optionally with folders separated by “/”.');
      return;
    }
    onClose();
    setName('');
    navigate(`/s/${spaceId}/-/new/${path.split('/').map(encodeURIComponent).join('/')}`);
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="new-page-title">
      <form onSubmit={submit} className="form">
        <h2 id="new-page-title">New page</h2>
        <label>
          Page name {folder ? `(in ${folder}/)` : ''}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. guides/onboarding" />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Create
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Confirms deletion; the page stays available in history. */
export function DeletePageDialog({
  spaceId,
  path,
  version,
  open,
  onClose,
}: {
  spaceId: string;
  path: string;
  version: { commitId: string; blobId?: string | null };
  open: boolean;
  onClose: () => void;
}) {
  const ref = useDialog(open);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState(`Delete ${path}`);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(pageApi(spaceId, path), { method: 'DELETE', json: { base: version, message } });
      await queryClient.invalidateQueries({ queryKey: ['tree', spaceId] });
      onClose();
      navigate(`/s/${spaceId}/`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.type === 'edit-conflict'
          ? 'The page was changed by someone else. Reload it before deleting.'
          : e instanceof ApiError
            ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ')
            : 'The page could not be deleted.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="delete-page-title">
      <form onSubmit={submit} className="form">
        <h2 id="delete-page-title">Delete {path}?</h2>
        <p>The page will be removed from the wiki. It stays available in the repository history.</p>
        <label>
          Change description
          <input value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} required />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Delete page
          </button>
        </div>
      </form>
    </dialog>
  );
}

