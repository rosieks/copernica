import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { expectFocusNotLost } from './ui-helpers';

test.describe('002 US3 — operate everything with the keyboard', () => {
  test('V10: skip link, edit shortcut and save shortcut', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/setup.md');
    await expect(page.getByRole('article')).toContainText('Setup');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

    await page.locator('body').click({ position: { x: 1, y: 300 } });
    await page.keyboard.press('e');
    await expect(page).toHaveURL(/\/-\/edit\/guides\/setup\.md$/);
    await expect(page.getByRole('heading', { level: 1, name: /Editing/ })).toBeFocused();

    // An unchanged page is not saved at all (007 FR-012), so make a change first.
    await page.getByRole('textbox', { name: 'Page content (Markdown)' }).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nSaved with the keyboard.\n');
    await page.getByLabel('Change description').fill('');
    await page.keyboard.press('ControlOrMeta+s');
    const description = page.getByLabel('Change description');
    await expect(description).toBeFocused();
    await expect(page.getByText('Describe your change.')).toBeVisible();

    await description.fill('Keyboard save');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/setup\.md$/);
    await expectFocusNotLost(page);
  });

  test('V11: overlays return focus; help lists the shortcuts', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/setup.md');
    await expect(page.getByRole('article')).toContainText('Setup');

    const more = page.getByRole('button', { name: 'More page actions' });
    await more.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Delete page…' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();

    const newPage = page.getByRole('button', { name: 'New page' });
    await newPage.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'New page' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(newPage).toBeFocused();

    await page.getByRole('article').click();
    await page.keyboard.press('Shift+?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toContainText('Edit this page');
    await expect(help).toContainText('Show keyboard shortcuts');
  });

  test('V12: single-key shortcuts can be turned off; modifier shortcuts keep working', async ({ page, context }) => {
    await signIn(page);
    await page.goto('/profile');
    await page.getByLabel(/Enable single-key shortcuts/).uncheck();

    await page.goto('/s/handbook/guides/setup.md');
    await expect(page.getByRole('article')).toContainText('Setup');
    await page.getByRole('article').click();
    await page.keyboard.press('e');
    await page.keyboard.press('Shift+?');
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/setup\.md$/);
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);

    const second = await context.newPage();
    await second.goto('/profile');
    await expect(second.getByLabel(/Enable single-key shortcuts/)).not.toBeChecked();

    await page.goto('/s/handbook/-/edit/guides/setup.md');
    // An unchanged page is not saved at all (007 FR-012), so make a change first.
    await page.getByRole('textbox', { name: 'Page content (Markdown)' }).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nModifier save.\n');
    await page.getByLabel('Change description').fill('Modifier save still works');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/setup\.md$/);

    await page.goto('/profile');
    await page.getByLabel(/Enable single-key shortcuts/).check();
  });

  test('V13: highlights are reachable by keyboard; typing in fields never triggers shortcuts', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/index.md');
    await expect(page.getByRole('article').first()).toContainText('onboarding');

    const marker = page.getByRole('button', { name: /^Discussion: / }).first();
    if ((await marker.count()) > 0) {
      await marker.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.discussion--active')).toHaveCount(1);
    }

    const reply = page.getByRole('textbox', { name: 'Reply' }).first();
    if ((await reply.count()) > 0) {
      await reply.click();
      await page.keyboard.type('e');
      await expect(reply).toHaveValue('e');
      await expect(page).toHaveURL(/\/s\/handbook\/index\.md$/);
    }
  });
});
