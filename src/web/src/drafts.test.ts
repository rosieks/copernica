import { afterEach, describe, expect, it } from 'vitest';
import { loadDraft, moveDraft, saveDraft } from './drafts';

describe('moveDraft', () => {
  afterEach(() => sessionStorage.clear());

  it('moves the draft to the new path', () => {
    saveDraft('wiki', 'guides/setup.md', { markdown: '# Mine', message: 'Edit' });

    moveDraft('wiki', 'guides/setup.md', 'howto/install.md');

    expect(loadDraft('wiki', 'guides/setup.md')).toBeUndefined();
    expect(loadDraft('wiki', 'howto/install.md')).toEqual({ markdown: '# Mine', message: 'Edit' });
  });

  it('does nothing without a draft or when the path is the same', () => {
    moveDraft('wiki', 'a.md', 'b.md');
    expect(loadDraft('wiki', 'b.md')).toBeUndefined();

    saveDraft('wiki', 'a.md', { markdown: 'x', message: 'm' });
    moveDraft('wiki', 'a.md', 'a.md');
    expect(loadDraft('wiki', 'a.md')).toEqual({ markdown: 'x', message: 'm' });
  });
});
