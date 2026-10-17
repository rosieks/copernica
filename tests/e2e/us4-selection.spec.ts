import { test, expect, type Page } from '@playwright/test';
import { pushOutside, signIn, state } from './helpers';

// Filler paragraphs keep the two fragments far enough apart that each thread can sit beside its text.
const FILLER = Array.from({ length: 8 }, (_, i) => `Filler paragraph ${i + 1} keeps some distance between the discussed fragments.`).join('\n\n');
const PAGE = `# Selection\n\nThe quick brown fox jumps over the lazy dog.\n\n${FILLER}\n\nA second paragraph for the keyboard test.\n`;

/** Selects `text` inside the page article (or, with `extendInto`, up to the navigation). */
async function selectText(page: Page, text: string, extendInto?: string) {
  await page.evaluate(
    ([wanted, other]) => {
      const article = document.querySelector('article.prose')!;
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node as Text).data.indexOf(wanted!);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        if (other) {
          const target = document.querySelector(other)!;
          range.setEnd(target, target.childNodes.length);
        } else {
          range.setEnd(node, index + wanted!.length);
        }
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      throw new Error(`Text not found: ${wanted}`);
    },
    [text, extendInto] as const,
  );
}

async function openPage(page: Page) {
  await expect(async () => {
    await page.goto('/s/handbook/guides/selection.md');
    await expect(page.getByRole('article').first()).toContainText('lazy dog', { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('002 US4 — comment on a text selection', () => {
  test.beforeAll(() => {
    pushOutside(state().handbook, 'guides/selection.md', PAGE, 'Reset selection page');
  });

  test('V14/V15: the Comment action appears next to a selection and posts in two steps', async ({ page }) => {
    await signIn(page);
    await openPage(page);
    const started = Date.now();

    await selectText(page, 'brown fox');
    const action = page.getByRole('dialog', { name: 'Selection actions' }).getByRole('button', { name: 'Comment' });
    await expect(action).toBeVisible();
    await expect(action).not.toBeFocused();

    await action.click();
    await page.getByLabel('Comment', { exact: true }).fill('Which fox?');
    await page.keyboard.press('ControlOrMeta+Enter');

    await expect(page.getByRole('article', { name: /Discussion about “brown fox”/ })).toContainText('Which fox?');
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test('V15 (margin): on wide screens a thread sits beside its fragment; one scrollbar', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signIn(page);
    await openPage(page);
    await selectText(page, 'second paragraph');
    await page.getByRole('dialog', { name: 'Selection actions' }).getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment', { exact: true }).fill('Margin check');
    await page.keyboard.press('ControlOrMeta+Enter');

    const thread = page.getByRole('article', { name: /Discussion about “second paragraph”/ });
    await expect(thread).toContainText('Margin check');
    await expect
      .poll(async () => {
        const threadTop = (await thread.boundingBox())!.y;
        const fragmentTop = await page.evaluate(() => {
          const article = document.querySelector('article.prose')!;
          const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const i = (node as Text).data.indexOf('second paragraph');
            if (i >= 0) {
              const range = document.createRange();
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              return range.getBoundingClientRect().top;
            }
          }
          return -1;
        });
        return Math.abs(threadTop - fragmentTop);
      })
      .toBeLessThan(24);

    const aside = page.getByRole('complementary', { name: 'Discussions' });
    expect(await aside.evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
  });

  test('V16: keyboard users comment with the c shortcut', async ({ page }) => {
    await signIn(page);
    await openPage(page);
    await selectText(page, 'second paragraph');
    await page.keyboard.press('c');
    await expect(page.getByRole('form', { name: 'New discussion' })).toContainText('second paragraph');
  });

  test('V17: no action across the article boundary; Escape and clearing close it', async ({ page }) => {
    await signIn(page);
    await openPage(page);
    const popover = page.getByRole('dialog', { name: 'Selection actions' });

    await selectText(page, 'quick', '.space-nav__title');
    await expect(popover).toHaveCount(0);

    await selectText(page, 'quick');
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);

    await selectText(page, 'lazy dog');
    await expect(popover).toBeVisible();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await expect(popover).toHaveCount(0);
  });
});

test.describe('002 US4 — touch', () => {
  test.use({ hasTouch: true, isMobile: false, viewport: { width: 412, height: 915 } });

  test('V18: on coarse pointers the action sits below the selection', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox does not emulate touch/coarse pointers.');
    await signIn(page);
    await openPage(page);
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    test.skip(!coarse, 'This browser does not report a coarse pointer in emulation.');
    await selectText(page, 'brown fox');
    const popover = page.getByRole('dialog', { name: 'Selection actions' });
    await expect(popover).toBeVisible();
    const selectionBottom = await page.evaluate(() => window.getSelection()!.getRangeAt(0).getBoundingClientRect().bottom);
    const box = await popover.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(selectionBottom);
  });
});
