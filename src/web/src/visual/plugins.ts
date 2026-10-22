import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { InputRule, inputRules, textblockTypeInputRule, undoInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { MarkType } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { TextSelection, type Command, type Plugin } from 'prosemirror-state';
import { addRowAfter, goToNextCell, isInTable, tableEditing } from 'prosemirror-tables';
import { setBlockCommand, toggleListCommand, toggleMarkCommand, toggleQuoteCommand, type BlockKind } from './commands';
import { schema } from './markdown/schema';
import type { FileStyle } from './markdown/style';

export interface PluginOptions {
  style: FileStyle;
  /** Ctrl/⌘+K: opens the link dialog (US4). */
  onLink?: () => void;
}

/** `**text**`-style input: applies the mark and removes the typed delimiters. */
function markRule(pattern: RegExp, type: MarkType, attrs: Record<string, unknown> | null = null): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const text = match[2];
    const lead = match[1] ?? '';
    if (!text) return null;
    const textStart = start + lead.length;
    const tr = state.tr;
    tr.replaceWith(textStart, end, schema.text(text, [...state.doc.resolve(textStart).marks(), type.create(attrs)]));
    tr.removeStoredMark(type);
    return tr;
  });
}

/** `[ ] ` or `[x] ` at the start of a list item's first paragraph makes it a task item. */
const taskRule = new InputRule(/^\[([ xX])\]\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start);
  const item = $start.node(-1);
  if (!item || item.type !== schema.nodes.list_item || $start.index(-1) !== 0) return null;
  return state.tr.delete(start, end).setNodeMarkup($start.before(-1), undefined, { ...item.attrs, checked: match[1] !== ' ' });
});

function rules(): Plugin {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (m) => ({ level: m[1]!.length })),
      wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list, (m) => ({ marker: m[1] })),
      wrappingInputRule(
        /^(\d{1,9})([.)])\s$/,
        schema.nodes.ordered_list,
        (m) => ({ start: Number(m[1]), delimiter: m[2] }),
        (m, node) => node.childCount + (node.attrs.start as number) === Number(m[1]),
      ),
      wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
      taskRule,
      markRule(/(^|[^*])\*\*([^*]+)\*\*$/, schema.marks.strong, { marker: '**' }),
      markRule(/(^|[^_\w])__([^_]+)__$/, schema.marks.strong, { marker: '__' }),
      markRule(/(^|[^*])\*([^*\s][^*]*)\*$/, schema.marks.em, { marker: '*' }),
      markRule(/(^|[^_\w])_([^_\s][^_]*)_$/, schema.marks.em, { marker: '_' }),
      markRule(/(^|[^`])`([^`]+)`$/, schema.marks.code),
      markRule(/(^|[^~])~~([^~]+)~~$/, schema.marks.strike, { marker: '~~' }),
    ],
  });
}

/** ```` ```lang ```` or `---` followed by Enter turn the paragraph into a code block or rule. */
const enterShortcuts: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== schema.nodes.paragraph || $from.parentOffset !== $from.parent.content.size) return false;
  const text = $from.parent.textContent;
  const fence = /^(```|~~~)([\w+#.-]*)$/.exec(text);
  if (fence) {
    if (dispatch) {
      const start = $from.start();
      const tr = state.tr.delete(start, $from.end());
      tr.setBlockType(start, start, schema.nodes.code_block, { language: fence[2] ?? '' });
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  if (/^(---|\*\*\*|___)$/.test(text)) {
    if (dispatch) {
      const pos = $from.before();
      const tr = state.tr.replaceWith(pos, pos + $from.parent.nodeSize, [schema.nodes.horizontal_rule.create(), schema.nodes.paragraph.create()]);
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  return false;
};

/** Tab in the last cell of a table adds a row and moves into it (contracts/ui.md §7). */
const nextCellOrNewRow: Command = (state, dispatch, view) => {
  if (!isInTable(state)) return false;
  if (goToNextCell(1)(state, dispatch, view)) return true;
  if (!dispatch) return true;
  addRowAfter(state, dispatch);
  if (view) goToNextCell(1)(view.state, view.dispatch, view);
  return true;
};

const hardBreak: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type.spec.code) return false;
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

export function editorPlugins(options: PluginOptions): Plugin[] {
  const { style } = options;
  const blocks: [string, BlockKind][] = [
    ['Ctrl-Alt-0', 'paragraph'],
    ['Ctrl-Alt-1', 'heading1'],
    ['Ctrl-Alt-2', 'heading2'],
    ['Ctrl-Alt-3', 'heading3'],
    ['Ctrl-Alt-4', 'heading4'],
    ['Ctrl-Alt-5', 'heading5'],
    ['Ctrl-Alt-6', 'heading6'],
  ];
  const link: Command = () => {
    if (!options.onLink) return false;
    options.onLink();
    return true;
  };
  return [
    rules(),
    keymap({
      'Mod-z': chainCommands(undoInputRule, undo),
      'Mod-Shift-z': redo,
      'Mod-y': redo,
      Backspace: undoInputRule,
      'Mod-b': toggleMarkCommand('strong', style),
      'Mod-i': toggleMarkCommand('em', style),
      'Mod-Shift-x': toggleMarkCommand('strike', style),
      'Mod-e': toggleMarkCommand('code', style),
      'Mod-k': link,
      'Mod-Shift-8': toggleListCommand('bullet', style),
      'Mod-Shift-7': toggleListCommand('ordered', style),
      'Mod-Shift-9': toggleListCommand('task', style),
      'Mod-Shift-.': toggleQuoteCommand,
      ...Object.fromEntries(blocks.map(([key, kind]) => [key, setBlockCommand(kind)])),
      Enter: chainCommands(enterShortcuts, splitListItem(schema.nodes.list_item)),
      'Shift-Enter': chainCommands(exitCode, hardBreak),
      'Mod-Enter': exitCode,
      // Tab moves between table cells and nests list items; elsewhere it leaves the editor.
      Tab: chainCommands(nextCellOrNewRow, sinkListItem(schema.nodes.list_item)),
      'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(schema.nodes.list_item)),
    }),
    keymap(baseKeymap),
    history(),
    tableEditing(),
    gapCursor(),
    dropCursor({ class: 'visual-drop-cursor' }),
  ];
}
