import { useState } from 'react';
import { DiffView } from '../components/DiffView';
import { MarkdownEditor } from '../components/MarkdownEditor';

export interface EditConflict {
  title?: string;
  baseSource: string;
  theirsSource: string;
  theirsVersion: { commitId: string; blobId?: string | null };
  theirsAuthors: string[];
  mineSource: string;
}

interface Props {
  conflict: EditConflict;
  mine: string;
  saving: boolean;
  onResolve: (resolved: string) => void;
  onAbandon: () => void;
}

/**
 * Shows how the user's version differs from the current one (read-only diff) and lets them
 * edit the resolution, which is saved against the current version (FR-016/017).
 */
export function ConflictView({ conflict, mine, saving, onResolve, onAbandon }: Props) {
  const [resolution, setResolution] = useState(mine);
  const [abandoned, setAbandoned] = useState(false);

  const who = conflict.theirsAuthors.length > 0 ? conflict.theirsAuthors.join(', ') : 'someone else';

  if (abandoned) {
    return (
      <section className="conflict">
        <h1>Your unsaved text</h1>
        <p>Your changes were not saved. Copy anything you want to keep before leaving this page.</p>
        <textarea readOnly value={mine} rows={20} className="abandoned-text" aria-label="Your unsaved text" />
        <div className="dialog-actions">
          <button type="button" onClick={onAbandon}>
            Start over from the current version
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="conflict" aria-labelledby="conflict-title">
      <h1 id="conflict-title">This page was changed while you were editing</h1>
      <p role="alert">
        {who} changed the same part of the page. Below you can see how your version differs from the current one.
        Edit the resolution so it contains what the page should say, then save.
      </p>
      <h2>Differences: current version → your version</h2>
      <DiffView from={conflict.theirsSource} to={mine} label="Differences between the current version and yours" />
      <h2>Resolution</h2>
      <MarkdownEditor label="Resolved page content" value={resolution} onChange={setResolution} />
      <div className="dialog-actions">
        <button type="button" onClick={() => setResolution(conflict.theirsSource)} disabled={saving}>
          Start from the current version
        </button>
        <button type="button" onClick={() => setAbandoned(true)} disabled={saving}>
          Discard my changes
        </button>
        <button type="button" className="primary" disabled={saving} onClick={() => onResolve(resolution)}>
          {saving ? 'Saving…' : 'Save resolved version'}
        </button>
      </div>
    </section>
  );
}
