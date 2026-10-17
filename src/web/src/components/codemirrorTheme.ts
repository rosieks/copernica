import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { cspNonce } from '../theme';

/**
 * Editor and diff colours from the design tokens (FR-026). Everything references CSS
 * variables, so a theme switch (html.dark) re-colours the editor without reconfiguring it.
 */
const theme = EditorView.theme({
  '&': {
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-bg)',
    fontSize: 'var(--text-sm)',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    caretColor: 'var(--color-text)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-text)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--color-accent-subtle)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--color-bg-subtle)' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-bg-subtle)',
    color: 'var(--color-text-muted)',
    borderRight: '1px solid var(--color-border-subtle)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--color-bg-element)' },
  '.cm-searchMatch': { backgroundColor: 'var(--color-highlight)' },
  '.cm-panels': { backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border-subtle)',
  },
  // @codemirror/merge
  '.cm-changedLine': { backgroundColor: 'var(--color-success-subtle)' },
  '.cm-deletedChunk': { backgroundColor: 'var(--color-danger-subtle)' },
  '.cm-insertedLine, .cm-changedText': { backgroundColor: 'var(--color-success-subtle)' },
  '.cm-deletedLine, .cm-deletedText': { backgroundColor: 'var(--color-danger-subtle)' },
  '&.cm-merge-a .cm-changedLine, .cm-merge-a .cm-changedText': { backgroundColor: 'var(--color-danger-subtle)' },
  '&.cm-merge-b .cm-changedLine, .cm-merge-b .cm-changedText': { backgroundColor: 'var(--color-success-subtle)' },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold', color: 'var(--color-accent-text)' },
  { tag: [tags.link, tags.url], color: 'var(--color-accent-text)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: [tags.monospace, tags.quote, tags.comment, tags.meta, tags.processingInstruction], color: 'var(--color-text-muted)' },
]);

/**
 * CodeMirror injects its styles in a <style> element; under the strict CSP that element
 * needs the page's style nonce, otherwise the editor renders unstyled.
 */
export function tokenTheme() {
  return [EditorView.cspNonce.of(cspNonce()), theme, syntaxHighlighting(highlight)];
}
