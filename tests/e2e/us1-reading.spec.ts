import { test, expect } from '@playwright/test';
import { pushOutside, signIn, state } from './helpers';

test.describe('US1 — browse and read pages', () => {
  test('A1: anonymous users are sent to sign-in and see no content', async ({ page, request }) => {
    expect((await request.get('/api/spaces')).status()).toBe(401);
    await page.goto('/s/handbook/index.md');
    await expect(page).toHaveURL(/\/signin\?returnUrl=/);
    await expect(page.getByText('Team Handbook')).toHaveCount(0);
  });

  test('A2: both spaces are listed and the tree mirrors folders', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('link', { name: 'Team Handbook' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Payments Service' })).toBeVisible();

    await page.getByRole('link', { name: 'Payments Service' }).click();
    const tree = page.getByRole('tree', { name: 'Pages' });
    await expect(tree.getByRole('treeitem')).toHaveCount(1);
    await expect(tree.getByRole('treeitem', { name: 'Payments API' })).toBeVisible();

    await page.goto('/s/handbook/');
    await expect(page).toHaveURL(/\/s\/handbook\/index\.md$/);
    const handbookTree = page.getByRole('tree', { name: 'Pages' });
    await handbookTree.getByRole('treeitem', { name: 'guides' }).click();
    await handbookTree.getByRole('treeitem', { name: 'Setup' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Setup' })).toBeVisible();
  });

  test('A2: the tree can be used with the keyboard', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/index.md');
    const tree = page.getByRole('tree', { name: 'Pages' });
    await tree.getByRole('treeitem', { name: 'Team Handbook' }).focus();
    await page.keyboard.press('Home');
    await expect(tree.getByRole('treeitem', { name: 'guides' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tree.getByRole('treeitem', { name: 'guides' })).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/.+\.md$/);
  });

  test('A3: relative and cross-space links navigate inside the wiki', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/index.md');
    await page.getByRole('article').getByRole('link', { name: 'setup' }).click();
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/setup\.md$/);
    await expect(page.getByRole('img', { name: 'diagram' })).toBeVisible();

    await page.goto('/s/handbook/index.md');
    await page.getByRole('article').getByRole('link', { name: 'the API' }).click();
    await expect(page).toHaveURL(/\/s\/service\/api\.md$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible();
  });

  test('A4: scripts in pages never run and CSP is not violated', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) violations.push(message.text());
    });
    await signIn(page);
    await page.goto('/s/handbook/guides/unsafe.md');
    await expect(page.getByRole('heading', { level: 1, name: 'Unsafe' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
    expect(await page.locator('article script').count()).toBe(0);
    expect(violations).toEqual([]);
  });

  test('A5: changes pushed with plain git appear without restart', async ({ page }) => {
    await signIn(page);
    pushOutside(state().handbook, 'guides/news.md', '# Fresh News\n\nPushed outside the wiki.\n');
    await expect(async () => {
      await page.goto('/s/handbook/guides/news.md');
      await expect(page.getByRole('heading', { level: 1, name: 'Fresh News' })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  });
});
