/** Unsaved editor text, kept per page in sessionStorage so errors or a re-sign-in never lose it. */
function key(spaceId: string, path: string): string {
  return `copernica:draft:${spaceId}:${path}`;
}

export interface Draft {
  markdown: string;
  message: string;
  base?: { commitId: string; blobId?: string | null };
  /** Pending images added in this edit (003); sent with the preview and the save. */
  attachments?: DraftAttachment[];
}

export interface DraftAttachment {
  id: string;
  repositoryPath: string;
  link: string;
  name: string;
  previewUrl: string;
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

/** Keeps an unsaved draft when its page moved (005 research R6): the draft follows to the new path. */
export function moveDraft(spaceId: string, oldPath: string, newPath: string): void {
  if (oldPath === newPath) return;
  const draft = loadDraft(spaceId, oldPath);
  if (!draft) return;
  saveDraft(spaceId, newPath, draft);
  clearDraft(spaceId, oldPath);
}
