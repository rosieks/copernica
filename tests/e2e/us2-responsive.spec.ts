import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { expectNoReflow, viewports } from './ui-helpers';

test.describe('002 US2 — use the wiki on any screen size', () => {
  test('V7: wide shows three regions; narrower screens use panels', async ({ page }) => {
    await signIn(page);

    await page.setViewportSize(viewports.wide);
    await page.goto('/s/handbook/index.md');
    await expect(page.getByRole('navigation', { name: 'Space navigation' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Discussions' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Discussions \(\d+\)$/ })).toHaveCount(0);

    await page.setViewportSize(viewports.medium);
    await expect(page.getByRole('navigation', { name: 'Space navigation' })).toBeVisible();
    const toggle = page.getByRole('button', { name: /^Discussions \(\d+\)$/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
    const sheet = page.getByRole('dialog', { name: 'Discussions' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(toggle).toBeFocused();

    await page.setViewportSize(viewports.narrow);
    await expect(page.getByRole('navigation', { name: 'Space navigation' })).toHaveCount(0);
    const open = page.getByRole('button', { name: 'Open navigation' });
    await open.click();
    const nav = page.getByRole('dialog', { name: 'Space navigation' });
    await expect(nav.getByRole('tree', { name: 'Pages' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
  });

  test('V8: at 320px only wide content scrolls, never the page', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize(viewports.narrow);
    await page.goto('/s/handbook/guides/wide.md');
    await expect(page.getByRole('table')).toBeVisible();
    await expectNoReflow(page);
    const overflowing = await page.locator('.prose').evaluate((prose) =>
      [...prose.querySelectorAll<HTMLElement>('*')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.tagName),
    );
    expect(overflowing.every((tag) => ['TABLE', 'PRE', 'CODE', 'TBODY', 'THEAD', 'TR'].includes(tag))).toBe(true);
  });

  test('V9: core screens work at 320px without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize(viewports.narrow);
    await signIn(page);
    for (const url of [
      '/',
      '/profile',
      '/s/handbook/index.md',
      '/s/handbook/-/history/guides/history.md',
      '/s/handbook/-/edit/guides/setup.md',
    ]) {
      await page.goto(url);
      await expect(page.locator('#main h1').first()).toBeVisible();
      await expectNoReflow(page);
    }
    // Write and preview are tabs on narrow screens.
    await page.getByRole('tab', { name: 'Preview' }).click();
    await page.getByRole('tab', { name: 'Preview' }).press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Preview' })).toContainText('Setup');
    await expect(page.getByRole('tab', { name: 'Split' })).toHaveCount(0);
  });

  test('editor split view has a single scrollbar (the page)', async ({ page }) => {
    await page.setViewportSize(viewports.wide);
    await signIn(page);
    await page.goto('/s/handbook/-/edit/guides/wide.md');
    await page.getByRole('tab', { name: 'Split' }).click();
    await page.getByRole('tab', { name: 'Split' }).press('Enter');
    const preview = page.getByRole('tabpanel', { name: 'Split' }).getByLabel('Preview');
    await expect(preview).toContainText('Wide');
    expect(await preview.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    // Editor and preview frames end at the same line.
    const editorBox = (await page.getByRole('tabpanel', { name: 'Split' }).locator('.editor-pane').boundingBox())!;
    const previewBox = (await preview.boundingBox())!;
    expect(Math.abs(editorBox.y + editorBox.height - (previewBox.y + previewBox.height))).toBeLessThanOrEqual(1);
  });

  test('V9: sign-in fits a 320px screen', async ({ page }) => {
    await page.setViewportSize(viewports.narrow);
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: 'Sign in to Copernica' })).toBeVisible();
    await expectNoReflow(page);
  });
});
