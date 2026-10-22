import { spawnSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { remoteLog, signIn, state } from './helpers';

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
});
