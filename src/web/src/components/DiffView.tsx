import { useEffect, useRef } from 'react';
import { unifiedMergeView } from '@codemirror/merge';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

/** Read-only unified diff of two versions of a page. */
export function DiffView({ from, to, label }: { from: string; to: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: to,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          unifiedMergeView({ original: from, mergeControls: false }),
        ],
      }),
    });
    return () => view.destroy();
  }, [from, to, label]);

  return <div ref={host} className="diff-view" />;
}
