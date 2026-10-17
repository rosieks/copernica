import { test, expect, type Page } from '@playwright/test';
import { replaceEditorText, signIn } from './helpers';
import { withTheme } from './ui-helpers';

async function colours(page: Page) {
  return page.evaluate(() => {
    const bg = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return { body: bg('body'), editor: bg('.cm-editor'), dark: document.documentElement.classList.contains('dark') };
  });
}

test.describe('002 US6 — dark theme that follows the operating system', () => {
  test('V24: switching the OS appearance re-themes everything without losing input', async ({ page }) => {
    await signIn(page);
    await withTheme(page, 'light');
    await page.goto('/s/handbook/-/edit/guides/setup.md');
    const editor = page.getByRole('textbox', { name: 'Page content (Markdown)' });
    await replaceEditorText(page, editor, '# Setup\n\nUnsaved words.');
    const url = page.url();
    const light = await colours(page);
    expect(light.dark).toBe(false);

    await withTheme(page, 'dark');
    await expect.poll(async () => (await colours(page)).dark, { timeout: 1_000 }).toBe(true);
    const dark = await colours(page);
    expect(dark.body).not.toBe(light.body);
    expect(dark.editor).not.toBe(light.editor);
    await expect(editor).toContainText('Unsaved words.');
    expect(page.url()).toBe(url);

    await withTheme(page, 'light');
    await expect.poll(async () => (await colours(page)).dark, { timeout: 1_000 }).toBe(false);
    await expect(editor).toContainText('Unsaved words.');
  });

  test('V24: page content and code blocks are themed', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/wide.md');
    await withTheme(page, 'light');
    const lightPre = await page.locator('.prose pre').evaluate((el) => getComputedStyle(el).backgroundColor);
    await withTheme(page, 'dark');
    await expect.poll(() => page.locator('.prose pre').evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(lightPre);
  });
});
