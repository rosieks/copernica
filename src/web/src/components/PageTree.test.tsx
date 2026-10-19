// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Schemas } from '../api/client';
import { SINGLE_KEY_STORAGE_KEY } from '../shortcuts/preference';
import { PageTree } from './PageTree';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const root: Schemas['TreeNode'] = {
  name: '',
  path: '',
  kind: 'folder',
  children: [
    { name: 'guides', path: 'guides', kind: 'folder', children: [{ name: 'setup.md', path: 'guides/setup.md', title: 'Setup', kind: 'page' }] },
    { name: 'index.md', path: 'index.md', title: 'Home', kind: 'page' },
  ],
};

function renderTree(props: Partial<Parameters<typeof PageTree>[0]> = {}) {
  const onAction = vi.fn();
  render(
    <MemoryRouter>
      <PageTree spaceId="wiki" root={root} canWrite onAction={onAction} {...props} />
    </MemoryRouter>,
  );
  return onAction;
}

async function press(element: Element, key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    fireEvent.keyDown(element, { key, ...init });
  });
}

/** Closes the open menu; Radix returns focus on a timer, so let it run before the next key. */
async function closeMenu() {
  await press(screen.getByRole('menu'), 'Escape');
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('PageTree item actions (005 contracts/ui.md §1)', () => {
  it('opens the actions menu with Shift+F10, the ContextMenu key and right-click', async () => {
    renderTree();
    const home = screen.getByRole('treeitem', { name: /Home/ });

    await press(home, 'F10', { shiftKey: true });
    expect(await screen.findByRole('menu', { name: 'Actions for Home' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Rename…' })).toBeTruthy();
    await closeMenu();

    await press(home, 'ContextMenu');
    expect(await screen.findByRole('menu', { name: 'Actions for Home' })).toBeTruthy();
    await closeMenu();

    await act(async () => {
      fireEvent.contextMenu(screen.getByRole('treeitem', { name: /guides/ }));
    });
    expect(await screen.findByRole('menu', { name: 'Actions for guides' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'New folder…' })).toBeTruthy();
  });

  it('runs F2 as rename and Delete as delete on the focused item', async () => {
    const onAction = renderTree();
    const home = screen.getByRole('treeitem', { name: /Home/ });

    await press(home, 'F2');
    await press(home, 'Delete');

    expect(onAction.mock.calls.map(([action, node]) => [action, node.path])).toEqual([
      ['rename', 'index.md'],
      ['delete', 'index.md'],
    ]);
  });

  it('ignores F2 and Delete when single-key shortcuts are off or writing is disabled', async () => {
    localStorage.setItem(SINGLE_KEY_STORAGE_KEY, 'off');
    const onAction = renderTree();
    await press(screen.getByRole('treeitem', { name: /Home/ }), 'F2');
    expect(onAction).not.toHaveBeenCalled();

    cleanup();
    localStorage.clear();
    const disabled = renderTree({ writeDisabledReason: 'Out of sync' });
    await press(screen.getByRole('treeitem', { name: /Home/ }), 'Delete');
    expect(disabled).not.toHaveBeenCalled();
  });

  it('offers only Open to readers', async () => {
    renderTree({ canWrite: false });

    await press(screen.getByRole('treeitem', { name: /Home/ }), 'F10', { shiftKey: true });

    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Open']);
  });

  it('shows the reason and disables write actions while the space cannot be changed', async () => {
    renderTree({ writeDisabledReason: 'The space is out of sync with its repository.' });

    await press(screen.getByRole('treeitem', { name: /Home/ }), 'ContextMenu');

    await screen.findByRole('menu');
    expect(screen.getByText('The space is out of sync with its repository.')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Rename…' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Open' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('keeps one tab stop: the row buttons are out of the tab order and hidden from assistive technology', () => {
    renderTree();

    const items = screen.getAllByRole('treeitem');
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1);
    for (const button of document.querySelectorAll('.tree-item__actions')) {
      expect((button as HTMLButtonElement).tabIndex).toBe(-1);
      expect(button.getAttribute('aria-hidden')).toBe('true');
    }
    expect(items.every((item) => item.getAttribute('aria-haspopup') === 'menu')).toBe(true);
  });

  it('disables Move up on the first and Move down on the last sibling', async () => {
    renderTree();

    await press(screen.getByRole('treeitem', { name: /guides/ }), 'ContextMenu');

    await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'Move up' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Move down' }).getAttribute('aria-disabled')).toBeNull();
  });
});
