import { test, expect, type Page } from '@playwright/test';
import { scanWcag } from './a11y';
import { git, replaceEditorText, signIn, state } from './helpers';
import { expectNoReflow, viewports, withTheme } from './ui-helpers';
import { baseURL } from './env';

// specs/004-mermaid-diagrams/quickstart.md, D1–D13.

const drawn = (page: Page) => page.locator('article figure.diagram img.diagram__image');

// A first visit downloads the renderer (up to about 5 s in Firefox, research.md R4); the
// SC-002 timing is asserted separately in D1.
const DRAW_TIMEOUT = 15_000;

async function expectAllDrawn(page: Page, count: number) {
  await expect(drawn(page)).toHaveCount(count, { timeout: DRAW_TIMEOUT });
  await expect
    .poll(() => drawn(page).evaluateAll((images) => images.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length), { timeout: DRAW_TIMEOUT })
    .toBe(count);
}

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

test.describe('US8 diagrams', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('D1: every diagram type is drawn and the text does not wait for them', async ({ page }) => {
    // Hold the renderer back so the page is visibly readable before any diagram is drawn.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/diagram-renderer.html', async (route) => {
      await held;
      await route.continue();
    });

    await page.goto('/s/handbook/visuals/all-types.md');
    await expect(page.getByText('This text comes before the diagrams.')).toBeVisible();
    await expect(page.getByText('This sentence follows the diagrams.')).toBeVisible();
    await expect(page.locator('.diagram__loading').first()).toHaveText('Drawing diagram…');
    await expect(drawn(page)).toHaveCount(0);

    release();
    await expectAllDrawn(page, 8);
    await expect(page.locator('article pre.diagram__source').first()).toBeHidden();

    // SC-002 timing with the renderer cached (a first visit also downloads it; research.md R4).
    // Measured in the page on every frame: expect.poll backs off to 1 s intervals.
    const started = Date.now();
    await page.reload();
    await page.waitForFunction(
      () => {
        const images = [...document.querySelectorAll<HTMLImageElement>('article img.diagram__image')];
        return images.length === 8 && images.every((i) => i.complete && i.naturalWidth > 0);
      },
      undefined,
      { polling: 'raf' },
    );
    const elapsed = Date.now() - started;
    test.info().annotations.push({ type: 'diagrams drawn (cached renderer)', description: `${elapsed} ms` });
    // Playwright's WebKit on Windows is far slower than Safari and lands around 2.7–3.5 s here;
    // its time is recorded, not asserted (research.md R4, Timing).
    if (test.info().project.name !== 'webkit' || process.platform !== 'win32') {
      expect(elapsed, 'all diagrams drawn within 3 s').toBeLessThan(3_000);
    }
  });

  test('D2: accessible name and the links of a diagram', async ({ page }) => {
    await page.goto('/s/handbook/visuals/all-types.md');
    const flowchart = page.locator('figure.diagram').first();

    await expect(flowchart.getByRole('img')).toHaveAttribute('alt', 'Order flow. From cart to delivery');
    const links = flowchart.getByRole('list', { name: 'Links in this diagram' });
    await expect(links.getByRole('link', { name: 'Setup' })).toHaveAttribute('href', '/s/handbook/guides/setup.md');
    await links.getByRole('link', { name: 'Setup' }).click();
    await expect(page).toHaveURL(/\/s\/handbook\/guides\/setup\.md$/);
  });

  test('D3: Azure DevOps Wiki containers are drawn', async ({ page }) => {
    await page.goto('/s/handbook/visuals/ado.md');

    await expectAllDrawn(page, 1);
    await expect(page.getByText(':::')).toHaveCount(0);
  });

  test('D4: a broken diagram shows its error and source; the rest is drawn', async ({ page }) => {
    await page.goto('/s/handbook/visuals/broken.md');
    const [broken, valid] = [page.locator('figure.diagram').nth(0), page.locator('figure.diagram').nth(1)];

    await expect(broken.getByText('This diagram could not be drawn.')).toBeVisible();
    await expect(broken.locator('.diagram__message')).not.toBeEmpty();
    await expect(broken.locator('pre.diagram__source')).toBeVisible();
    await expect(valid.locator('img.diagram__image')).toBeVisible();
    await expect(page.getByText('The rest of the page is normal.')).toBeVisible();
  });

  test('D5: a diagram over the limit is not sent to the renderer', async ({ page }) => {
    let rendererRequested = false;
    page.on('request', (request) => {
      if (request.url().includes('/diagram-renderer.html')) rendererRequested = true;
    });
    await page.goto('/s/handbook/visuals/huge.md');

    await expect(page.getByText('This diagram is too large to draw (over 20 000 characters).')).toBeVisible();
    await expect(page.locator('pre.diagram__source')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(rendererRequested).toBe(false);
  });

  test('D6: diagrams are drawn in page versions', async ({ page }) => {
    const commit = git(state().handbook.bare, 'log', '-1', '--format=%H', 'main', '--', 'visuals/all-types.md').trim();
    await page.goto(`/s/handbook/-/version/${commit}/visuals/all-types.md`);

    await expectAllDrawn(page, 8);
  });

  test('D7: the preview draws diagrams while editing', async ({ page }) => {
    await page.setViewportSize(viewports.wide);
    await page.goto('/s/handbook/-/edit/visuals/ado.md');
    await page.getByRole('tab', { name: 'Split' }).click();
    const editor = page.getByRole('textbox', { name: 'Page content (Markdown)' });
    const preview = page.locator('.preview-pane');

    await replaceEditorText(page, editor, '# Preview\n\n```mermaid\nflowchart LR\n  P --> Q\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n');
    await expect(preview.locator('img.diagram__image')).toHaveCount(2, { timeout: 2_000 + 1_000 });

    await replaceEditorText(page, editor, '# Preview\n\n```mermaid\nflowchart LR\n  P --> --> Q ((\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n');
    await expect(preview.getByText('This diagram could not be drawn.')).toHaveCount(1);
    await expect(preview.locator('img.diagram__image')).toHaveCount(1);

    await replaceEditorText(page, editor, '# Preview\n\n```mermaid\nflowchart LR\n  P --> R\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n');
    await expect(preview.locator('img.diagram__image')).toHaveCount(2);
    await expect(preview.getByText('This diagram could not be drawn.')).toHaveCount(0);
  });

  test('D8: diagrams follow the theme', async ({ page }) => {
    await withTheme(page, 'light');
    await page.goto('/s/handbook/visuals/ado.md');
    await expectAllDrawn(page, 1);
    const lightSrc = await drawn(page).getAttribute('src');

    await withTheme(page, 'dark');
    await expect.poll(() => drawn(page).getAttribute('src')).not.toBe(lightSrc);
    await withTheme(page, 'light');
    await expect.poll(() => drawn(page).getAttribute('src')).toBe(lightSrc);
  });

  test('D9: a wide diagram fits the column and scrolls on its own at full size (320 px)', async ({ page }) => {
    await page.setViewportSize(viewports.narrow);
    await page.goto('/s/handbook/visuals/wide.md');
    await expectAllDrawn(page, 1);
    const figure = page.locator('figure.diagram');
    const scrolls = () => figure.evaluate((f) => f.scrollWidth > f.clientWidth);

    await expectNoReflow(page);
    expect(await scrolls()).toBe(false);

    // Keyboard, like D10: WebKit does not focus a button on click.
    await page.getByRole('button', { name: 'Show full size' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Fit to width' })).toBeFocused();
    await expectNoReflow(page);
    expect(await scrolls()).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Show full size' })).toBeFocused();
    expect(await scrolls()).toBe(false);
  });

  test('D9: a diagram that fits offers no size toggle', async ({ page }) => {
    await page.goto('/s/handbook/visuals/ado.md');
    await expectAllDrawn(page, 1);
    await expect(page.getByRole('button', { name: 'Show diagram source' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show full size' })).toHaveCount(0);
  });

  test('D10: the source toggle works with the keyboard', async ({ page }) => {
    await page.goto('/s/handbook/visuals/ado.md');
    await expectAllDrawn(page, 1);
    const toggle = page.getByRole('button', { name: 'Show diagram source' });

    await expect(page.locator('pre.diagram__source')).toBeHidden();
    await toggle.focus();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    const back = page.getByRole('button', { name: 'Show diagram' , exact: true });
    await expect(back).toBeFocused();
    await expect(back).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('pre.diagram__source')).toBeVisible();
    await expect(drawn(page)).toBeHidden();

    await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(drawn(page)).toBeVisible();
  });

  test('D11: hostile diagrams run nothing and load nothing', async ({ page, context }) => {
    const hosts = new Set<string>();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol !== 'data:') hosts.add(url.host);
    });
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto('/s/handbook/visuals/evil.md');
    await expect(page.locator('figure.diagram')).toHaveCount(6);
    // Every figure settles: drawn or an error callout.
    await expect
      .poll(() => page.locator('figure.diagram').evaluateAll((figures) => figures.filter((f) => f.querySelector('img.diagram__image, .diagram__callout')).length))
      .toBe(6);
    // Not `networkidle`: background polling can keep the network busy (flaky in Firefox).
    await page.waitForLoadState('load');

    expect(dialogs).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
    expect([...hosts]).toEqual([new URL(baseURL).host]);
    expect(await page.locator('article a[href^="javascript:" i]').count()).toBe(0);
  });

  test('D12: the renderer page has its own policy; the shell keeps its own', async ({ page }) => {
    const renderer = await page.request.get('/diagram-renderer.html');
    const shell = await page.request.get('/');

    expect(renderer.headers()['content-security-policy']).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'none'; " +
        "connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    );
    expect(renderer.headers()['x-frame-options']).toBe('SAMEORIGIN');
    expect(shell.headers()['content-security-policy']).toMatch(/style-src 'self' 'nonce-[^']+'; .*frame-ancestors 'none'/);
    expect(shell.headers()['x-frame-options']).toBe('DENY');
  });

  test('D13: a discussion after a diagram stays anchored', async ({ page }) => {
    await page.goto('/s/handbook/visuals/all-types.md');
    await expectAllDrawn(page, 8);

    await selectText(page, 'follows the diagrams');
    await page.getByRole('button', { name: 'Comment on selection' }).click();
    await page.getByLabel('Comment', { exact: true }).fill('Anchored after the diagrams.');
    await page.getByRole('form', { name: 'New discussion' }).getByRole('button', { name: 'Comment', exact: true }).click();
    const thread = page.getByRole('article', { name: /Discussion about “follows the diagrams”/ });
    await expect(thread).toBeVisible();

    await page.reload();
    await expectAllDrawn(page, 8);
    await expect(thread).toBeVisible();
    await expect(thread).not.toContainText(/no longer|outdated|could not be found/i);
    const highlighted = await page.evaluate(() => {
      const highlight = CSS.highlights.get('discussion') ?? CSS.highlights.get('discussion-active');
      return highlight ? [...highlight].map((r) => r.toString()).join('') : '';
    });
    expect(highlighted).toBe('follows the diagrams');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`D8: no WCAG violations with diagrams (${theme})`, async ({ browser }) => {
      await scanWcag(browser, '/s/handbook/visuals/all-types.md', {
        theme,
        width: viewports.wide.width,
        prepare: (page) => expectAllDrawn(page, 8),
      });
    });
  }
});
