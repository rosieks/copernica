import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { collectCspViolations, viewports } from './ui-helpers';

test.describe('002 — strict CSP with the style nonce (V26)', () => {
  test('the shell carries a fresh nonce that matches the document; API keeps the static policy', async ({ page, request }) => {
    const first = await page.goto('/signin');
    const header = first!.headers()['content-security-policy']!;
    const meta = await page.locator('meta[name="csp-nonce"]').getAttribute('content');
    expect(meta).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(header).toContain(`style-src 'self' 'nonce-${meta}'`);
    expect(header).toContain("script-src 'self';");

    const second = await page.reload();
    expect(second!.headers()['content-security-policy']).not.toBe(header);

    const api = await request.get('/api/spaces');
    expect(api.headers()['content-security-policy']).not.toContain('nonce-');
  });

  test('every screen and overlay works without a single CSP violation', async ({ page }) => {
    const violations = await collectCspViolations(page);
    await signIn(page);

    for (const url of ['/', '/profile', '/s/handbook/index.md', '/s/handbook/-/history/guides/history.md', '/s/handbook/-/edit/guides/setup.md']) {
      await page.goto(url);
      await expect(page.locator('#main h1').first()).toBeVisible();
    }
    // CodeMirror's injected stylesheet carries the nonce, so the editor is styled.
    const gutter = await page.locator('.cm-gutters').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(gutter).not.toBe('rgba(0, 0, 0, 0)');

    await page.goto('/s/handbook/index.md');
    await expect(page.getByRole('article').first()).toBeVisible();
    // Modal dialog: the scroll lock injects a nonce-tagged <style>.
    await page.getByRole('button', { name: 'New page' }).click();
    await expect(page.getByRole('dialog', { name: 'New page' })).toBeVisible();
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(true);
    // The lock's <style> is applied (a blocked style would not show up as a violation event
    // when a library fills an already inserted element, so check the effect).
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'More page actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete page…' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /^Account:/ }).click();
    await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'History' }).hover();
    await page.getByRole('button', { name: 'More page actions' }).hover();
    await expect(page.getByRole('tooltip')).toBeVisible();

    await page.setViewportSize(viewports.medium);
    await page.getByRole('button', { name: /^Discussions \(\d+\)$/ }).click();
    await expect(page.getByRole('dialog', { name: 'Discussions' })).toBeVisible();
    await page.setViewportSize(viewports.narrow);
    await page.goto('/s/handbook/index.md');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Space navigation' })).toBeVisible();

    expect(await violations()).toEqual([]);
  });

  test('the visual editor works without a CSP violation (007 T057)', async ({ page }) => {
    const violations = await collectCspViolations(page);
    await signIn(page, 'alice', { editorMode: 'visual' });
    const editor = page.getByRole('textbox', { name: 'Page content', exact: true });

    // Diagrams are drawn by the isolated renderer inside the editor.
    await page.goto('/s/visual/-/edit/mermaid.md');
    await expect(editor.getByRole('figure', { name: 'Diagram (graph)' }).getByRole('img')).toBeVisible();
    // ProseMirror's stylesheet is bundled, so the editor is styled (its white-space rule applies).
    expect(['pre-wrap', 'break-spaces']).toContain(await editor.evaluate((el) => getComputedStyle(el).whiteSpace));

    await page.goto('/s/visual/-/edit/hostile.md');
    await expect(editor.getByRole('group', { name: /^HTML block/ }).first()).toBeVisible();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/tab');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.type('bold cell');
    await editor.evaluate((target) => {
      const transfer = new DataTransfer();
      transfer.setData('text/html', '<p style="color:red" onclick="window.__pwned=true">pasted <b>text</b></p><style>body{display:none}</style>');
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
    await expect(editor).toContainText('pasted text');

    expect(await violations()).toEqual([]);
  });
});
