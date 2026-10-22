import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parse, serialize } from './markdown';
import { altMarkdown, visualTarget } from './imageInput';

let views: EditorView[] = [];
afterEach(() => {
  views.forEach((v) => v.destroy());
  views = [];
});

function setup(markdown: string) {
  const { doc, snapshot } = parse(markdown);
  const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
  views.push(view);
  return { view, target: visualTarget(view), markdown: () => serialize(view.state.doc, snapshot) };
}

describe('visual image target (FR-020)', () => {
  it('shows an upload placeholder that is never written to Markdown (S10)', () => {
    const { view, target, markdown } = setup('Text here.\n');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)));
    target.insertPlaceholder(target.cursor(), 'u1', 'shot.png');
    let uploads = 0;
    view.state.doc.descendants((n) => {
      if (n.type.name === 'image_upload') uploads++;
    });
    expect(uploads).toBe(1);
    expect(markdown()).toBe('Text here.\n');
  });

  it('replaces the placeholder with the described image', () => {
    const { view, target, markdown } = setup('Before after.\n');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8)));
    target.insertPlaceholder(target.cursor(), 'u1', 'shot.png');
    expect(target.replacePlaceholder('u1', 'Login [screen]', '.attachments/shot-1a2b.png')).toBe(true);
    expect(markdown()).toBe('Before ![Login \\[screen\\]](.attachments/shot-1a2b.png)after.\n');
  });

  it('reports a placeholder that was deleted, so the image is appended instead', () => {
    const { view, target } = setup('x\n');
    target.insertPlaceholder(1, 'u2', 'y.png');
    target.removePlaceholder('u2');
    expect(view.state.doc.textContent).toBe('x');
    expect(target.replacePlaceholder('u2', 'y', 'y.png')).toBe(false);
  });

  it('puts several images of one batch one after another', () => {
    const { target, markdown } = setup('\n');
    let at = target.insertPlaceholder(1, 'a', 'a.png');
    at = target.insertPlaceholder(at, 'b', 'b.png');
    target.replacePlaceholder('a', 'A', 'a.png');
    target.replacePlaceholder('b', 'B', 'b.png');
    expect(markdown()).toBe('![A](a.png)![B](b.png)\n');
  });

  it('escapes brackets and backslashes in the alt text', () => {
    expect(altMarkdown('a [b] \\c')).toBe('a \\[b\\] \\\\c');
  });
});
