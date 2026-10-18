import { useEffect, useRef, type MutableRefObject } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { imageInput } from '../editor/imageInput';
import { placeholderField } from '../editor/placeholders';
import { tokenTheme } from './codemirrorTheme';
import './MarkdownEditor.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Called with pasted or dropped files and the position to insert them (003). */
  onFiles?: (files: File[], pos: number) => void;
  /** Receives the editor view, e.g. to insert image references. */
  editorRef?: MutableRefObject<EditorView | null>;
}

/** CodeMirror 6 Markdown editor (no eval-based extensions, works under the strict CSP). */
export function MarkdownEditor({ value, onChange, label, onFiles, editorRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          tokenTheme(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          placeholderField,
          imageInput((files, pos) => onFilesRef.current?.(files, pos)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    if (editorRef) editorRef.current = editor;
    return () => {
      if (editorRef?.current === editor) editorRef.current = null;
      editor.destroy();
    };
    // The editor owns its document after creation; external resets go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="editor-pane" data-testid="markdown-editor" />;
}
