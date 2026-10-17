import { test, expect, type Page } from '@playwright/test';
import { git, pushOutside, signIn, state } from './helpers';

const INDEX =
  '# Team Handbook\n\nWelcome. See [setup](guides/setup.md) and [the API](wiki:service/api.md).\n\n' +
  'This sentence is about onboarding new colleagues.\n\nAnother paragraph about the release process.\n';

/** Selects the first occurrence of `text` inside the page article. */
async function selectText(page: Page, text: string) {
  await page.getByRole('article').first().evaluate((article, wanted) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = (node as Text).data.indexOf(wanted);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + wanted.length);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
    }
    throw new Error(`Text not found: ${wanted}`);
  }, text);
}

async function openIndex(page: Page) {
  await expect(async () => {
    await page.goto('/s/handbook/index.md');
    await expect(page.getByRole('article').first()).toContainText('onboarding new colleagues', { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('US4 — discuss specific fragments of a page', () => {
  // Two browser contexts and real typing: WebKit on Windows needs more than the default 30 s.
  test.slow();

  test.beforeAll(() => {
    pushOutside(state().handbook, 'index.md', INDEX, 'Reset index');
  });

  test('A12: start, reply, edit, resolve and reopen a discussion', async ({ browser }) => {
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, 'alice');
    await signIn(bob, 'bob');
    await openIndex(alice);

    await selectText(alice, 'onboarding new colleagues');
    await alice.getByRole('button', { name: 'Comment on selection' }).click();
    await alice.getByLabel('Comment', { exact: true }).fill('Do we have a checklist for this?');
    await alice.getByRole('form', { name: 'New discussion' }).getByRole('button', { name: 'Comment', exact: true }).click();
    const thread = alice.getByRole('article', { name: /Discussion about “onboarding new colleagues”/ });
    await expect(thread).toContainText('Do we have a checklist for this?');
    expect(await alice.evaluate(() => CSS.highlights.has('discussion') || CSS.highlights.has('discussion-active'))).toBe(true);

    await openIndex(bob);
    const bobThread = bob.getByRole('article', { name: /Discussion about “onboarding new colleagues”/ });
    await bobThread.getByLabel('Reply').fill('Yes, in the HR space.');
    await bobThread.getByRole('button', { name: 'Reply' }).click();
    await expect(bobThread).toContainText('Yes, in the HR space.');

    await alice.reload();
    const comments = thread.locator('.comment');
    await expect(comments).toHaveCount(2);
    await expect(comments.nth(1)).toContainText('Bob Example');
    await comments.nth(0).getByRole('button', { name: 'Comment actions' }).click();
    await alice.getByRole('menuitem', { name: 'Edit' }).click();
    await alice.getByLabel('Edit comment').fill('Do we have an onboarding checklist?');
    await alice.getByRole('button', { name: 'Save' }).click();
    await expect(comments.nth(0)).toContainText('edited');
    await expect(comments.nth(1).getByRole('button', { name: 'Comment actions' })).toHaveCount(0);

    await thread.getByRole('button', { name: 'Resolve' }).click();
    await expect(thread).toHaveCount(0);
    await alice.getByRole('radiogroup', { name: 'Show discussions' }).getByRole('radio', { name: 'Resolved' }).click();
    await expect(thread).toContainText('Resolved by Alice Example');
    await thread.getByRole('button', { name: 'Reopen' }).click();
    await alice.getByRole('radiogroup', { name: 'Show discussions' }).getByRole('radio', { name: 'Open' }).click();
    await expect(thread).toBeVisible();
  });

  test('A13: discussions follow their text and become outdated when it is removed', async ({ page }) => {
    await signIn(page);
    await openIndex(page);
    await selectText(page, 'the release process');
    await page.getByRole('button', { name: 'Comment on selection' }).click();
    await page.getByLabel('Comment', { exact: true }).fill('Link the release checklist here.');
    await page.getByRole('form', { name: 'New discussion' }).getByRole('button', { name: 'Comment', exact: true }).click();
    const thread = page.getByRole('article', { name: /Discussion about “the release process”/ });
    await expect(thread).toBeVisible();

    pushOutside(state().handbook, 'index.md', INDEX.replace('Welcome.', 'Welcome to the team! A new intro sentence.'), 'Edit intro');
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole('article').first()).toContainText('A new intro sentence', { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(thread).toBeVisible();
    await expect(thread).not.toContainText('Outdated');

    pushOutside(state().handbook, 'index.md', INDEX.replace('Another paragraph about the release process.\n', ''), 'Remove release paragraph');
    await expect(async () => {
      await page.reload();
      await expect(thread).toContainText('Outdated', { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(thread.locator('.discussion__quote')).toHaveText('the release process');
  });

  test('A14: discussion text never reaches the repository', async () => {
    const { handbook } = state();
    const log = git(handbook.bare, 'log', '-p', '--all');
    expect(log).not.toContain('Do we have a checklist');
    expect(log).not.toContain('Link the release checklist');
  });
});
