import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { remoteLog, signIn, state } from './helpers';
import { collectCspViolations } from './ui-helpers';

const here = dirname(fileURLToPath(import.meta.url));
// 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// specs/007-wysiwyg-editor/quickstart.md, scenarios W1–W18 (automated parts). The `visual`
// space ("Visual Lab") holds the corpus fixtures, committed byte for byte by server.mjs.

/** A page file exactly as committed (no trimming: line endings and final newlines matter). */
function rawFile(path: string): string {
  const result = spawnSync('git', ['show', `main:${path}`], { cwd: state().visual.bare, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

const commits = () => remoteLog(state().visual).length;
const editor = (page: Page) => page.getByRole('textbox', { name: 'Page content', exact: true });

async function openEditor(page: Page, path: string) {
  await page.goto(`/s/visual/-/edit/${path}`);
  await expect(editor(page)).toBeVisible();
}

/** Puts the caret right after the first occurrence of `text` in the visual editor. */
async function caretAfter(page: Page, text: string) {
  await editor(page).evaluate((root, needle) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(needle);
      if (at >= 0) {
        (root as HTMLElement).focus();
        const range = document.createRange();
        range.setStart(node, at + needle.length);
        range.collapse(true);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
    }
    throw new Error(`text not found: ${needle}`);
  }, text);
  // Let ProseMirror pick up the DOM selection.
  await page.waitForTimeout(50);
}

/** Selects the first occurrence of `text`. */
async function select(page: Page, text: string) {
  await editor(page).evaluate((root, needle) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(needle);
      if (at >= 0) {
        (root as HTMLElement).focus();
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
    }
    throw new Error(`text not found: ${needle}`);
  }, text);
  await page.waitForTimeout(50);
}

async function save(page: Page, message: string) {
  await page.getByLabel('Change description').fill(message);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).not.toHaveURL(/\/-\/edit\//);
}

test.describe.serial('007 — visual page editor', () => {
  test('W1: a new user gets the visual editor, showing the page formatted', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: null });
    await openEditor(page, 'plain.md');
    await expect(page.getByRole('radio', { name: 'Visual' })).toHaveAttribute('aria-checked', 'true');
    await expect(editor(page).getByRole('heading', { level: 1, name: 'Plain page' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveCount(0);
  });

  test('W2: formatting with the toolbar and typing shortcuts, saved as one commit', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'plain.md');
    await select(page, 'plain');
    await page.getByRole('button', { name: 'Bold' }).click();
    await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await caretAfter(page, 'Second paragraph.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## New heading');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- item one');
    await expect(editor(page).getByRole('heading', { level: 2, name: 'New heading' })).toBeVisible();

    const before = commits();
    await save(page, 'Format the plain page');
    expect(commits()).toBe(before + 1);
    expect(remoteLog(state().visual)[0]).toMatchObject({ author: 'Alice Example', message: 'Format the plain page' });
    expect(rawFile('plain.md')).toBe(
      '# Plain page\n\nFirst paragraph of a **plain** page.\n\nSecond paragraph.\n\n## New heading\n\n- item one\n',
    );
  });

  test('W3: the "/" menu inserts a table; Tab moves between cells', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'index.md');
    await caretAfter(page, 'Pages for the visual editor tests.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/tab');
    const menu = page.getByRole('listbox', { name: 'Insert block' });
    await expect(menu.getByRole('option', { name: 'Table' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await page.keyboard.type('Name');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Value');
    await save(page, 'Add a table');
    expect(rawFile('index.md')).toBe('# Visual Lab\n\nPages for the visual editor tests.\n\n| Name | Value |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n');
  });

  test('W4: saving without changes creates no commit', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'hand-wrapped-crlf.md');
    const before = commits();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('No changes to save').first()).toBeVisible();
    await expect(page).toHaveURL(/\/-\/edit\//);
    expect(commits()).toBe(before);
  });

  test('W5: one changed word changes one line, CRLF intact, and can be reviewed first', async ({ page }) => {
    const original = rawFile('hand-wrapped-crlf.md');
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'hand-wrapped-crlf.md');
    await caretAfter(page, 'readability');
    await page.keyboard.type('!');
    await page.getByRole('button', { name: 'Review changes' }).click();
    const dialog = page.getByRole('dialog', { name: 'Review changes' });
    await expect(dialog).toContainText('readability!');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await save(page, 'Emphasise readability');
    const saved = rawFile('hand-wrapped-crlf.md');
    expect(saved).toBe(original.replace('readability;', 'readability!;'));
    expect(saved.split('\r\n').length).toBe(original.split('\r\n').length);
  });

  test('W6: editing a list item and adding one keeps the other items and the * marker', async ({ page }) => {
    const original = rawFile('star-bullets-underscore.md');
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'star-bullets-underscore.md');
    await caretAfter(page, 'Tag the release');
    await page.keyboard.type('s');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Announce it');
    await save(page, 'Extend the checklist');
    expect(rawFile('star-bullets-underscore.md')).toBe(original.replace('* Tag the release\n', '* Tag the releases\n* Announce it\n'));
  });

  test('W7: unsupported Markdown shows as placeholders and is kept byte for byte', async ({ page }) => {
    const original = rawFile('toc-html-frontmatter.md');
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'toc-html-frontmatter.md');
    for (const name of [/^Front matter/, /^Table of contents/, /^HTML block/, /^HTML comment/]) {
      await expect(editor(page).getByRole('group', { name }).first()).toBeVisible();
    }
    await caretAfter(page, 'Welcome');
    await page.keyboard.type(',');
    await save(page, 'Punctuation');
    expect(rawFile('toc-html-frontmatter.md')).toBe(original.replace('Welcome to the team!', 'Welcome, to the team!'));
  });

  test('W9: edits made in both modes are all kept, and the last mode is remembered', async ({ page }) => {
    const original = rawFile('plain.md');
    await signIn(page, 'alice', { editorMode: null });
    await openEditor(page, 'plain.md');
    await caretAfter(page, 'item one');
    await page.keyboard.type(' A');

    await page.getByRole('radio', { name: 'Markdown' }).click();
    const source = page.getByRole('textbox', { name: 'Page content (Markdown)' });
    await expect(source).toContainText('- item one A');
    await source.click();
    await page.keyboard.press('ControlOrMeta+End');
    // insertText drops a leading line break in CodeMirror; type it as a key press instead.
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Typed *in*   markdown');

    await page.getByRole('radio', { name: 'Visual' }).click();
    await expect(editor(page)).toContainText('Typed in markdown');
    await caretAfter(page, 'Second paragraph.');
    await page.keyboard.type(' C');
    await save(page, 'Edit in both modes');

    expect(rawFile('plain.md')).toBe(
      original.replace('Second paragraph.', 'Second paragraph. C').replace('- item one\n', '- item one A\n') + '\nTyped *in*   markdown',
    );

    await openEditor(page, 'index.md');
    await expect(page.getByRole('radio', { name: 'Visual' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('copernica.editorMode'))).toBe('visual');
  });

  test('W10: a page the visual editor cannot keep exactly opens in Markdown mode', async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __copernicaVisualGuard?: boolean }).__copernicaVisualGuard = false;
    });
    await signIn(page, 'alice', { editorMode: null });
    await page.goto('/s/visual/-/edit/plain.md');
    await expect(page.getByText("This page uses Markdown the visual editor can't edit safely, so it opened in Markdown mode.")).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Page content (Markdown)' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Markdown' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('copernica.editorMode'))).toBeNull();
  });

  test('W8: undoing every edit leaves nothing to save', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'mermaid.md');
    await caretAfter(page, 'gateway first.');
    await page.keyboard.type(' More words.');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ControlOrMeta+z');
    const before = commits();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('No changes to save').first()).toBeVisible();
    expect(commits()).toBe(before);
  });

  test('W11: a pasted screenshot is described, shown in place and committed with the page', async ({ page }) => {
    const original = rawFile('bom-no-final-newline.md');
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'bom-no-final-newline.md');
    await caretAfter(page, 'at the start.');
    await editor(page).evaluate((target, base64) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }));
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, PNG);
    const dialog = page.getByRole('dialog', { name: /Describe the image/ });
    await dialog.getByLabel('Description', { exact: true }).fill('Login screen');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(editor(page).getByRole('img', { name: 'Login screen' })).toBeVisible();
    await save(page, 'Add a screenshot');

    const saved = rawFile('bom-no-final-newline.md');
    const link = /!\[Login screen\]\((\.attachments\/image-[^)]+\.png)\)/.exec(saved);
    expect(link).not.toBeNull();
    expect(saved).toBe(original.replace('at the start.', `at the start.${link![0]}`));
    const files = spawnSync('git', ['show', '--name-only', '--format=', 'main'], { cwd: state().visual.bare, encoding: 'utf8' }).stdout.trim().split('\n');
    expect(files.sort()).toEqual([link![1], 'bom-no-final-newline.md'].sort());
  });

  test('W12: a diagram inserted from the "/" menu is drawn; unedited diagrams stay as written', async ({ page }) => {
    const original = rawFile('mermaid.md');
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'mermaid.md');
    await expect(editor(page).getByRole('figure', { name: 'Diagram (graph)' }).getByRole('img')).toBeVisible();
    await caretAfter(page, 'Text after the diagrams.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/diagram');
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Edit diagram' });
    const source = dialog.getByRole('textbox', { name: 'Diagram source' });
    await source.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText('flowchart LR');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('X --> Y');
    await expect(dialog.getByRole('img', { name: 'Diagram (flowchart)' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(editor(page).getByRole('figure', { name: 'Diagram (flowchart)' }).getByRole('img')).toBeVisible();
    await save(page, 'Add a diagram');
    expect(rawFile('mermaid.md')).toBe(`${original}\n\`\`\`mermaid\nflowchart LR\nX --> Y\n\`\`\`\n`);
  });

  test('W13: Ctrl+K links to a page picked by its title; the link opens that page', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'index.md');
    await caretAfter(page, 'Pages for the visual editor tests.');
    await page.keyboard.type(' See ');
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: 'Insert link' });
    await dialog.getByRole('combobox', { name: 'Find a page' }).fill('target');
    await expect(dialog.getByRole('option', { name: /Target page/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(editor(page).getByRole('link', { name: 'Target page' })).toBeVisible();
    await save(page, 'Link the target page');

    expect(rawFile('index.md')).toContain('Pages for the visual editor tests. See [Target page](guides/target-page.md)\n');
    await page.getByRole('article').getByRole('link', { name: 'Target page' }).click();
    await expect(page).toHaveURL(/\/s\/visual\/guides\/target-page\.md$/);
  });

  test('W14: content pasted from Word keeps its structure and nothing else', async ({ page }) => {
    const html = readFileSync(join(here, 'fixtures/word-paste.html'), 'utf8');
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'plain.md');
    await caretAfter(page, 'Second paragraph. C');
    await page.keyboard.press('Enter');
    await editor(page).evaluate((target, content) => {
      const transfer = new DataTransfer();
      transfer.setData('text/html', content);
      transfer.setData('text/plain', 'Quarterly review');
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, html);
    await expect(page.getByRole('status').filter({ hasText: '1 image from other sites was not inserted' })).toHaveCount(1);
    await expect(editor(page).getByRole('heading', { name: 'Quarterly review' })).toBeVisible();
    await save(page, 'Paste the review');

    const saved = rawFile('plain.md');
    expect(saved).toContain('## Quarterly review');
    expect(saved).toContain('The review covers **revenue**, *costs* and the [annual plan](https://intranet.example.com/plan).');
    expect(saved).toContain('- Collect the numbers\n- Prepare the slides');
    expect(saved).toContain('| Team | Owner |');
    expect(saved).toContain('End of section.');
    expect(saved).not.toMatch(/mso|style=|<|onclick|__pwned|logo\.png/);
    expect(await page.evaluate(() => (window as { __pwned?: boolean }).__pwned)).toBeUndefined();
  });

  test('W15: a whole edit can be done with the keyboard only', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await page.goto('/s/visual/-/edit/containers-grid-deflist.md');
    await expect(editor(page)).toBeVisible();
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id ?? '');
    for (let i = 0; i < 40 && (await focused()) !== 'Page content'; i++) await page.keyboard.press('Tab');
    expect(await focused()).toBe('Page content');
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Keyboard **only** ');
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('target');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Insert link' })).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    for (let i = 0; i < 40 && (await focused()) !== 'change-message'; i++) await page.keyboard.press('Tab');
    expect(await focused()).toBe('change-message');
    await page.keyboard.type('Keyboard edit');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page).not.toHaveURL(/\/-\/edit\//);
    expect(rawFile('containers-grid-deflist.md')).toContain('The end.\n\nKeyboard **only** [Target page](guides/target-page.md)\n');
  });

  test('W16: single-key wiki shortcuts typed in the editor are just text', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'tables.md');
    await caretAfter(page, 'Environments');
    await page.keyboard.type(' e c ?');
    await expect(editor(page).getByRole('heading', { name: 'Environments e c ?' })).toBeVisible();
    await expect(page).toHaveURL(/\/-\/edit\/tables\.md$/);
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  });

  test('W17: a 100 KB page is ready to edit within a second and typing keeps up', async ({ page }) => {
    await signIn(page, 'alice', { editorMode: 'visual' });
    await page.goto('/s/visual/large.md');
    // The first render of a fresh test server's space can take a while; not part of the measurement.
    await expect(page.getByRole('article')).toContainText('Section 120', { timeout: 20_000 });
    // Warm the editor chunk once, as a returning user would have it cached.
    await openEditor(page, 'index.md');
    await page.goto('/s/visual/large.md');
    await expect(page.getByRole('article')).toContainText('Section 120');

    // Measured in the page, so the result does not depend on how often the test polls.
    await page.getByRole('article').click();
    await page.evaluate(() => {
      const w = window as unknown as { __start: number; __ready?: number };
      w.__start = performance.now();
      const observer = new MutationObserver(() => {
        const content = document.querySelector('[role="textbox"][aria-label="Page content"]');
        if (content?.textContent?.includes('Section 120')) {
          w.__ready = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.keyboard.press('e');
    await page.waitForFunction(() => (window as unknown as { __ready?: number }).__ready !== undefined);
    const ready = await page.evaluate(() => {
      const w = window as unknown as { __start: number; __ready: number };
      return w.__ready - w.__start;
    });
    expect(ready, 'editor ready (ms)').toBeLessThan(1_000);

    await caretAfter(page, 'paragraph 60 of a large page');
    const typed = await editor(page).evaluate(async (root) => {
      const times: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        document.execCommand('insertText', false, 'x');
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return { median: times[25]!, text: root.textContent ?? '' };
    });
    expect(typed.text).toContain('paragraph 60 of a large page' + 'x'.repeat(50));
    expect(typed.median, 'median time per character (ms)').toBeLessThan(50);
  });

  test('W18: hostile content is shown as text and runs nothing', async ({ page }) => {
    const violations = await collectCspViolations(page);
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol !== 'data:') external.push(request.url());
    });
    await signIn(page, 'alice', { editorMode: 'visual' });
    await openEditor(page, 'hostile.md');
    await expect(editor(page).getByRole('group', { name: /^HTML block/ }).first()).toBeVisible();
    await expect(editor(page).getByText('javascript link')).toBeVisible();
    expect(await editor(page).locator('a[href^="javascript:" i], a[href^="vbscript:" i], a[href^="data:" i]').count()).toBe(0);
    expect(await editor(page).locator('script, style, iframe, [onerror], [onclick]').count()).toBe(0);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as { __pwned?: boolean }).__pwned)).toBeUndefined();
    expect(await violations()).toEqual([]);
    expect(external).toEqual([]);
  });
});
