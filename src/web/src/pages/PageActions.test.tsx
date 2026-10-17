// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { canonicalUrl, copyText } from './PageActions';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('canonicalUrl', () => {
  it('links the current page by path and an older version by commit', () => {
    const commit = 'b'.repeat(40);
    expect(canonicalUrl('handbook', 'guides/setup.md', commit, true)).toBe(`${location.origin}/s/handbook/guides/setup.md`);
    expect(canonicalUrl('handbook', 'guides/setup.md', commit, false)).toBe(`${location.origin}/s/handbook/-/version/${commit}/guides/setup.md`);
  });
});

describe('copyText', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyText('x')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('x');
  });

  it('reports failure when the clipboard is missing or refuses', async () => {
    vi.stubGlobal('navigator', {});
    expect(await copyText('x')).toBe(false);

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    expect(await copyText('x')).toBe(false);
  });
});
