import { renameSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { pushOutside, replaceEditorText, signIn, state } from './helpers';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Page content (Markdown)' });
const notifications = (page: Page) => page.getByRole('region', { name: /Notifications/ });

test.describe('002 US1 — always know the state of the page and of my changes', () => {
  test('V1: an older version is labelled and described, with a way back', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/-/history/guides/history.md');
    // Newest first: Linus (current), Grace, Ada.
    await page.getByRole('row').nth(2).getByRole('link', { name: /, version of / }).click();

    const indicator = page.getByRole('status').filter({ hasText: 'You are viewing an older version' });
    await expect(indicator).toContainText('by Grace');
    await expect(page.getByText(/Last changed by\s*Grace/)).toBeVisible();
    await indicator.getByRole('link', { name: 'Go to current version' }).click();
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/history\.md$/);
    await expect(page.getByText(/Last changed by\s*Linus/)).toBeVisible();
  });

  test('V2: a space that cannot be synchronized says so', async ({ page }) => {
    const { service } = state();
    await signIn(page);
    renameSync(service.bare, `${service.bare}.moved`);
    try {
      await expect(async () => {
        await page.goto('/s/service/api.md');
        await expect(page.getByRole('status').filter({ hasText: 'Content may be outdated.' })).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 45_000 });
    } finally {
      renameSync(`${service.bare}.moved`, service.bare);
    }
  });

  test('V3: read-only access is explained and editing is not offered', async ({ page }) => {
    await page.route('**/api/spaces', async (route) => {
      const response = await route.fetch();
      const spaces = (await response.json()) as { id: string; canWrite: boolean }[];
      await route.fulfill({ response, json: spaces.map((s) => (s.id === 'handbook' ? { ...s, canWrite: false } : s)) });
    });
    await signIn(page);
    await page.goto('/s/handbook/guides/setup.md');

    await expect(page.getByRole('status').filter({ hasText: 'Read only' })).toContainText('Access follows your repository permissions');
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await page.getByRole('article').click();
    await page.keyboard.press('e');
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/setup\.md$/);
  });

  test('V4: a successful save is confirmed for at least five seconds', async ({ page }) => {
    await signIn(page);
    const name = `guides/v4-${Date.now()}.md`;
    await page.goto(`/s/handbook/-/new/${name}`);
    await replaceEditorText(page, editorOf(page), '# Saved Notice\n\nHello.');
    await page.getByRole('button', { name: 'Save' }).click();

    const toast = notifications(page).getByText('Saved', { exact: true });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(4_500);
    await expect(toast).toBeVisible();
    await notifications(page).getByRole('button', { name: 'Dismiss' }).first().click();
    await expect(toast).toHaveCount(0);
  });

  test('V5: a merged save names the other author', async ({ browser }) => {
    test.slow();
    const original = '# Merge Notice\n\nFirst section.\n\nSecond section.\n\nThird section.\n';
    pushOutside(state().handbook, 'guides/merge-notice.md', original, 'Reset merge notice');
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, 'alice');
    await signIn(bob, 'bob');
    for (const page of [alice, bob]) {
      await expect(async () => {
        await page.goto('/s/handbook/-/edit/guides/merge-notice.md');
        await expect(editorOf(page)).toContainText('Third section.', { timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
    }

    await replaceEditorText(alice, editorOf(alice), original.replace('First section.', 'First, by Alice.'));
    await alice.getByLabel('Change description').fill('Alice edit');
    await alice.getByRole('button', { name: 'Save' }).click();
    await expect(alice.getByRole('article')).toContainText('First, by Alice.');

    await replaceEditorText(bob, editorOf(bob), original.replace('Third section.', 'Third, by Bob.'));
    await bob.getByLabel('Change description').fill('Bob edit');
    await bob.getByRole('button', { name: 'Save' }).click();
    await expect(notifications(bob).getByText('Saved — merged with changes by Alice Example')).toBeVisible();
  });

  test('V6: a rejected save keeps the text and explains why until dismissed', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/-/edit/guides/setup.md');
    await expect(editorOf(page)).toContainText('Setup');
    await page.route('**/api/spaces/handbook/pages/**', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            status: 403,
            contentType: 'application/problem+json',
            body: JSON.stringify({ type: 'urn:copernica:problem:push-rejected', title: 'The push was rejected.', detail: 'Branch main is protected.' }),
          })
        : route.continue(),
    );
    await replaceEditorText(page, editorOf(page), '# Setup\n\nText worth keeping.');
    await page.getByLabel('Change description').fill('Try');
    await page.getByRole('button', { name: 'Save' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'Your change was not saved.' });
    await expect(alert).toContainText('Branch main is protected.');
    await expect(editorOf(page)).toContainText('Text worth keeping.');
    await page.waitForTimeout(6_000);
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'Dismiss' }).click();
    await expect(alert).toHaveCount(0);
  });
});
