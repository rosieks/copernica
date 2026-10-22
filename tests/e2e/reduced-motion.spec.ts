import { test, expect, type Locator } from '@playwright/test';
import { signIn } from './helpers';
import { viewports } from './ui-helpers';

async function motion(locator: Locator) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const seconds = (value: string) => Math.max(...value.split(',').map((v) => parseFloat(v) || 0));
    return seconds(style.animationDuration) + seconds(style.transitionDuration);
  });
}

test.describe('002 — reduced motion (V27)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('dialogs, sheets and notifications do not animate', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/index.md');

    await page.getByRole('button', { name: 'New page' }).click();
    expect(await motion(page.getByRole('dialog', { name: 'New page' }))).toBe(0);
    await page.keyboard.press('Escape');

    await page.setViewportSize(viewports.narrow);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    expect(await motion(page.getByRole('dialog', { name: 'Space navigation' }))).toBe(0);
    await page.keyboard.press('Escape');

    await page.goto('/s/handbook/-/edit/guides/setup.md');
    // An unchanged page is not saved at all (007 FR-012), so make a change first.
    await page.getByRole('textbox', { name: 'Page content (Markdown)' }).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nReduced motion.\n');
    await page.getByLabel('Change description').fill('Reduced motion save');
    await page.getByRole('button', { name: 'Save' }).click();
    const toast = page.getByRole('region', { name: /Notifications/ }).locator('li').first();
    await expect(toast).toBeVisible();
    expect(await motion(toast)).toBe(0);
  });
});
