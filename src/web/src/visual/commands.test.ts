import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  alignColumnCommand,
  currentBlock,
  insertTableCommand,
  isMarkActive,
  listKind,
  setBlockCommand,
  toggleListCommand,
  toggleMarkCommand,
  toggleQuoteCommand,
  toggleTaskItem,
} from './commands';
import { parse, serialize } from './markdown';
import { editorPlugins } from './plugins';
import { filterItems } from './SlashMenu';
import { slashPlugin, slashState } from './slash';

let views: EditorView[] = [];
afterEach(() => {
  views.forEach((v) => v.destroy());
  views = [];
});

function editor(markdown: string) {
  const { doc, snapshot } = parse(markdown);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [...editorPlugins({ style: snapshot.style }), slashPlugin()] }),
  });
  views.push(view);
  return {
    view,
    style: snapshot.style,
    markdown: () => serialize(view.state.doc, snapshot),
    run: (command: Command) => command(view.state, view.dispatch, view),
    /** Selects `text` (first occurrence). */
    select(text: string) {
      let from = -1;
      view.state.doc.descendants((node, pos) => {
        if (from < 0 && node.isText && node.text!.includes(text)) from = pos + node.text!.indexOf(text);
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
    },
    /** Puts the cursor after `text`. */
    cursorAfter(text: string) {
      let at = -1;
      view.state.doc.descendants((node, pos) => {
        if (at < 0 && node.isText && node.text!.includes(text)) at = pos + node.text!.indexOf(text) + text.length;
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    },
    /** Types like a user, so input rules run. */
    type(text: string) {
      for (const ch of text) {
        const { from, to } = view.state.selection;
        const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
        if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    },
    key(key: string, init: KeyboardEventInit = {}) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      view.someProp('handleKeyDown', (f) => f(view, event));
    },
  };
}

describe('marks', () => {
  it('toggles bold in the file style and reports it as active', () => {
    const e = editor('_x_ and __y__\n\nplain text\n');
    e.select('plain');
    e.run(toggleMarkCommand('strong', e.style));
    expect(isMarkActive(e.view.state, 'strong')).toBe(true);
    expect(e.markdown()).toBe('_x_ and __y__\n\n__plain__ text\n');
    e.run(toggleMarkCommand('strong', e.style));
    expect(e.markdown()).toBe('_x_ and __y__\n\nplain text\n');
  });

  it('applies italic, strikethrough and code', () => {
    const e = editor('one two three four\n');
    e.select('one');
    e.run(toggleMarkCommand('em', e.style));
    e.select('two');
    e.run(toggleMarkCommand('strike', e.style));
    e.select('three');
    e.run(toggleMarkCommand('code', e.style));
    expect(e.markdown()).toBe('*one* ~~two~~ `three` four\n');
  });
});

describe('blocks', () => {
  it('changes block type and keeps the text', () => {
    const e = editor('Title\n\nbody\n');
    e.cursorAfter('Title');
    e.run(setBlockCommand('heading2'));
    expect(currentBlock(e.view.state)).toBe('heading2');
    expect(e.markdown()).toBe('## Title\n\nbody\n');
    e.run(setBlockCommand('paragraph'));
    expect(e.markdown()).toBe('Title\n\nbody\n');
  });

  it('wraps and unwraps lists of every kind', () => {
    const e = editor('first\n');
    e.cursorAfter('first');
    e.run(toggleListCommand('bullet', e.style));
    expect(listKind(e.view.state)).toBe('bullet');
    expect(e.markdown()).toBe('- first\n');
    e.run(toggleListCommand('ordered', e.style));
    expect(e.markdown()).toBe('1. first\n');
    e.run(toggleListCommand('task', e.style));
    expect(listKind(e.view.state)).toBe('task');
    expect(e.markdown()).toBe('1. [ ] first\n');
    e.run(toggleListCommand('task', e.style));
    expect(e.markdown()).toBe('first\n');
  });

  it('toggles a task item', () => {
    const e = editor('- [ ] todo\n- [x] done\n');
    const itemPos = 1;
    e.run(toggleTaskItem(itemPos));
    expect(e.markdown()).toBe('- [x] todo\n- [x] done\n');
  });

  it('wraps and lifts a quote', () => {
    const e = editor('said\n');
    e.cursorAfter('said');
    e.run(toggleQuoteCommand);
    expect(e.markdown()).toBe('> said\n');
    e.run(toggleQuoteCommand);
    expect(e.markdown()).toBe('said\n');
  });
});

describe('tables', () => {
  it('inserts a 3×3 table, moves with Tab and aligns columns', () => {
    const e = editor('\n');
    e.run(insertTableCommand());
    e.type('a');
    e.key('Tab');
    e.type('b');
    e.run(alignColumnCommand('right'));
    expect(e.markdown()).toBe('| a | b |  |\n| --- | ---: | --- |\n|  |  |  |\n|  |  |  |\n');
  });
});

describe('input rules (contracts/ui.md §3)', () => {
  it.each([
    ['# ', '# x\n'],
    ['## ', '## x\n'],
    ['- ', '- x\n'],
    ['1. ', '1. x\n'],
    ['> ', '> x\n'],
  ])('%j at the start of a paragraph', (prefix, expected) => {
    const e = editor('\n');
    e.type(prefix);
    e.type('x');
    expect(e.markdown()).toBe(expected);
  });

  it('applies inline marks typed with delimiters', () => {
    const e = editor('\n');
    e.type('a **bold** and `code`');
    expect(e.markdown()).toBe('a **bold** and `code`\n');
    let marks = 0;
    e.view.state.doc.descendants((n) => {
      marks += n.marks.length;
    });
    expect(marks).toBe(2);
  });

  it('turns a list item into a task item with [ ]', () => {
    const e = editor('\n');
    e.type('- [ ] ');
    e.type('todo');
    expect(e.markdown()).toBe('- [ ] todo\n');
  });

  it('turns ``` + Enter into a code block', () => {
    const e = editor('\n');
    e.type('```js');
    e.key('Enter');
    e.type('let x');
    expect(e.markdown()).toBe('```js\nlet x\n```\n');
  });
});

describe('"/" menu', () => {
  it('opens on "/" in an empty paragraph and follows the query', () => {
    const e = editor('\n');
    e.type('/');
    expect(slashState(e.view.state)).toMatchObject({ active: true, query: '' });
    e.type('tab');
    expect(slashState(e.view.state)).toMatchObject({ active: true, query: 'tab' });
    e.type('  ');
    expect(slashState(e.view.state).active).toBe(true);
  });

  it('does not open in a paragraph with text', () => {
    const e = editor('text\n');
    e.cursorAfter('text');
    e.type('/');
    expect(slashState(e.view.state).active).toBe(false);
  });

  it('filters items by label and keywords, case-insensitively', () => {
    const items = [
      { id: 'h1', label: 'Heading 1', keywords: 'h1 title', run: () => {} },
      { id: 'table', label: 'Table', run: () => {} },
    ];
    expect(filterItems(items, 'TAB').map((i) => i.id)).toEqual(['table']);
    expect(filterItems(items, 'title').map((i) => i.id)).toEqual(['h1']);
    expect(filterItems(items, 'zzz')).toEqual([]);
  });
});
