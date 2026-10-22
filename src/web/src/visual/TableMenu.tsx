import type { ReactElement } from 'react';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, selectedRect } from 'prosemirror-tables';
import { Menu } from '../ui';
import { alignColumnCommand, columnAlign } from './commands';

interface Props {
  view: EditorView;
  state: EditorState;
  /** The toolbar button that opens the menu. */
  trigger: ReactElement;
  onAnnounce: (text: string) => void;
}

/** True when the selection is in the header row; a GFM table always starts with it. */
function inHeader(state: EditorState): boolean {
  try {
    return selectedRect(state).top === 0;
  } catch {
    return false;
  }
}

/** The header row cannot be deleted while other rows exist. */
function inProtectedHeader(state: EditorState): boolean {
  try {
    const rect = selectedRect(state);
    return rect.top === 0 && rect.map.height > 1;
  } catch {
    return false;
  }
}

/** Row, column and alignment actions for the table at the cursor (contracts/ui.md §7). */
export function TableMenu({ view, state, trigger, onAnnounce }: Props) {
  const run = (command: Command, announcement: string) => () => {
    if (command(view.state, view.dispatch, view)) onAnnounce(announcement);
    view.focus();
  };
  const align = columnAlign(state);
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Content align="start" label="Table" onCloseAutoFocus={(event) => event.preventDefault()}>
        <Menu.Item onSelect={run(addRowBefore, 'Row inserted above')} disabled={inHeader(state)}>
          Insert row above
        </Menu.Item>
        <Menu.Item onSelect={run(addRowAfter, 'Row inserted below')}>Insert row below</Menu.Item>
        <Menu.Item onSelect={run(addColumnBefore, 'Column inserted on the left')}>Insert column left</Menu.Item>
        <Menu.Item onSelect={run(addColumnAfter, 'Column inserted on the right')}>Insert column right</Menu.Item>
        <Menu.Separator />
        <Menu.Item onSelect={run(alignColumnCommand(align === 'left' ? null : 'left'), 'Column aligned left')}>Align column left</Menu.Item>
        <Menu.Item onSelect={run(alignColumnCommand(align === 'center' ? null : 'center'), 'Column centered')}>Align column center</Menu.Item>
        <Menu.Item onSelect={run(alignColumnCommand(align === 'right' ? null : 'right'), 'Column aligned right')}>Align column right</Menu.Item>
        <Menu.Separator />
        <Menu.Item onSelect={run(deleteRow, 'Row deleted')} disabled={inProtectedHeader(state)}>
          Delete row
        </Menu.Item>
        <Menu.Item onSelect={run(deleteColumn, 'Column deleted')}>Delete column</Menu.Item>
        <Menu.Item tone="danger" onSelect={run(deleteTable, 'Table deleted')}>
          Delete table
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
