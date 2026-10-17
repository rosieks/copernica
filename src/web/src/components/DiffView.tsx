import { useEffect, useRef } from 'react';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { WIDE, useMediaQuery } from '../layout/useMediaQuery';
import { tokenTheme } from './codemirrorTheme';
import './MarkdownEditor.css';

/**
 * Read-only difference of two versions: side by side on wide screens, unified below 1200px
 * so narrow screens never scroll horizontally (FR-009).
 */
export function DiffView({ from, to, label }: { from: string; to: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery(WIDE);

  useEffect(() => {
    const readOnly = [
      basicSetup,
      markdown(),
      tokenTheme(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    if (wide) {
      const merge = new MergeView({
        parent: host.current!,
        a: { doc: from, extensions: [...readOnly, EditorView.contentAttributes.of({ 'aria-label': `${label}: earlier version` })] },
        b: { doc: to, extensions: [...readOnly, EditorView.contentAttributes.of({ 'aria-label': `${label}: later version` })] },
        collapseUnchanged: { margin: 3, minSize: 6 },
      });
      return () => merge.destroy();
    }
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: to,
        extensions: [...readOnly, EditorView.contentAttributes.of({ 'aria-label': label }), unifiedMergeView({ original: from, mergeControls: false })],
      }),
    });
    return () => view.destroy();
  }, [from, to, label, wide]);

  return <div ref={host} className="diff-view" />;
}
