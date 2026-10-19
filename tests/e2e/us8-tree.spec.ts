import { test, expect, type Locator, type Page } from '@playwright/test';
import { git, pushOutside, remoteFile, remoteLog, replaceEditorText, signIn, state } from './helpers';

// specs/005-page-tree-management/quickstart.md, scenarios T1–T31 (automated parts). The `tree`
// space ("Tree Lab") is seeded by server.mjs; the tests build on each other, so they run in order.

const tree = (page: Page) => page.getByRole('tree', { name: 'Pages' });
const item = (page: Page, name: string | RegExp) => tree(page).getByRole('treeitem', { name, exact: typeof name === 'string' });

function lastMessage(): string {
  return git(state().tree.bare, 'log', '-1', '--format=%B', 'main');
}

function remoteHas(path: string): boolean {
  try {
    remoteFile(state().tree, path);
    return true;
  } catch {
    return false;
  }
}

async function openMenu(page: Page, target: Locator) {
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
}

/** Changes pushed outside the wiki appear after the next synchronization (every 5 s in tests). */
async function waitForItem(page: Page, folder: string, name: string) {
  await expect(async () => {
    await page.reload();
    await expand(page, folder);
    await expect(item(page, name)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
}

async function expand(page: Page, folder: string) {
  const node = item(page, folder);
  if ((await node.getAttribute('aria-expanded')) === 'false') await node.click();
}

test.describe.serial('005 — managing the page tree', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('T1/T2: renaming a page from the tree is one commit that updates links and the title', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'guides');
    await openMenu(page, item(page, 'Setup'));
    await page.getByRole('menuitem', { name: 'Rename…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Rename page' });
    await dialog.getByLabel('Title').fill('Installing');
    await expect(dialog.getByLabel('File name')).toHaveValue('Installing.md');
    await expect(dialog.getByRole('status')).toContainText('3 other pages link here');
    const before = remoteLog(state().tree).length;
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(page.getByText('Page renamed', { exact: true })).toBeVisible();
    await expect(item(page, 'Installing')).toBeFocused();
    expect(remoteLog(state().tree)).toHaveLength(before + 1);
    expect(lastMessage()).toContain('Copernica-Moved: guides/setup.md -> guides/Installing.md');
    expect(remoteHas('guides/setup.md')).toBe(false);
    expect(remoteFile(state().tree, 'guides/Installing.md')).toMatch(/^# Installing/);
    expect(remoteFile(state().tree, 'index.md')).toContain('[Setup](guides/Installing.md)');
    const faq = remoteFile(state().tree, 'guides/faq.md');
    expect(faq).toContain('[install steps](Installing.md#install)');
    expect(faq).toContain('`setup.md`');
  });

  test('T3/T4: the old address leads to the moved page, which keeps its history', async ({ page }) => {
    await page.goto('/s/tree/guides/setup.md');

    await expect(page).toHaveURL(/\/s\/tree\/guides\/Installing\.md$/);
    await expect(page.getByText('This page was moved from “guides/setup.md”.')).toBeVisible();
    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('row')).toHaveCount(3); // header + rename + seed
  });

  test('T5: moving the open page with the Move dialog follows it and keeps its links working', async ({ page }) => {
    await page.goto('/s/tree/guides/Installing.md');
    await page.getByRole('button', { name: 'More page actions' }).click();
    await page.getByRole('menuitem', { name: 'Move…' }).click();

    const dialog = page.getByRole('dialog', { name: /Move “Installing”/ });
    await dialog.getByLabel('Find a folder').fill('refer');
    await dialog.getByLabel('reference').check();
    await dialog.getByRole('button', { name: 'Move' }).click();

    await expect(page).toHaveURL(/\/s\/tree\/reference\/Installing\.md$/);
    await expect(page.getByRole('article').getByRole('link', { name: 'the API' })).not.toHaveClass(/broken-link/);
    // The relative link still resolves from the new folder, so it is kept as written.
    expect(remoteFile(state().tree, 'reference/Installing.md')).toContain('[the API](../reference/api.md)');
    await page.goto('/s/tree/guides/setup.md');
    await expect(page).toHaveURL(/\/s\/tree\/reference\/Installing\.md$/);
  });

  test('T6: a moved one-line page keeps its history', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'guides');
    await openMenu(page, item(page, 'tiny'));
    await page.getByRole('menuitem', { name: 'Move…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('archive', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Move' }).click();
    await expect(page.getByText('Page moved', { exact: true })).toBeVisible();

    // Header + seed + the link updates of T1 and T5 + this move: nothing before the move is lost.
    await page.goto('/s/tree/-/history/archive/tiny.md');
    await expect(page.getByRole('row')).toHaveCount(5);
    await expect(page.getByRole('row').last()).toContainText('Seed');
  });

  test('T7: invalid and taken names are refused inline', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'guides');
    await openMenu(page, item(page, 'FAQ'));
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename page' });
    const fileName = dialog.getByLabel('File name');

    await fileName.fill('a:b.md');
    await expect(dialog.getByText(/cannot contain/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Rename' })).toBeDisabled();
    await fileName.fill('.order');
    await expect(dialog.getByText(/reserved/)).toBeVisible();

    // A name that exists: the server answers target-exists.
    await fileName.fill('../index.md');
    await expect(dialog.getByRole('button', { name: 'Rename' })).toBeDisabled();
    await page.keyboard.press('Escape');
  });

  test('T8: a move keeps edits pushed meanwhile', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'guides');
    await openMenu(page, item(page, 'FAQ'));
    await page.getByRole('menuitem', { name: 'Move…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('reference').check();

    pushOutside(state().tree, 'guides/faq.md', '# FAQ\n\nRead [install steps](../reference/Installing.md#install). Edited outside.\n');
    await dialog.getByRole('button', { name: 'Move' }).click();

    await expect(page.getByText('Page moved', { exact: true })).toBeVisible();
    expect(remoteFile(state().tree, 'reference/faq.md')).toContain('Edited outside.');
  });

  test('T9: a move of a page deleted meanwhile is reported and changes nothing', async ({ page }) => {
    pushOutside(state().tree, 'reference/doomed.md', '# Doomed\n');
    await page.goto('/s/tree/index.md');
    await waitForItem(page, 'reference', 'Doomed');
    await openMenu(page, item(page, 'Doomed'));
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Saved');

    git(state().tree.clone, 'pull', '--quiet', state().tree.bare, 'main');
    git(state().tree.clone, 'rm', '--quiet', 'reference/doomed.md');
    git(state().tree.clone, '-c', 'user.name=Outsider', '-c', 'user.email=outside@example.test', 'commit', '-m', 'Delete doomed');
    git(state().tree.clone, 'push', '--quiet', state().tree.bare, 'main');
    const before = remoteLog(state().tree).length;
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(dialog.getByText(/The tree changed since you opened it/)).toBeVisible();
    expect(remoteLog(state().tree)).toHaveLength(before);
  });

  test('T10: an edit started before a move is saved at the new location', async ({ page, browser }) => {
    await page.goto('/s/tree/-/edit/reference/api.md');
    await expect(page.getByRole('textbox', { name: 'Page content (Markdown)' })).toBeVisible();

    const other = await browser.newPage();
    await signIn(other);
    await other.goto('/s/tree/index.md');
    await expand(other, 'reference');
    await openMenu(other, item(other, 'API'));
    await other.getByRole('menuitem', { name: 'Move…' }).click();
    await other.getByRole('dialog').getByLabel('Space root').check();
    await other.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
    await expect(other.getByText('Page moved', { exact: true })).toBeVisible();
    await other.close();

    await page.getByLabel('Change description').fill('Edit after move');
    await page.getByRole('textbox', { name: 'Page content (Markdown)' }).press('End');
    await page.keyboard.type(' Edited.');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Saved. The page had been moved to “api.md”.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/s\/tree\/api\.md$/);
    expect(remoteHas('reference/api.md')).toBe(false);
    expect(remoteFile(state().tree, 'api.md')).toContain('Edited.');
  });

  test('T11: a case-only rename works', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    // T10 typed at the end of the heading line, so the title now starts with "API".
    await openMenu(page, item(page, /^API/));
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename page' });
    await dialog.getByLabel('File name').fill('API.md');
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(page.getByText('Page renamed', { exact: true })).toBeVisible();
    expect(remoteHas('API.md')).toBe(true);
    expect(remoteHas('api.md')).toBe(false);
  });

  test('T12: a new folder is created with its first page, and nothing is left when cancelled', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await page.getByRole('button', { name: 'Space actions' }).click();
    await page.getByRole('menuitem', { name: 'New folder…' }).click();
    let dialog = page.getByRole('dialog', { name: 'New folder' });
    await dialog.getByLabel('Folder name').fill('how-to');
    await expect(dialog.getByLabel('First page name')).toHaveValue('index');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/s\/tree\/-\/new\/how-to\/index\.md$/);
    await replaceEditorText(page, page.getByRole('textbox', { name: 'Page content (Markdown)' }), '# How to\n\nGuides.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/s\/tree\/how-to\/index\.md$/);
    await expect(item(page, 'how-to')).toBeVisible();
    expect(remoteFile(state().tree, 'how-to/index.md')).toContain('Guides.');

    await page.getByRole('button', { name: 'Space actions' }).click();
    await page.getByRole('menuitem', { name: 'New folder…' }).click();
    dialog = page.getByRole('dialog', { name: 'New folder' });
    await dialog.getByLabel('Folder name').fill('abandoned');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.goto('/s/tree/index.md');
    await expect(item(page, 'abandoned')).toHaveCount(0);
    expect(remoteHas('abandoned/index.md')).toBe(false);
  });

  test('T13: "New page here" starts the page in that folder', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await openMenu(page, item(page, 'reference'));
    await page.getByRole('menuitem', { name: 'New page here…' }).click();
    const dialog = page.getByRole('dialog', { name: 'New page' });
    await expect(dialog.getByLabel('Page name (in reference/)')).toBeVisible();
    await dialog.getByLabel('Page name (in reference/)').fill('Checklist');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/s\/tree\/-\/new\/reference\/Checklist\.md$/);
  });

  test('T16: renaming a folder moves its pages and redirects their old addresses', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await openMenu(page, item(page, 'how-to'));
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename folder' });
    await dialog.getByLabel('Name').fill('howto');
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(page.getByText('Folder renamed', { exact: true })).toBeVisible();
    expect(lastMessage()).toContain('Copernica-Moved: how-to/ -> howto/');
    expect(remoteFile(state().tree, 'howto/index.md')).toContain('Guides.');
    await page.goto('/s/tree/how-to/index.md');
    await expect(page).toHaveURL(/\/s\/tree\/howto\/index\.md$/);
  });

  test('T17: a folder cannot be moved into itself', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await openMenu(page, item(page, 'archive'));
    await page.getByRole('menuitem', { name: 'Move…' }).click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByLabel('archive/2019')).toBeDisabled();
    await expect(dialog.getByText('A folder cannot be moved into itself.').first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('T18/T19/T20: deleting a folder shows the real count, asks again when it changed, and keeps history', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'archive');
    await openMenu(page, item(page, '2019'));
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete folder “2019”?' });
    await expect(dialog).toContainText('This removes 40 pages and 2 other files.');

    pushOutside(state().tree, 'archive/2019/late.md', '# Late\n');
    await dialog.getByRole('button', { name: 'Delete folder' }).click();
    await expect(dialog).toContainText('This removes 41 pages and 2 other files.');
    await expect(dialog.getByText(/The folder changed since you opened this dialog/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete folder' }).click();

    await expect(page.getByText('Folder deleted', { exact: true })).toBeVisible();
    await expect(item(page, '2019')).toHaveCount(0);
    expect(remoteHas('archive/2019/page-00.md')).toBe(false);
    expect(remoteHas('archive/2019/late.md')).toBe(false);

    await page.goto('/s/tree/archive/2019/page-00.md');
    await expect(page.getByText(/was deleted/)).toBeVisible();
    await page.getByRole('link', { name: 'View its history' }).click();
    await expect(page.getByRole('row').nth(1)).toContainText('Seed');
  });

  test('T24: Azure DevOps order files order the tree; unknown entries are ignored, unlisted pages follow', async ({ page }) => {
    pushOutside(state().tree, 'howto/zeta.md', '# Zeta\n');
    pushOutside(state().tree, 'howto/new.md', '# New\n');
    pushOutside(state().tree, 'howto/.order', 'zeta\nindex\nGhost\n');
    await page.goto('/s/tree/index.md');
    await waitForItem(page, 'howto', 'New');

    const names = await tree(page).getByRole('treeitem', { level: 2 }).allTextContents();
    expect(names.filter((n) => ['Zeta', 'How to', 'New'].includes(n))).toEqual(['Zeta', 'How to', 'New']);
  });

  test('T25: Move down in a folder without an order file creates one listing every item', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await openMenu(page, item(page, 'archive'));
    await page.getByRole('menuitem', { name: 'Move down' }).click();

    await expect(page.getByText('Moved down', { exact: true })).toBeVisible();
    await expect(item(page, 'archive')).toBeFocused();
    expect(remoteFile(state().tree, '.order').split('\n').filter(Boolean)).toEqual(['howto', 'archive', 'reference', 'API', 'index']);
    expect(lastMessage()).toContain('Reorder root: move archive before reference');
  });

  test('T27: creating a page in a folder with an order file appends it', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await openMenu(page, item(page, 'reference'));
    await page.getByRole('menuitem', { name: 'New page here…' }).click();
    await page.getByRole('dialog').getByLabel('Page name (in reference/)').fill('Glossary');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    // The editor preview shows the heading too: wait for the saved page.
    await expect(page).toHaveURL(/\/s\/tree\/reference\/Glossary\.md$/);
    expect(remoteFile(state().tree, 'reference/.order').split('\n').filter(Boolean)).toEqual(['Installing', 'faq', 'Glossary']);
  });

  test('T28: an unreadable order file falls back to alphabetical order', async ({ page }) => {
    pushOutside(state().tree, 'reference/.order', 'x\n'.repeat(40_000));
    await page.goto('/s/tree/index.md');
    await expect(async () => {
      await page.reload();
      await expand(page, 'reference');
      const names = await tree(page).getByRole('treeitem').allTextContents();
      expect(names.indexOf('FAQ')).toBeLessThan(names.indexOf('Installing'));
    }).toPass({ timeout: 30_000 });
  });

  test('T21: dragging a page onto a folder opens Move with that folder chosen', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'howto');

    await item(page, 'Zeta').dragTo(item(page, 'reference'));

    const dialog = page.getByRole('dialog', { name: /Move “Zeta”/ });
    await expect(dialog.getByLabel('reference', { exact: true })).toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Move' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Move' }).click();
    await expect(page.getByText('Page moved', { exact: true })).toBeVisible();
    expect(remoteHas('reference/zeta.md')).toBe(true);
  });

  test('T22: dragging between siblings reorders them right away', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'howto');
    const target = item(page, 'How to');
    const box = (await target.boundingBox())!;

    await item(page, 'New').dragTo(target, { targetPosition: { x: box.width / 2, y: 2 } });

    await expect(page.getByText('Moved before How to', { exact: true })).toBeVisible();
    expect(remoteFile(state().tree, 'howto/.order').split('\n').filter(Boolean)).toEqual(['new', 'index', 'Ghost']);
  });

  test('T23: the same results are reachable with the keyboard only', async ({ page }) => {
    await page.goto('/s/tree/index.md');
    await expand(page, 'howto');
    const howTo = item(page, 'How to');
    await howTo.focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Move up' }).press('Enter');
    await expect(page.getByText('Moved up', { exact: true })).toBeVisible();
    await expect(howTo).toBeFocused();
    // The unknown entry stays after its neighbour "index" (contracts/order-file.md).
    expect(remoteFile(state().tree, 'howto/.order').split('\n').filter(Boolean)).toEqual(['index', 'Ghost', 'new']);

    await howTo.focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Move…' }).press('Enter');
    const dialog = page.getByRole('dialog');
    await page.keyboard.type('archive');
    await dialog.getByLabel('archive', { exact: true }).press('Space');
    await dialog.getByRole('button', { name: 'Move' }).press('Enter');
    await expect(page.getByText('Page moved', { exact: true })).toBeVisible();
    expect(remoteHas('archive/index.md')).toBe(true);
  });

  test('T29: on a narrow touch screen there is no dragging and the menu is on the row', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await signIn(page);
    await page.goto('/s/tree/index.md');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const nav = page.getByRole('dialog', { name: 'Space navigation' });
    const row = nav.getByRole('treeitem', { name: 'Tree Home' });

    await expect(row).not.toHaveAttribute('draggable', 'true');
    await row.locator('.tree-item__actions').click();
    await expect(page.getByRole('menu', { name: 'Actions for Tree Home' })).toBeVisible();
    await context.close();
  });

  test('T30: a change the platform rejects is explained and nothing changes', async ({ page }) => {
    await page.route('**/api/spaces/tree/tree/move', (route) =>
      route.request().postDataJSON()?.dryRun
        ? route.continue()
        : route.fulfill({
            status: 403,
            contentType: 'application/problem+json',
            body: JSON.stringify({ type: 'urn:copernica:problem:push-rejected', title: 'The git hosting platform rejected the change.', detail: 'Branch main is protected.' }),
          }),
    );
    await page.goto('/s/tree/index.md');
    const before = remoteLog(state().tree).length;
    await openMenu(page, item(page, 'Tree Home'));
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename page' });
    await dialog.getByLabel('Title').fill('Start');
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(dialog.getByRole('alert')).toContainText('Branch main is protected.');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(item(page, 'Tree Home')).toBeVisible();
    expect(remoteLog(state().tree)).toHaveLength(before);
  });
});

