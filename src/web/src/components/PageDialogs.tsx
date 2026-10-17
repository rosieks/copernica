import { useState, type FormEvent, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { pageApi } from '../routes';
import { AlertDialog, Button, Callout, Dialog, Field, useToast } from '../ui';

/** Asks for the path of a new page and opens the editor for it. */
export function NewPageDialog({
  spaceId,
  folder,
  open,
  onClose,
  returnFocusTo,
}: {
  spaceId: string;
  folder?: string;
  open: boolean;
  onClose: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
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
    setError(undefined);
    navigate(`/s/${spaceId}/-/new/${path.split('/').map(encodeURIComponent).join('/')}`);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} title="New page" returnFocusTo={returnFocusTo}>
      <form className="stack" onSubmit={submit} id="new-page-form">
        <Field
          label={folder ? `Page name (in ${folder}/)` : 'Page name'}
          hint="Use “/” to create the page in a folder."
          error={error}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. guides/onboarding"
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

/** Confirms deletion; the page stays available in history (FR-003). */
export function DeletePageDialog({
  spaceId,
  path,
  version,
  open,
  onClose,
  returnFocusTo,
}: {
  spaceId: string;
  path: string;
  version: { commitId: string; blobId?: string | null };
  open: boolean;
  onClose: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [message, setMessage] = useState(`Delete ${path}`);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!message.trim()) {
      setError('Describe your change.');
      throw new Error('missing description');
    }
    setBusy(true);
    setError(undefined);
    try {
      await api(pageApi(spaceId, path), { method: 'DELETE', json: { base: version, message } });
      await queryClient.invalidateQueries({ queryKey: ['tree', spaceId] });
      notify({ tone: 'success', title: 'Page deleted', description: 'It stays available in the repository history.' });
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
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`Delete ${path}?`}
      description="The page will be removed from the wiki. It stays available in the repository history."
      confirmLabel="Delete page"
      busy={busy}
      onConfirm={confirm}
      returnFocusTo={returnFocusTo}
    >
      <Field label="Change description" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} required />
      {error && <Callout tone="danger" title={error} />}
    </AlertDialog>
  );
}
