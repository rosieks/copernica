/** Unsaved editor text, kept per page in sessionStorage so errors or a re-sign-in never lose it. */
function key(spaceId: string, path: string): string {
  return `copernica:draft:${spaceId}:${path}`;
}

export interface Draft {
  markdown: string;
  message: string;
  base?: { commitId: string; blobId?: string | null };
}

export function loadDraft(spaceId: string, path: string): Draft | undefined {
  try {
    const raw = sessionStorage.getItem(key(spaceId, path));
    return raw ? (JSON.parse(raw) as Draft) : undefined;
  } catch {
    return undefined;
  }
}

export function saveDraft(spaceId: string, path: string, draft: Draft): void {
  try {
    sessionStorage.setItem(key(spaceId, path), JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode, quota): the text is still in memory.
  }
}

export function clearDraft(spaceId: string, path: string): void {
  try {
    sessionStorage.removeItem(key(spaceId, path));
  } catch {
    // Ignore.
  }
}
