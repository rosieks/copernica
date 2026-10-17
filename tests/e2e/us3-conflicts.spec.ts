import { test, expect, type Page } from '@playwright/test';
import { pushOutside, remoteFile, replaceEditorText, signIn, state } from './helpers';

const ORIGINAL = '# Shared\n\nFirst section.\n\nSecond section.\n\nThird section.\n';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Page content (Markdown)' });

async function openEditor(page: Page) {
  await expect(async () => {
    await page.goto('/s/handbook/guides/shared.md');
    await page.getByRole('link', { name: 'Edit' }).click();
    // Wait until the wiki has synchronized the reset done in beforeEach.
    await expect(editorOf(page)).toContainText('Second section.', { timeout: 2_000 });
    await expect(editorOf(page)).not.toContainText('version', { timeout: 500 });
  }).toPass({ timeout: 30_000 });
}

async function editAndSave(page: Page, content: string, message: string) {
  await replaceEditorText(page, editorOf(page), content);
  await page.getByLabel('Change description').fill(message);
  await page.getByRole('button', { name: 'Save' }).click();
}

test.describe('US3 — concurrent edits never overwrite each other', () => {
  // Two browser contexts and real typing: WebKit on Windows needs more than the default 30 s.
  test.slow();

  test.beforeEach(() => {
    pushOutside(state().handbook, 'guides/shared.md', ORIGINAL, 'Reset shared page');
  });

  test('A9: non-overlapping edits are merged', async ({ browser }) => {
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, 'alice');
    await signIn(bob, 'bob');
    await openEditor(alice);
    await openEditor(bob);

    await editAndSave(alice, ORIGINAL.replace('First section.', 'First section by Alice.'), 'Alice edits first');
    await expect(alice.getByRole('article')).toContainText('First section by Alice.');

    await editAndSave(bob, ORIGINAL.replace('Third section.', 'Third section by Bob.'), 'Bob edits third');
    await expect(bob.getByRole('region', { name: /Notifications/ }).getByText('Saved — merged with changes by Alice Example')).toBeVisible();
    await expect(bob.getByRole('article')).toContainText('First section by Alice.');
    await expect(bob.getByRole('article')).toContainText('Third section by Bob.');
  });

  test('A10: overlapping edits show the conflict view and nothing is lost', async ({ browser }) => {
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, 'alice');
    await signIn(bob, 'bob');
    await openEditor(alice);
    await openEditor(bob);

    await editAndSave(alice, ORIGINAL.replace('Second section.', 'Second section, Alice version.'), 'Alice edits second');
    await expect(alice.getByRole('article')).toContainText('Alice version');

    await editAndSave(bob, ORIGINAL.replace('Second section.', 'Second section, Bob version.'), 'Bob edits second');
    await expect(bob.getByRole('heading', { name: 'This page was changed while you were editing' })).toBeVisible();
    await expect(bob.getByRole('alert')).toContainText('Alice Example');

    const resolved = ORIGINAL.replace('Second section.', 'Second section, Alice and Bob version.');
    await replaceEditorText(bob, bob.getByRole('textbox', { name: 'Resolved page content' }), resolved);
    await bob.getByRole('button', { name: 'Save resolution' }).click();

    await expect(bob.getByRole('article')).toContainText('Alice and Bob version');
    expect(remoteFile(state().handbook, 'guides/shared.md')).toContain('Second section, Alice and Bob version.');
  });

  test('A10: discarding keeps the text available to copy', async ({ browser }) => {
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, 'alice');
    await signIn(bob, 'bob');
    await openEditor(alice);
    await openEditor(bob);

    await editAndSave(alice, ORIGINAL.replace('Second section.', 'Alice text.'), 'Alice');
    await expect(alice.getByRole('article')).toContainText('Alice text.');
    await editAndSave(bob, ORIGINAL.replace('Second section.', 'Bob text worth keeping.'), 'Bob');
    await bob.getByRole('button', { name: 'Abandon edit…' }).click();
    await bob.getByRole('alertdialog').getByRole('button', { name: 'Abandon edit' }).click();

    await expect(bob.getByRole('textbox', { name: 'Your unsaved text' })).toHaveValue(/Bob text worth keeping\./);
  });

  test('A11: a commit pushed outside the wiki while editing is detected', async ({ page }) => {
    await signIn(page);
    await openEditor(page);
    pushOutside(state().handbook, 'guides/shared.md', ORIGINAL.replace('Second section.', 'Changed with git.'), 'Outside edit');

    await editAndSave(page, ORIGINAL.replace('Second section.', 'Changed in the wiki.'), 'Wiki edit');

    await expect(page.getByRole('heading', { name: 'This page was changed while you were editing' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Outsider');
  });
});
