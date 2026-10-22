/** Browser-only interface preference (007 data-model.md → Interface preference, FR-017). */
export const EDITOR_MODE_KEY = 'copernica.editorMode';

export type EditorMode = 'visual' | 'markdown';

/** Absent, unknown or unreadable values mean the default, visual mode. */
export function loadEditorMode(): EditorMode {
  try {
    return localStorage.getItem(EDITOR_MODE_KEY) === 'markdown' ? 'markdown' : 'visual';
  } catch {
    return 'visual';
  }
}

/** Written only when the user switches mode, never by the load-time fallback (FR-019). */
export function storeEditorMode(mode: EditorMode): void {
  try {
    localStorage.setItem(EDITOR_MODE_KEY, mode);
  } catch {
    // Preference only.
  }
}
