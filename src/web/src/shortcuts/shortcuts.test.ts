// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { matchShortcut, readSingleKeyShortcuts, SINGLE_KEY_STORAGE_KEY, writeSingleKeyShortcuts, type Shortcut } from './index';

const edit: Shortcut = { key: 'e', single: true, label: 'e', description: 'Edit', group: 'Page', handler: () => {} };
const help: Shortcut = { key: '?', single: true, label: '?', description: 'Help', group: 'Global', handler: () => {} };
const save: Shortcut = { key: 's', single: false, label: 'Ctrl/⌘ S', description: 'Save', group: 'Editor', handler: () => {} };
const all = [edit, help, save];

function keydown(key: string, target: Element = document.body, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function element(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!.querySelector('[data-target]') ?? document.body.firstElementChild!;
}

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('matchShortcut', () => {
  it('fires single-key shortcuts on the page', () => {
    expect(matchShortcut(keydown('e'), all, true)).toBe(edit);
    expect(matchShortcut(keydown('?', document.body, { shiftKey: true }), all, true)).toBe(help);
  });

  it.each([
    ['input', '<input />'],
    ['textarea', '<textarea></textarea>'],
    ['select', '<select></select>'],
    ['contenteditable', '<div contenteditable="true"></div>'],
    ['CodeMirror', '<div class="cm-editor"><div class="cm-content" data-target></div></div>'],
    ['dialog', '<div role="dialog"><button data-target>x</button></div>'],
  ])('ignores single-key shortcuts in %s', (_, html) => {
    expect(matchShortcut(keydown('e', element(html)), all, true)).toBeUndefined();
  });

  it('ignores single-key shortcuts with modifiers or during IME composition', () => {
    expect(matchShortcut(keydown('e', document.body, { ctrlKey: true }), all, true)).toBeUndefined();
    expect(matchShortcut(keydown('e', document.body, { altKey: true }), all, true)).toBeUndefined();
    expect(matchShortcut(keydown('e', document.body, { isComposing: true }), all, true)).toBeUndefined();
  });

  it('modifier shortcuts work in fields and when single keys are off', () => {
    const field = element('<textarea></textarea>');
    expect(matchShortcut(keydown('s', field, { ctrlKey: true }), all, false)).toBe(save);
    expect(matchShortcut(keydown('S', field, { metaKey: true }), all, false)).toBe(save);
  });

  it('single-key shortcuts do not fire when turned off', () => {
    expect(matchShortcut(keydown('e'), all, false)).toBeUndefined();
  });
});

describe('single-key preference', () => {
  it('defaults to on, also for unknown values', () => {
    expect(readSingleKeyShortcuts()).toBe(true);
    localStorage.setItem(SINGLE_KEY_STORAGE_KEY, 'garbage');
    expect(readSingleKeyShortcuts()).toBe(true);
  });

  it('remembers off', () => {
    writeSingleKeyShortcuts(false);
    expect(localStorage.getItem(SINGLE_KEY_STORAGE_KEY)).toBe('off');
    expect(readSingleKeyShortcuts()).toBe(false);
    writeSingleKeyShortcuts(true);
    expect(readSingleKeyShortcuts()).toBe(true);
  });
});

describe('documented shortcuts', () => {
  it('are never matched: the component handles the key itself', () => {
    const rename: Shortcut = { key: 'F2', single: true, label: 'F2', description: 'Rename', group: 'Page tree', documentOnly: true, handler: () => {} };

    expect(matchShortcut(new KeyboardEvent('keydown', { key: 'F2' }), [rename], true)).toBeUndefined();
  });
});
