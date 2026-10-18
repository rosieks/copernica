// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { imageMarkdown, suggestAlt } from './altText';
import { pickImageFiles } from './imageInput';
import { findPlaceholder, insertPlaceholder, placeholderField, removePlaceholder, replacePlaceholder } from './placeholders';
import { checkFile, DEFAULT_LIMITS } from './uploads';

function fakeTransfer(files: File[], items: { kind: string; type: string; file?: File }[] = []): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })) as unknown as DataTransferItemList,
    types: files.length ? ['Files'] : ['text/plain'],
  } as unknown as DataTransfer;
}

function view(doc: string) {
  return new EditorView({ state: EditorState.create({ doc, extensions: [placeholderField] }) });
}

describe('pickImageFiles', () => {
  it('returns image files and ignores text-only clipboards', () => {
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });

    expect(pickImageFiles(fakeTransfer([png, txt]))).toEqual([png]);
    expect(pickImageFiles(fakeTransfer([]))).toEqual([]);
    expect(pickImageFiles(null)).toEqual([]);
  });

  it('falls back to clipboard items holding image data', () => {
    const blob = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });

    expect(pickImageFiles(fakeTransfer([], [{ kind: 'file', type: 'image/png', file: blob }, { kind: 'string', type: 'text/html' }]))).toEqual([blob]);
  });
});

describe('placeholders', () => {
  it('survive edits around them and are replaced by the reference', () => {
    const v = view('Hello world');
    insertPlaceholder(v, 5, 'u1', 'shot.png');
    expect(v.state.doc.toString()).toBe('Hello\n![Uploading shot.png…]()\n world');

    v.dispatch({ changes: { from: 0, insert: 'Say: ' } });
    v.dispatch({ changes: { from: v.state.doc.length, insert: '!' } });
    const end = replacePlaceholder(v, 'u1', '![Shot](../.attachments/shot.png)');

    expect(v.state.doc.toString()).toBe('Say: Hello\n![Shot](../.attachments/shot.png)\n world!');
    expect(end).toBe('Say: Hello\n![Shot](../.attachments/shot.png)'.length);
    expect(findPlaceholder(v.state, 'u1')).toBeUndefined();
    v.destroy();
  });

  it('are removed on failure, and a deleted placeholder is reported', () => {
    const v = view('');
    insertPlaceholder(v, 0, 'u2', 'x.png');
    removePlaceholder(v, 'u2');
    expect(v.state.doc.toString()).toBe('');

    insertPlaceholder(v, 0, 'u3', 'y.png');
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'gone' } });
    expect(replacePlaceholder(v, 'u3', '![y](y.png)')).toBeUndefined();
    v.destroy();
  });
});

describe('checkFile', () => {
  it('uses the same reasons as the server', () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    const bmp = new File([new Uint8Array([1])], 'x.bmp', { type: 'image/bmp' });
    const ok = new File([new Uint8Array([1])], 'x.webp', { type: '' });

    expect(checkFile(big, DEFAULT_LIMITS)).toBe('it is larger than 10 MB');
    expect(checkFile(bmp, DEFAULT_LIMITS)).toBe('only PNG, JPEG, GIF, WebP and SVG images are accepted');
    expect(checkFile(ok, DEFAULT_LIMITS)).toBeUndefined();
  });
});

describe('alternative text', () => {
  it.each([
    ['image.png', 'Image'],
    ['blob', 'Image'],
    ['network-diagram_v2.png', 'Network diagram v2'],
    ['Screenshot 2026-10-17 at 10.15.png', 'Screenshot 2026 10 17 at 10 15'],
  ])('suggests a description for %s', (name, expected) => {
    expect(suggestAlt(name)).toBe(expected);
  });

  it('escapes brackets in the Markdown', () => {
    expect(imageMarkdown('A [b]', 'x.png')).toBe('![A \\[b\\]](x.png)');
    expect(imageMarkdown('', 'x.png')).toBe('![](x.png)');
  });
});
