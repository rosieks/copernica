import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { redoDepth, undoDepth } from 'prosemirror-history';
import type { MarkType, Node as PMNode, NodeType } from 'prosemirror-model';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import { TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { CellSelection, isInTable as inTable, selectedRect, setCellAttr } from 'prosemirror-tables';
import { schema } from './markdown/schema';
import type { FileStyle } from './markdown/style';

/**
 * Commands behind the toolbar, keyboard shortcuts and "/" menu (contracts/ui.md §2–§4), and the
 * state queries that drive `aria-pressed`. New marks and blocks carry the file's style so they
 * are written the way the rest of the page is.
 */

export type MarkName = 'strong' | 'em' | 'strike' | 'code';
export type BlockKind = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' | 'code';
export type ListKind = 'bullet' | 'ordered' | 'task';
export type Align = 'left' | 'center' | 'right' | null;

function markType(name: MarkName): MarkType {
  return schema.marks[name];
}

export function toggleMarkCommand(name: MarkName, style: FileStyle): Command {
  const marker = name === 'strong' ? style.strong : name === 'em' ? style.emphasis : null;
  return toggleMark(markType(name), marker ? { marker } : null);
}

export function isMarkActive(state: EditorState, name: MarkName): boolean {
  const type = markType(name);
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

export function setBlockCommand(kind: BlockKind): Command {
  if (kind === 'paragraph') return setBlockType(schema.nodes.paragraph);
  if (kind === 'code') return setBlockType(schema.nodes.code_block);
  return setBlockType(schema.nodes.heading, { level: Number(kind.slice(-1)) });
}

export function currentBlock(state: EditorState): BlockKind | null {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to)) return null;
  const parent = $from.parent;
  if (parent.type === schema.nodes.paragraph) return 'paragraph';
  if (parent.type === schema.nodes.code_block) return 'code';
  if (parent.type === schema.nodes.heading) return `heading${parent.attrs.level as number}` as BlockKind;
  return null;
}

/** The innermost ancestor of the selection with the given type, with its position. */
function ancestor(state: EditorState, type: NodeType): { node: PMNode; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type === type) return { node, pos: $from.before(depth) };
  }
  return null;
}

function innermostList(state: EditorState): { node: PMNode; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.bullet_list || node.type === schema.nodes.ordered_list) return { node, pos: $from.before(depth) };
  }
  return null;
}

export function listKind(state: EditorState): ListKind | null {
  const list = innermostList(state);
  if (!list) return null;
  const item = ancestor(state, schema.nodes.list_item);
  if (item && item.node.attrs.checked !== null) return 'task';
  return list.node.type === schema.nodes.ordered_list ? 'ordered' : 'bullet';
}

/** Sets `checked` on every list item the selection touches. */
function setChecked(state: EditorState, checked: boolean | null): Command {
  return (_state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let found = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.list_item) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked });
        found = true;
      }
    });
    if (found && dispatch) dispatch(tr);
    return found;
  };
}

/**
 * Bulleted, numbered and task lists toggle like in word processors: the same kind again
 * removes the list, another kind converts it.
 */
export function toggleListCommand(kind: ListKind, style: FileStyle): Command {
  return (state, dispatch, view) => {
    const current = listKind(state);
    const list = innermostList(state);
    if (current === kind) return liftListItem(schema.nodes.list_item)(state, dispatch, view);
    if (list && current) {
      if (kind === 'task') return setChecked(state, false)(state, dispatch, view);
      const type = kind === 'ordered' ? schema.nodes.ordered_list : schema.nodes.bullet_list;
      if (!dispatch) return true;
      const tr = state.tr;
      if (list.node.type !== type) tr.setNodeMarkup(list.pos, type, kind === 'ordered' ? { start: 1, tight: list.node.attrs.tight } : { tight: list.node.attrs.tight });
      if (current === 'task') {
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (node.type === schema.nodes.list_item) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: null });
        });
      }
      dispatch(tr);
      return true;
    }
    const type = kind === 'ordered' ? schema.nodes.ordered_list : schema.nodes.bullet_list;
    const attrs = kind === 'ordered' ? { delimiter: style.ordered.delimiter } : { marker: style.bullet };
    if (kind !== 'task') return wrapInList(type, attrs)(state, dispatch, view);
    // A task list is a bulleted list whose items have a checkbox.
    return wrapInList(type, attrs)(state, (tr) => {
      const after = state.apply(tr);
      const items: number[] = [];
      after.doc.nodesBetween(after.selection.from, after.selection.to, (node, pos) => {
        if (node.type === schema.nodes.list_item) items.push(pos);
      });
      for (const pos of items) tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, checked: false });
      dispatch?.(tr);
    }, view);
  };
}

export function toggleTaskItem(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node || node.type !== schema.nodes.list_item || node.attrs.checked === null) return false;
    dispatch?.(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }));
    return true;
  };
}

export function isInQuote(state: EditorState): boolean {
  return ancestor(state, schema.nodes.blockquote) !== null;
}

export const toggleQuoteCommand: Command = (state, dispatch, view) =>
  isInQuote(state) ? lift(state, dispatch, view) : wrapIn(schema.nodes.blockquote)(state, dispatch, view);

/** Inserts a block after the current top-level-or-nested block and puts the cursor in it. */
function insertBlock(node: PMNode, cursorInside: boolean): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = Math.max(1, $from.depth);
    const parent = $from.node(depth);
    const replaceEmpty = parent.isTextblock && parent.content.size === 0 && parent.type === schema.nodes.paragraph;
    if (!dispatch) return true;
    const tr = state.tr;
    let pos: number;
    if (replaceEmpty) {
      pos = $from.before(depth);
      tr.replaceWith(pos, pos + parent.nodeSize, node);
    } else {
      pos = $from.after(depth);
      tr.insert(pos, node);
    }
    if (cursorInside) tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
    else {
      // Keep typing below the inserted block.
      const after = pos + node.nodeSize;
      if (after >= tr.doc.content.size || !tr.doc.resolve(after).nodeAfter) tr.insert(after, schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function insertRuleCommand(): Command {
  return insertBlock(schema.nodes.horizontal_rule.create(), false);
}

export function insertTableCommand(rows = 3, columns = 3): Command {
  const cell = (header: boolean) => (header ? schema.nodes.table_header : schema.nodes.table_cell).create();
  const row = (header: boolean) => schema.nodes.table_row.create(null, Array.from({ length: columns }, () => cell(header)));
  const table = schema.nodes.table.create(null, [row(true), ...Array.from({ length: rows - 1 }, () => row(false))]);
  return insertBlock(table, true);
}

export function insertDiagramCommand(source: string): Command {
  return insertBlock(schema.nodes.diagram.create({ source, syntax: 'fence' }), false);
}

export function insertCodeCommand(): Command {
  return insertBlock(schema.nodes.code_block.create(), true);
}

export function isInTable(state: EditorState): boolean {
  return inTable(state);
}

/** Sets the alignment of every cell in the selected columns (GFM aligns whole columns). */
export function alignColumnCommand(align: Align): Command {
  return (state, dispatch) => {
    if (!inTable(state)) return false;
    const rect = selectedRect(state);
    if (!dispatch) return true;
    const tr = state.tr;
    for (let row = 0; row < rect.map.height; row++) {
      for (let col = rect.left; col < rect.right; col++) {
        const pos = rect.tableStart + rect.map.map[row * rect.map.width + col]!;
        const cell = tr.doc.nodeAt(pos);
        if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align });
      }
    }
    dispatch(tr);
    return true;
  };
}

export function columnAlign(state: EditorState): Align {
  if (!inTable(state)) return null;
  const sel = state.selection;
  const $cell = sel instanceof CellSelection ? sel.$anchorCell : sel.$from;
  for (let depth = $cell.depth; depth > 0; depth--) {
    const node = $cell.node(depth);
    if (node.type === schema.nodes.table_cell || node.type === schema.nodes.table_header) return node.attrs.align as Align;
  }
  return null;
}

export { setCellAttr };

export function canUndo(state: EditorState): boolean {
  return undoDepth(state) > 0;
}

export function canRedo(state: EditorState): boolean {
  return redoDepth(state) > 0;
}
