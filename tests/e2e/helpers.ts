import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

interface Remote {
  bare: string;
  clone: string;
}

export function state(): { work: string; handbook: Remote; service: Remote } {
  return JSON.parse(readFileSync(join(here, '.e2e-state.json'), 'utf8'));
}

export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** Commits a change to the remote with plain git, as someone working outside the wiki would. */
export function pushOutside(remote: Remote, path: string, content: string, message = 'Outside change'): void {
  git(remote.clone, 'pull', '--quiet', remote.bare, 'main');
  mkdirSync(dirname(join(remote.clone, path)), { recursive: true });
  writeFileSync(join(remote.clone, path), content);
  git(remote.clone, 'add', '-A');
  git(remote.clone, '-c', 'user.name=Outsider', '-c', 'user.email=outside@example.test', 'commit', '--allow-empty', '-m', message);
  git(remote.clone, 'push', '--quiet', remote.bare, 'main');
}

export function remoteLog(remote: Remote, path?: string): { author: string; email: string; message: string }[] {
  const args = ['log', '--format=%an%x1f%ae%x1f%s', 'main'];
  if (path) args.push('--', path);
  return git(remote.bare, ...args)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [author = '', email = '', message = ''] = line.split('\x1f');
      return { author, email, message };
    });
}

export function remoteFile(remote: Remote, path: string): string {
  return git(remote.bare, 'show', `main:${path}`);
}

export async function signIn(page: Page, user: 'alice' | 'bob' = 'alice'): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('User name').fill(user);
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Copernica' })).toBeVisible();
}

/**
 * Replaces the whole content of a CodeMirror editor: select all, delete, then one native
 * `insertText` input event (per-key typing is very slow in WebKit on Windows).
 */
export async function replaceEditorText(page: Page, editor: Locator, text: string): Promise<void> {
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
  await expect(editor).toContainText(text.split('\n').filter(Boolean).at(-1) ?? '');
}
