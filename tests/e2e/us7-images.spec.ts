import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { git, pushOutside, remoteFile, replaceEditorText, signIn, state } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures/images', name)).toString('base64');

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Page content (Markdown)' });
const describeDialog = (page: Page) => page.getByRole('dialog', { name: /Describe the image/ });

interface FileSpec {
  name: string;
  base64: string;
  type: string;
}

/** Simulates pasting files from the clipboard into the editor. */
async function paste(page: Page, files: FileSpec[]) {
  await editorOf(page).evaluate((target, specs) => {
    const transfer = new DataTransfer();
    for (const spec of specs) {
      const bytes = Uint8Array.from(atob(spec.base64), (c) => c.charCodeAt(0));
      transfer.items.add(new File([bytes], spec.name, { type: spec.type }));
    }
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, files);
}

/** Simulates dropping files onto the editor, at its first line. */
async function drop(page: Page, files: FileSpec[]) {
  await editorOf(page).evaluate((target, specs) => {
    const transfer = new DataTransfer();
    for (const spec of specs) {
      const bytes = Uint8Array.from(atob(spec.base64), (c) => c.charCodeAt(0));
      transfer.items.add(new File([bytes], spec.name, { type: spec.type }));
    }
    const box = target.getBoundingClientRect();
    const init = { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: box.left + 5, clientY: box.top + 5 };
    target.dispatchEvent(new DragEvent('dragover', init));
    target.dispatchEvent(new DragEvent('drop', init));
  }, files);
}

const png = (name = 'image.png'): FileSpec => ({ name, base64: fixture('screenshot.png'), type: 'image/png' });

async function openEditor(page: Page, path: string, content: string) {
  pushOutside(state().handbook, path, content, `Reset ${path}`);
  await expect(async () => {
    await page.goto(`/s/handbook/-/edit/${path}`);
    await expect(editorOf(page)).toContainText(content.split('\n')[0]!, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  // Write tab: the editor and the preview tab are separate (keeps the tests independent of Split).
  await page.getByRole('tab', { name: 'Write' }).click();
  await page.getByRole('tab', { name: 'Write' }).press('Enter');
  await editorOf(page).click();
  await page.keyboard.press('ControlOrMeta+End');
}

async function describe(page: Page, text?: string) {
  const dialog = describeDialog(page);
  await expect(dialog).toBeVisible();
  const title = await dialog.getByRole('heading').first().textContent();
  if (text !== undefined) await dialog.getByLabel('Description', { exact: true }).fill(text);
  await dialog.getByRole('button', { name: 'Insert' }).click();
  // With several images the same dialog moves on to the next one ("2 of 2").
  await expect
    .poll(async () => ((await dialog.count()) === 0 ? 'closed' : await dialog.getByRole('heading').first().textContent()))
    .not.toBe(title);
}

async function save(page: Page, message: string) {
  await page.getByLabel('Change description').fill(message);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).not.toHaveURL(/\/-\/edit\//);
}

/** Files added and changed by the latest commit on the remote branch. */
function lastCommitFiles(): string[] {
  return git(state().handbook.bare, 'show', '--name-only', '--format=', 'main').split('\n').filter(Boolean);
}

test.describe('003 — paste and drop images', () => {
  test('P1/P3: a pasted image is described, previewed and saved in one commit with the page', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-1.md', '# Images one\n\nText.\n');

    await paste(page, [png()]);
    await describe(page, 'Login screen');
    await expect(editorOf(page)).toContainText('![Login screen](../.attachments/image-');
    await page.getByRole('tab', { name: 'Preview' }).click();
    await page.getByRole('tab', { name: 'Preview' }).press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Preview' }).locator('img[alt="Login screen"]')).toHaveJSProperty('complete', true);

    await save(page, 'Add login screenshot');
    const files = lastCommitFiles();
    expect(files).toContain('guides/images-1.md');
    expect(files.filter((f) => f.startsWith('.attachments/image-'))).toHaveLength(1);
    expect(git(state().handbook.bare, 'log', '-1', '--format=%an|%s', 'main')).toBe('Alice Example|Add login screenshot');
    const image = page.getByRole('article').locator('img[alt="Login screen"]');
    await expect(image).toBeVisible();
    expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test('P2: dropped files are inserted in order', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-2.md', '# Images two\n');

    await drop(page, [png('first.png'), { name: 'anim.gif', base64: fixture('anim.gif'), type: 'image/gif' }]);
    await describe(page);
    await describe(page);

    const text = await editorOf(page).textContent();
    expect(text).toMatch(/!\[First\]\(\.\.\/\.attachments\/first-[a-z2-7]{8}\.png\)[\s\S]*!\[Anim\]\(\.\.\/\.attachments\/anim-[a-z2-7]{8}\.gif\)/);
  });

  test('P4: an image whose reference was deleted is not committed', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-4.md', '# Images four\n');

    await paste(page, [png()]);
    await describe(page);
    await replaceEditorText(page, editorOf(page), '# Images four\n\nNo image after all.\n');
    await save(page, 'No image');

    expect(lastCommitFiles()).toEqual(['guides/images-4.md']);
  });

  test('P5: cancelling discards the images; nothing is committed', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-5.md', '# Images five\n');
    const before = git(state().handbook.bare, 'rev-parse', 'main');

    await paste(page, [png()]);
    await describe(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Images added in this edit will be discarded.');
    await confirm.getByRole('button', { name: 'Discard' }).click();

    expect(git(state().handbook.bare, 'rev-parse', 'main')).toBe(before);
  });

  test('P6: unsupported or too large files are refused with a reason', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-6.md', '# Images six\n');
    const big = Buffer.alloc(11 * 1024 * 1024);
    Buffer.from(fixture('screenshot.png'), 'base64').copy(big);

    await drop(page, [
      { name: 'fake.png', base64: fixture('fake.png'), type: 'image/png' },
      { name: 'big.png', base64: big.toString('base64'), type: 'image/png' },
      { name: 'notes.txt', base64: fixture('notes.txt'), type: 'text/plain' },
    ]);

    await expect(page.getByRole('alert').filter({ hasText: 'big.png was not added' })).toContainText('larger than 10 MB');
    await expect(page.getByRole('alert').filter({ hasText: 'notes.txt was not added' })).toContainText('PNG, JPEG, GIF, WebP and SVG');
    // fake.png passes the client check by name; the server rejects its content.
    await expect(page.getByRole('alert').filter({ hasText: 'fake.png was not added' })).toContainText('PNG, JPEG, GIF, WebP and SVG');
    await expect(editorOf(page)).not.toContainText('Uploading');
    await expect(editorOf(page)).not.toContainText('![');
  });

  test('P7: typing continues while an image uploads', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-7.md', '# Images seven\n');
    await page.route('**/uploads?**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await paste(page, [png('slow.png')]);
    await expect(page.locator('.page-edit__upload')).toContainText('Uploading slow.png');
    await page.keyboard.type(' typed during upload');
    await describe(page);

    await expect(editorOf(page)).toContainText('typed during upload');
    await expect(editorOf(page)).toContainText('](../.attachments/slow-');
  });

  test('P8: simultaneous pastes of the same name never collide', async ({ browser }) => {
    test.slow();
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, 'alice');
    await signIn(bob, 'bob');
    await openEditor(alice, 'guides/images-8a.md', '# Eight A\n');
    await openEditor(bob, 'guides/images-8b.md', '# Eight B\n');

    await Promise.all([paste(alice, [png()]), paste(bob, [png()])]);
    await describe(alice, 'From alice');
    await describe(bob, 'From bob');
    await save(alice, 'Alice image');
    await save(bob, 'Bob image');

    const a = remoteFile(state().handbook, 'guides/images-8a.md').match(/\.attachments\/[^)]+/)![0];
    const b = remoteFile(state().handbook, 'guides/images-8b.md').match(/\.attachments\/[^)]+/)![0];
    expect(a).not.toBe(b);
  });

  test('P9/P10: keyboard-only insertion with a description, and a decorative image', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-9.md', '# Images nine\n');

    const button = page.getByRole('button', { name: 'Insert image' });
    await button.focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await chooser).setFiles(join(here, 'fixtures/images/diagram.svg'));
    const dialog = describeDialog(page);
    await expect(dialog.getByLabel('Description', { exact: true })).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Architecture diagram');
    await page.keyboard.press('Enter');
    await expect(editorOf(page)).toBeFocused();

    await paste(page, [png('decor.png')]);
    await describeDialog(page).getByLabel('Decorative image (no description)').check();
    await describeDialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect(editorOf(page)).toContainText('![](../.attachments/decor-');

    await save(page, 'Add diagram');
    const svg = page.getByRole('article').locator('img[alt="Architecture diagram"]');
    await expect(svg).toBeVisible();
    const response = await page.request.get((await svg.getAttribute('src'))!);
    expect(response.headers()['content-security-policy']).toBe('sandbox');
  });

  test('P11: per-space locations (folder of the space, folder per page)', async ({ page }) => {
    await signIn(page);
    // service: Folder=docs, Attachments:Path=images
    pushOutside(state().service, 'docs/api.md', '# Payments API\n\nEndpoints.\n', 'Reset api');
    await expect(async () => {
      await page.goto('/s/service/-/edit/api.md');
      await expect(editorOf(page)).toContainText('Endpoints.', { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await editorOf(page).click();
    await paste(page, [png('flow.png')]);
    await describe(page, 'Flow');
    await expect(editorOf(page)).toContainText('![Flow](images/flow-');
    await save(page, 'Add flow');
    const files = git(state().service.bare, 'show', '--name-only', '--format=', 'main').split('\n').filter(Boolean);
    expect(files.some((f) => /^docs\/images\/flow-[a-z2-7]{8}\.png$/.test(f))).toBe(true);

    // notes: local repository, Attachments:Path={page}.assets
    await page.goto('/s/notes/-/new/guides/setup.md');
    await editorOf(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await paste(page, [png('step.png')]);
    await describe(page, 'Step');
    await expect(editorOf(page)).toContainText('![Step](setup.assets/step-');
    await save(page, 'Create setup');
    await expect(page.getByRole('article').locator('img[alt="Step"]')).toBeVisible();
  });

  test('P13: root-relative image links (Azure DevOps Wiki style) are displayed', async ({ page }) => {
    const { service } = state();
    // A binary file, so commit with plain git rather than pushOutside (which writes text).
    git(service.clone, 'pull', '--quiet', service.bare, 'main');
    mkdirSync(join(service.clone, 'docs/.attachments'), { recursive: true });
    writeFileSync(join(service.clone, 'docs/.attachments/ado.png'), Buffer.from(fixture('screenshot.png'), 'base64'));
    writeFileSync(join(service.clone, 'docs/ado.md'), '# From ADO\n\n![ado](/.attachments/ado.png)\n');
    git(service.clone, 'add', '-A');
    git(service.clone, '-c', 'user.name=Outsider', '-c', 'user.email=outside@example.test', 'commit', '-m', 'ADO page');
    git(service.clone, 'push', '--quiet', service.bare, 'main');

    await signIn(page);
    await expect(async () => {
      await page.goto('/s/service/ado.md');
      await expect(page.getByRole('article').locator('img[alt="ado"]')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    expect(await page.getByRole('article').locator('img[alt="ado"]').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test('P14: pending images survive a reload of the editor', async ({ page }) => {
    await signIn(page);
    await openEditor(page, 'guides/images-14.md', '# Images fourteen\n');

    await paste(page, [png()]);
    await describe(page, 'Kept');
    await page.reload();
    await expect(page.getByText('Your unsaved changes from earlier were restored.')).toBeVisible();
    await page.getByRole('tab', { name: 'Preview' }).click();
    await page.getByRole('tab', { name: 'Preview' }).press('Enter');
    await expect(page.getByRole('tabpanel', { name: 'Preview' }).locator('img[alt="Kept"]')).toHaveJSProperty('complete', true);

    await save(page, 'Kept image');
    expect(lastCommitFiles().some((f) => f.startsWith('.attachments/image-'))).toBe(true);
  });

  test('P15: nobody else can open a pending image', async ({ browser }) => {
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, 'alice');
    await signIn(bob, 'bob');
    await openEditor(alice, 'guides/images-15.md', '# Fifteen\n');

    const uploaded = alice.waitForResponse((r) => r.url().includes('/uploads?') && r.status() === 201);
    await paste(alice, [png()]);
    const { previewUrl } = (await (await uploaded).json()) as { previewUrl: string };

    expect((await alice.request.get(previewUrl)).status()).toBe(200);
    expect((await bob.request.get(previewUrl)).status()).toBe(404);
  });
});
