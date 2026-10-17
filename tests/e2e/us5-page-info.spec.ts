import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { git, remoteFile, signIn, state } from './helpers';

test.describe('002 US5 — page information, copy link and download', () => {
  test('V19: the page shows its last change as recorded in git', async ({ page }) => {
    const [author, subject] = git(state().handbook.bare, 'log', '-1', '--format=%an%n%s', 'main', '--', 'guides/history.md').split('\n');
    await signIn(page);
    await page.goto('/s/handbook/guides/history.md');

    const info = page.getByText(/Last changed by/);
    await expect(info).toContainText(author!);
    await expect(info).toContainText(subject!);
    const time = info.locator('time');
    await time.focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
  });

  test('V20: page information never delays the content', async ({ page }) => {
    await signIn(page);
    await page.route('**/history/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.continue();
    });
    await page.goto('/s/handbook/guides/history.md');
    await expect(page.getByRole('article')).toContainText('Final edit.');
    await expect(page.getByText(/Last changed by/)).toHaveCount(0);
    await expect(page.getByText(/Last changed by/)).toBeVisible({ timeout: 10_000 });
  });

  test('V21: copy link copies the current page or the shown version', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are only grantable in Chromium.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page);
    await page.goto('/s/handbook/guides/history.md');
    await page.getByRole('button', { name: 'More page actions' }).click();
    await page.getByRole('menuitem', { name: 'Copy link' }).click();
    await expect(page.getByRole('region', { name: /Notifications/ }).getByText('Link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/s\/handbook\/guides\/history\.md$/);

    await page.goto('/s/handbook/-/history/guides/history.md');
    await page.getByRole('row').nth(2).getByRole('link', { name: /, version of / }).click();
    await page.getByRole('button', { name: 'More page actions' }).click();
    await page.getByRole('menuitem', { name: 'Copy link' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/s\/handbook\/-\/version\/[0-9a-f]{40}\/guides\/history\.md$/);
    await page.goto(copied);
    await expect(page.getByRole('article')).toContainText('Second pass.');
  });

  test('V22 (simulated): without a clipboard the link is offered for manual copying', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await signIn(page);
    await page.goto('/s/handbook/guides/history.md');
    await page.getByRole('button', { name: 'More page actions' }).click();
    await page.getByRole('menuitem', { name: 'Copy link' }).click();
    const dialog = page.getByRole('dialog', { name: 'Copy link' });
    await expect(dialog.getByLabel('Link to this page')).toHaveValue(/\/s\/handbook\/guides\/history\.md$/);
    await expect(dialog.getByLabel('Link to this page')).toBeFocused();
  });

  test('V23: download gives the Markdown of the shown version, also for too-large pages', async ({ page }) => {
    await signIn(page);
    for (const path of ['guides/history.md', 'guides/huge.md']) {
      await page.goto(`/s/handbook/${path}`);
      await page.getByRole('button', { name: 'More page actions' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Download Markdown' }).click()]);
      expect(download.suggestedFilename()).toBe(path.split('/').pop());
      // The git helper trims its output, so compare without trailing whitespace.
      expect(readFileSync((await download.path())!, 'utf8').trimEnd()).toBe(remoteFile(state().handbook, path));
    }
  });
});
