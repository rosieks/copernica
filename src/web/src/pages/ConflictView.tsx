import { useState } from 'react';
import { CopyIcon } from '@radix-ui/react-icons';
import { DiffView } from '../components/DiffView';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { joinNames } from '../format';
import { AlertDialog, Button, Callout, Tabs, useToast } from '../ui';
import { copyText } from './PageActions';

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
 * S6. Shows how the user's version differs from the current one and lets them edit the
 * resolution, which is saved against the current version (001 FR-016/017).
 */
export function ConflictView({ conflict, mine, saving, onResolve, onAbandon }: Props) {
  const [resolution, setResolution] = useState(mine);
  const [tab, setTab] = useState('resolve');
  const [confirmTheirs, setConfirmTheirs] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const { notify } = useToast();

  const who = conflict.theirsAuthors.length > 0 ? joinNames(conflict.theirsAuthors) : 'someone else';

  if (abandoned) {
    return (
      <section className="stack" aria-labelledby="unsaved-title">
        <h1 id="unsaved-title">Your unsaved text</h1>
        <Callout tone="warning" title="Your changes were not saved.">
          Copy anything you want to keep before leaving this page.
        </Callout>
        <textarea readOnly value={mine} rows={20} className="ui-field__control mono" aria-label="Your unsaved text" />
        <div className="row">
          <Button
            icon={<CopyIcon />}
            onClick={async () => {
              if (await copyText(mine)) notify({ tone: 'success', title: 'Copied to clipboard' });
              else notify({ tone: 'info', title: 'Select the text and press Ctrl+C (⌘C) to copy it.' });
            }}
          >
            Copy to clipboard
          </Button>
          <Button variant="primary" onClick={onAbandon}>
            Start over from the current version
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack" aria-labelledby="conflict-title">
      <h1 id="conflict-title">This page was changed while you were editing</h1>
      <Callout tone="danger" title={`${who} changed the same part of the page.`}>
        Your version was not saved. Edit the resolution so it contains what the page should say, then save.
      </Callout>
      <Tabs.Root
        label="Conflict"
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'resolve', label: 'Resolve' },
          { value: 'theirs', label: 'Their version' },
          { value: 'mine', label: 'Your version' },
        ]}
      >
        <Tabs.Panel value="resolve" className="stack">
          <h2 className="visually-hidden">Differences</h2>
          <DiffView from={conflict.theirsSource} to={mine} label="Differences between the current version and yours" />
          <h2>Resolution</h2>
          <MarkdownEditor label="Resolved page content" value={resolution} onChange={setResolution} />
        </Tabs.Panel>
        <Tabs.Panel value="theirs">
          <textarea readOnly value={conflict.theirsSource} rows={20} className="ui-field__control mono" aria-label="Their version" />
        </Tabs.Panel>
        <Tabs.Panel value="mine">
          <textarea readOnly value={mine} rows={20} className="ui-field__control mono" aria-label="Your version" />
        </Tabs.Panel>
      </Tabs.Root>
      <div className="editor-footer">
        <Button variant="primary" disabled={saving} onClick={() => onResolve(resolution)}>
          {saving ? 'Saving…' : 'Save resolution'}
        </Button>
        <Button disabled={saving} onClick={() => setConfirmTheirs(true)}>
          Use their version
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => setConfirmAbandon(true)}>
          Abandon edit…
        </Button>
      </div>
      <AlertDialog
        open={confirmTheirs}
        onOpenChange={setConfirmTheirs}
        title="Replace the resolution with their version?"
        description="Your edits in the resolution will be replaced. Your own version stays visible in the “Your version” tab."
        confirmLabel="Use their version"
        tone="default"
        onConfirm={() => {
          setResolution(conflict.theirsSource);
          setTab('resolve');
        }}
      />
      <AlertDialog
        open={confirmAbandon}
        onOpenChange={setConfirmAbandon}
        title="Abandon your edit?"
        description="Nothing will be saved. You can still copy your text on the next screen."
        confirmLabel="Abandon edit"
        onConfirm={() => setAbandoned(true)}
      />
    </section>
  );
}
