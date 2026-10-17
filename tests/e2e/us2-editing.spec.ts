import { test, expect, type Page } from '@playwright/test';
import { remoteFile, remoteLog, replaceEditorText as replace, signIn, state } from './helpers';

const replaceEditorText = (page: Page, text: string) =>
  replace(page, page.getByRole('textbox', { name: 'Page content (Markdown)' }), text);

test.describe('US2 — edit and create pages with attributed history', () => {
  test('A6: editing a page creates a commit authored by the user', async ({ page }) => {
    await signIn(page, 'alice');
    await page.goto('/s/handbook/guides/setup.md');
    await page.getByRole('link', { name: 'Edit' }).click();
    await replaceEditorText(page, '# Setup\n\nInstall the tools and fix the typo.');
    await expect(page.getByRole('region', { name: 'Preview' })).toContainText('fix the typo');
    await page.getByLabel('Change description').fill('Fix typo');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/s\/handbook\/guides\/setup\.md$/);
    await expect(page.getByRole('article')).toContainText('fix the typo');
    const [latest] = remoteLog(state().handbook);
    expect(latest).toEqual({ author: 'Alice Example', email: 'alice@example.test', message: 'Fix typo' });
  });

  test('A7: creating and deleting a page', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/index.md');
    await page.getByRole('button', { name: 'New page' }).click();
    await page.getByLabel(/Page name/).fill('guides/created-in-e2e');
    await page.getByRole('button', { name: 'Create' }).click();
    await replaceEditorText(page, '# Created In E2E\n\nHello.');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Created In E2E' })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: 'Created In E2E' })).toBeVisible();
    expect(remoteFile(state().handbook, 'guides/created-in-e2e.md')).toContain('Hello.');

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete page' }).click();
    await expect(page.getByRole('treeitem', { name: 'Created In E2E' })).toHaveCount(0);
    expect(remoteLog(state().handbook, 'guides/created-in-e2e.md').map((c) => c.message)).toEqual([
      'Delete guides/created-in-e2e.md',
      'Create guides/created-in-e2e.md',
    ]);
  });

  test('A8: history lists changes and compares two versions', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/setup.md');
    await page.getByRole('link', { name: 'History' }).click();
    const items = page.getByRole('listitem');
    await expect(items.first()).toContainText('Fix typo');
    await expect(items.first()).toContainText('Alice Example');

    const boxes = page.getByRole('checkbox');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.getByRole('region', { name: 'Differences' })).toContainText('fix the typo');

    await page.getByRole('link', { name: 'View' }).first().click();
    await expect(page.getByText('You are viewing an older version.')).toBeVisible();
  });
});
