import { test, expect, type Locator, type Page } from '@playwright/test';
import { git, remoteLog, signIn, state } from './helpers';

// 010 Page front matter (specs/010-page-front-matter/quickstart.md). The ops/ pages come from
// server.mjs; ops/release-process.md was a draft in its previous version.

const RELEASE = '/s/handbook/ops/release-process.md';
const metadata = (page: Page) => page.getByRole('region', { name: 'Page metadata' });
const tree = (page: Page) => page.getByRole('tree', { name: 'Pages' });
const treeItem = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });

/** A page file exactly as committed in the handbook space. */
function rawFile(path: string): string {
  return git(state().handbook.bare, 'show', `main:${path}`);
}

async function expandOps(page: Page) {
  const ops = treeItem(page, 'ops');
  if ((await ops.getAttribute('aria-expanded')) === 'false') await ops.click();
}

async function openMenu(page: Page, target: Locator) {
  await target.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
}

test.describe('010 US1 — metadata no longer clutters the top of the page', () => {
  test('F1: the block is hidden and its known fields are shown', async ({ page }) => {
    await signIn(page);
    await page.goto(RELEASE);

    const article = page.getByRole('article').first();
    await expect(article).toContainText('Releases are cut every second Tuesday.');
    await expect(article).not.toContainText('status:');
    await expect(article.locator('hr')).toHaveCount(0);

    const meta = metadata(page);
    await expect(meta.getByRole('note')).toContainText('Deprecated');
    await expect(meta).toContainText('How we cut, test and publish a release.');
    await expect(meta).toContainText('Owner');
    await expect(meta).toContainText('Platform team');
    const tags = meta.getByRole('list', { name: 'Tags' });
    await expect(tags.getByRole('listitem')).toHaveText(['release', 'ci']);
    await expect(tags.locator('a, button, [tabindex]')).toHaveCount(0);
  });

  test('F2: a page without front matter has no metadata', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/setup.md');

    await expect(page.getByRole('heading', { level: 1, name: 'Setup' })).toBeVisible();
    await expect(metadata(page)).toHaveCount(0);
  });

  test('F3: unreadable metadata is reported and the raw block can be shown', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/ops/broken-meta.md');

    await expect(page.getByRole('heading', { level: 1, name: 'Broken meta' })).toBeVisible();
    const meta = metadata(page);
    await expect(meta).toContainText("This page's metadata could not be read.");
    await meta.getByText('Show metadata source').click();
    await expect(meta.locator('pre')).toHaveText('title: First\ntitle: Second\n');
  });

  test('F4: hostile values are shown as text and never run', async ({ page }) => {
    page.on('dialog', (dialog) => {
      throw new Error(`unexpected dialog: ${dialog.message()}`);
    });
    await signIn(page);
    await page.goto('/s/handbook/ops/hostile-meta.md');

    const meta = metadata(page);
    await expect(meta).toContainText('<img src=x onerror=alert(1)>');
    await expect(meta).toContainText('javascript:alert(1)');
    await expect(meta.getByRole('list', { name: 'Tags' })).toContainText('**bold**');
    await expect(meta.locator('img, script, strong, a')).toHaveCount(0);
    await expect(page).toHaveTitle(/<script>alert\(1\)<\/script>/);
  });

  test('F5: an earlier version shows its own metadata', async ({ page }) => {
    await signIn(page);
    const versions = git(state().handbook.bare, 'log', '--format=%H', 'main', '--', 'ops/release-process.md').split('\n');
    await page.goto(`/s/handbook/-/version/${versions[1]}/ops/release-process.md`);

    await expect(metadata(page).getByRole('note')).toContainText('Draft');
  });
});

test.describe('010 US3 — fields the wiki does not know are still visible', () => {
  test('F6: Properties is collapsed and lists the other fields', async ({ page }) => {
    await signIn(page);
    await page.goto(RELEASE);

    const meta = metadata(page);
    const summary = meta.getByText('Properties', { exact: true });
    const details = meta.locator('details.page-meta__properties');
    await expect(details).not.toHaveAttribute('open');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open');

    await expect(details).toContainText('weight');
    await expect(details).toContainText('20');
    await expect(details).toContainText('2026-09-01');
    await expect(details.locator('ul li')).toHaveText(['Ana', 'Bo']);
    const repo = details.locator('dl dl').getByRole('link', { name: 'https://example.invalid/release' });
    await expect(repo).toHaveAttribute('href', 'https://example.invalid/release');
    await expect(repo).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test.describe.serial('010 US2 — the page title comes from front matter', () => {
  test('F7: tree, tab and header use the front matter title', async ({ page }) => {
    await signIn(page);
    await page.goto(RELEASE);

    await expect(page.getByRole('heading', { level: 1, name: 'Release process' })).toBeVisible();
    await expect(page).toHaveTitle(/^Release process/);
    await expandOps(page);
    await expect(treeItem(page, 'Release process')).toBeVisible();
  });

  test('F8: renaming changes only the title line', async ({ page, browserName }) => {
    await signIn(page);
    await page.goto(`/s/handbook/ops/rename-${browserName}.md`);
    const before = rawFile(`ops/rename-${browserName}.md`);
    await expandOps(page);
    await openMenu(page, treeItem(page, `Rename ${browserName}`));
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename page' });
    await dialog.getByLabel('Title').fill(`Renamed ${browserName}`);
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(page.getByText('Page renamed', { exact: true })).toBeVisible();
    await expect(treeItem(page, `Renamed ${browserName}`)).toBeVisible();
    expect(rawFile(`ops/Renamed-${browserName}.md`)).toBe(before.replace(`title: Rename ${browserName}`, `title: Renamed ${browserName}`));
  });
});

test.describe.serial('010 US4 — editing never damages front matter', () => {
  const editor = (page: Page) => page.getByRole('textbox', { name: 'Page content', exact: true });
  const card = (page: Page) => page.getByRole('group', { name: 'Page metadata, can be edited in Markdown mode' });

  test('F9: the visual editor shows a read-only card and saves without touching the block', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await page.goto('/s/handbook/-/edit/ops/edit-meta.md');
    await expect(editor(page)).toBeVisible();

    await expect(card(page)).toContainText('Edit me');
    await expect(card(page)).toContainText('Deprecated');
    await expect(card(page)).toContainText('edit');

    const commits = remoteLog(state().handbook).length;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('No changes to save').first()).toBeVisible();
    expect(remoteLog(state().handbook)).toHaveLength(commits);

    const before = rawFile('ops/edit-meta.md');
    await editor(page).getByText('Second paragraph.').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' More.');
    await page.getByLabel('Change description').fill('Extend the second paragraph');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).not.toHaveURL(/\/-\/edit\//);
    expect(rawFile('ops/edit-meta.md')).toBe(before.replace('Second paragraph.', 'Second paragraph. More.'));
  });

  test('F10: "Edit in Markdown mode" opens the source; the preview and card follow changes', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await page.goto('/s/handbook/-/edit/ops/edit-meta.md');
    await expect(card(page)).toContainText('Deprecated');

    await card(page).getByRole('button', { name: 'Edit in Markdown mode' }).click();
    await expect(page.getByRole('radio', { name: 'Markdown' })).toHaveAttribute('aria-checked', 'true');

    const source = page.getByRole('textbox', { name: 'Page content (Markdown)' }).first();
    await source.click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type('status: draft');

    await page.getByRole('tab', { name: 'Preview' }).click();
    await page.getByRole('tab', { name: 'Preview' }).press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Preview' }).getByRole('region', { name: 'Page metadata' })).toContainText('Draft');

    await page.getByRole('radio', { name: 'Visual' }).click();
    await expect(card(page)).toContainText('Draft');
  });
});
