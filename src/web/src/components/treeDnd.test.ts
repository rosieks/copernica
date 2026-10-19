import { describe, expect, it } from 'vitest';
import { dropZone, edgeScroll, isValidDrop, reorderBefore, type DndItem } from './treeDnd';

const page = (path: string): DndItem => ({ path, kind: 'page' });
const folder = (path: string): DndItem => ({ path, kind: 'folder' });
const row = { top: 100, height: 40 };

describe('dropZone', () => {
  it('reorders on the top and bottom quarter of a sibling', () => {
    expect(dropZone(row, 105, page('guides/a.md'), page('guides/b.md'))).toBe('before');
    expect(dropZone(row, 135, page('guides/a.md'), page('guides/b.md'))).toBe('after');
    expect(dropZone(row, 120, page('guides/a.md'), page('guides/b.md'))).toBe('none');
  });

  it('moves into the middle of a folder row, and anywhere on a folder of another parent', () => {
    expect(dropZone(row, 120, page('guides/a.md'), folder('guides/sub'))).toBe('into');
    expect(dropZone(row, 105, page('a.md'), folder('guides/sub'))).toBe('into');
    expect(dropZone(row, 105, page('guides/a.md'), folder('guides/sub'))).toBe('before');
  });
});

describe('isValidDrop', () => {
  it('refuses the item itself, its own folder and its own subtree', () => {
    expect(isValidDrop(page('guides/a.md'), page('guides/a.md'), 'before')).toBe(false);
    expect(isValidDrop(page('guides/a.md'), folder('guides'), 'into')).toBe(false);
    expect(isValidDrop(folder('guides'), folder('guides/sub'), 'into')).toBe(false);
    expect(isValidDrop(folder('guides'), folder('guides'), 'into')).toBe(false);
  });

  it('accepts moves into other folders, including the root, and reorders among siblings', () => {
    expect(isValidDrop(page('guides/a.md'), folder('reference'), 'into')).toBe(true);
    expect(isValidDrop(page('guides/a.md'), folder(''), 'into')).toBe(true);
    expect(isValidDrop(folder('guides'), folder('guidelines'), 'into')).toBe(true);
    expect(isValidDrop(page('guides/a.md'), page('guides/b.md'), 'after')).toBe(true);
    expect(isValidDrop(page('guides/a.md'), page('other/b.md'), 'after')).toBe(false);
    expect(isValidDrop(page('a.md'), page('b.md'), 'none')).toBe(false);
  });
});

describe('reorderBefore', () => {
  const siblings = ['sub', 'a.md', 'b.md', 'c.md'];

  it('names the sibling the item lands in front of, or null for the end', () => {
    expect(reorderBefore(siblings, 'c.md', 'a.md', 'before')).toBe('a.md');
    expect(reorderBefore(siblings, 'sub', 'a.md', 'after')).toBe('b.md');
    expect(reorderBefore(siblings, 'a.md', 'b.md', 'after')).toBe('c.md');
    expect(reorderBefore(siblings, 'a.md', 'c.md', 'after')).toBeNull();
  });
});

describe('edgeScroll', () => {
  it('scrolls near the edges only', () => {
    const area = { top: 0, bottom: 500 };
    expect(edgeScroll(area, 10)).toBe(-1);
    expect(edgeScroll(area, 250)).toBe(0);
    expect(edgeScroll(area, 490)).toBe(1);
  });
});
