// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Toolbar, TooltipProvider, ToastProvider } from '../ui';
import { canonicalUrl, copyText, PageActions } from './PageActions';

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

describe('PageActions menu (005 FR-003)', () => {
  async function openMenu(props: { onRename?: () => void; onMove?: () => void }) {
    render(
      <ToastProvider>
        <TooltipProvider>
          <Toolbar.Root label="Page actions">
            <PageActions spaceId="wiki" path="guides/setup.md" commitId={'a'.repeat(40)} isCurrent canDelete onDelete={() => {}} triggerRef={createRef()} {...props} />
          </Toolbar.Root>
        </TooltipProvider>
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: 'More page actions' }), { key: 'Enter' });
    });
    await screen.findByRole('menu');
  }

  it('offers Rename and Move when the page can be managed', async () => {
    const onRename = vi.fn();
    await openMenu({ onRename, onMove: vi.fn() });

    expect(screen.getByRole('menuitem', { name: 'Move…' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
    });
    expect(onRename).toHaveBeenCalledOnce();
  });

  it('leaves them out otherwise', async () => {
    await openMenu({});

    expect(screen.queryByRole('menuitem', { name: 'Rename…' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Move…' })).toBeNull();
  });
});
