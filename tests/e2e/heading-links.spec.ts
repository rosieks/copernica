import { test, expect, type Page } from '@playwright/test';
import { git, signIn, state } from './helpers';

// 009 Links to headings (specs/009-heading-links/quickstart.md). The seeded page
// guides/sections.md and the links page guides/section-links.md come from server.mjs.

const SECTIONS = '/s/handbook/guides/sections.md';
const POLISH = '#za%C5%BC%C3%B3%C5%82%C4%87-g%C4%99%C5%9Bl%C4%85-ja%C5%BA%C5%84';

/** The heading's top edge, the sticky header's bottom edge and the viewport height. */
async function position(page: Page, id: string) {
  return page.evaluate((elementId) => {
    const heading = document.getElementById(elementId)!.getBoundingClientRect();
    const header = document.querySelector('.header')!.getBoundingClientRect();
    return { top: heading.top, headerBottom: header.bottom, viewport: window.innerHeight };
  }, id);
}

/** SC-004: fully visible below the header and within the top quarter of the reading area. */
async function expectInView(page: Page, id: string) {
  await expect(async () => {
    const { top, headerBottom, viewport } = await position(page, id);
    expect(top).toBeGreaterThanOrEqual(headerBottom - 1);
    expect(top).toBeLessThan(viewport / 4 + headerBottom);
  }).toPass({ timeout: 10_000 });
}

async function openSections(page: Page, hash = '') {
  await page.goto(SECTIONS + hash);
  await expect(page.getByRole('heading', { level: 1, name: 'Sections' })).toBeVisible();
}

test.describe('009 US1 — share a link to a section', () => {
  test('H1: every H1–H3 offers a copy-link button, H4 does not', async ({ page }) => {
    await signIn(page);
    await openSections(page);

    const article = page.getByRole('article').first();
    await expect(article.getByRole('button', { name: /^Copy link to section:/ })).toHaveCount(10);
    await expect(article.getByRole('button', { name: 'Copy link to section: Detail' })).toHaveCount(0);
    // The heading keeps its own name; the button is not part of it.
    await expect(article.getByRole('heading', { name: 'Setup', exact: true })).toHaveCount(3);

    const button = article.getByRole('button', { name: 'Copy link to section: Zażółć gęślą jaźń' });
    await expect(button).toHaveCSS('opacity', '0');
    await article.getByRole('heading', { name: 'Zażółć gęślą jaźń' }).hover();
    await expect(button).toHaveCSS('opacity', '1');
  });

  test('H2: the button copies the section link without moving the page', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page);
    await openSections(page);
    const article = page.getByRole('article').first();
    const button = article.getByRole('button', { name: 'Copy link to section: Zażółć gęślą jaźń' });
    await button.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);

    await button.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`${SECTIONS.replace(/\./g, '\\.')}${POLISH}$`));
    if (browserName === 'chromium') {
      await expect(page.getByRole('region', { name: /Notifications/ }).getByText('Link copied')).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    } else {
      // Without clipboard permission the dialog offers the link (research R7).
      const dialog = page.getByRole('dialog', { name: 'Copy link' }).or(page.getByRole('region', { name: /Notifications/ }).getByText('Link copied'));
      await expect(dialog.first()).toBeVisible();
    }
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(2);
  });

  test('H3: duplicate headings get distinct links that land on the right one', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are only grantable in Chromium.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page);
    await openSections(page);

    await page.getByRole('article').first().getByRole('button', { name: 'Copy link to section: Setup' }).nth(1).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/s\/handbook\/guides\/sections\.md#setup-1$/);

    const other = await context.newPage();
    await other.goto(copied);
    await expect(other.locator('#user-content-setup-1')).toBeFocused();
    await expectInView(other, 'user-content-setup-1');
  });
});

test.describe('009 US2 — section links inside the wiki', () => {
  test('N1: contents links, Back and Forward move between sections', async ({ page }) => {
    await signIn(page);
    await openSections(page);
    const article = page.getByRole('article').first();

    await article.getByRole('link', { name: 'Setup', exact: true }).click();
    await expect(page).toHaveURL(/#setup$/);
    await expectInView(page, 'user-content-setup');
    await expect(page.locator('#user-content-setup')).toBeFocused();

    await page.evaluate(() => window.scrollTo(0, 0));
    await article.getByRole('link', { name: 'Polish' }).click();
    await expectInView(page, 'user-content-zażółć-gęślą-jaźń');

    await page.goBack();
    await expect(page).toHaveURL(/#setup$/);
    await expectInView(page, 'user-content-setup');
    await page.goForward();
    await expectInView(page, 'user-content-zażółć-gęślą-jaźń');
  });

  test('N2: links from another page land on the section after images and diagrams load', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/section-links.md');
    await page.getByRole('article').first().getByRole('link', { name: 'Late layout' }).click();

    await expect(page).toHaveURL(/sections\.md#late-layout$/);
    await expect(page.getByRole('img', { name: 'Tall picture' })).toBeVisible();
    await expectInView(page, 'user-content-late-layout');
  });

  test('N3: a direct load lands on the section (SC-004)', async ({ page }) => {
    await signIn(page);
    await page.goto(SECTIONS + '#late-layout');
    await expectInView(page, 'user-content-late-layout');
    await expect(page.locator('#user-content-late-layout')).toBeFocused();
  });

  test('N4: Azure DevOps links land on the same heading (SC-003)', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/section-links.md');
    await page.getByRole('article').first().getByRole('link', { name: 'Azure DevOps form' }).click();

    await expectInView(page, 'user-content-interface-version-10');
    await page.goto(SECTIONS + '#design-%26-process');
    await expectInView(page, 'user-content-design--process');
  });

  test('N5: a missing section opens the page at the top and says so', async ({ page }) => {
    await signIn(page);
    await page.goto('/s/handbook/guides/section-links.md');
    await page.getByRole('article').first().getByRole('link', { name: 'Gone' }).click();

    await expect(page.getByRole('region', { name: /Notifications/ }).getByText('Section not found')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(5);
  });

  test('N6: earlier versions resolve their own sections', async ({ page }) => {
    const [, earlier] = git(state().handbook.bare, 'log', '--format=%H', 'main', '--', 'guides/sections.md').split('\n');
    await signIn(page);

    await page.goto(`/s/handbook/-/version/${earlier}/guides/sections.md#setup-2`);
    await expectInView(page, 'user-content-setup-2');

    await page.goto(`/s/handbook/-/version/${earlier}/guides/sections.md#appendix`);
    await expect(page.getByRole('region', { name: /Notifications/ }).getByText('Section not found')).toBeVisible();
    await page.goto(SECTIONS + '#appendix');
    await expectInView(page, 'user-content-appendix');
  });

  test('N7: a heading named "main" does not take over the skip link', async ({ page }) => {
    await signIn(page);
    await page.goto(SECTIONS + '#main');
    await expectInView(page, 'user-content-main');
    await expect(page.locator('main#main')).toHaveCount(1);

    await page.goto(SECTIONS);
    await expect(page.getByRole('heading', { level: 1, name: 'Sections' })).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
    expect(page.url()).not.toContain('#');
  });

  test('N8: footnote links move within the page', async ({ page }) => {
    await signIn(page);
    await openSections(page);
    await page.getByRole('article').first().locator('a[href="#fn:1"]').click();
    await expect(page).toHaveURL(/#fn:1$/);
    // The notes are at the end of the page, so they are scrolled into view rather than to the top.
    await expect(page.locator('[id="user-content-fn:1"]')).toBeInViewport();
    await page.getByRole('article').first().locator('a[href="#fnref:1"]').click();
    await expect(page.locator('[id="user-content-fnref:1"]')).toBeInViewport();
  });
});
