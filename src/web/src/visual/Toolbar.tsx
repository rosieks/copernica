import type { ReactNode } from 'react';
import {
  CheckboxIcon,
  CodeIcon,
  DividerHorizontalIcon,
  DotsHorizontalIcon,
  FontBoldIcon,
  FontItalicIcon,
  ImageIcon,
  Link2Icon,
  ListBulletIcon,
  QuoteIcon,
  ResetIcon,
  Share2Icon,
  StrikethroughIcon,
  TableIcon,
} from '@radix-ui/react-icons';
import { redo, undo } from 'prosemirror-history';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { MEDIUM, useMediaQuery } from '../layout/useMediaQuery';
import { IconButton, Menu, Toolbar as UiToolbar } from '../ui';
import {
  canRedo,
  canUndo,
  currentBlock,
  insertRuleCommand,
  insertTableCommand,
  isInQuote,
  isInTable,
  isMarkActive,
  listKind,
  setBlockCommand,
  toggleListCommand,
  toggleMarkCommand,
  toggleQuoteCommand,
  type BlockKind,
  type ListKind,
  type MarkName,
} from './commands';
import type { FileStyle } from './markdown/style';
import { TableMenu } from './TableMenu';

export interface EditorActions {
  /** Opens the file picker of the image flow (003). */
  onImage?: () => void;
  /** Inserts a diagram and opens the diagram dialog (US4). */
  onDiagram?: () => void;
  /** Opens the link dialog (US4). */
  onLink?: (tab?: 'page' | 'web') => void;
}

interface Props {
  view: EditorView;
  state: EditorState;
  style: FileStyle;
  actions: EditorActions;
  onAnnounce: (text: string) => void;
}

const mod = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘' : 'Ctrl';

const BLOCKS: { value: BlockKind; label: string }[] = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'heading1', label: 'Heading 1' },
  { value: 'heading2', label: 'Heading 2' },
  { value: 'heading3', label: 'Heading 3' },
  { value: 'heading4', label: 'Heading 4' },
  { value: 'heading5', label: 'Heading 5' },
  { value: 'heading6', label: 'Heading 6' },
  { value: 'code', label: 'Code block' },
];

const MARKS: { name: MarkName; label: string; icon: ReactNode; shortcut: string }[] = [
  { name: 'strong', label: 'Bold', icon: <FontBoldIcon />, shortcut: `${mod} B` },
  { name: 'em', label: 'Italic', icon: <FontItalicIcon />, shortcut: `${mod} I` },
  { name: 'strike', label: 'Strikethrough', icon: <StrikethroughIcon />, shortcut: `${mod} Shift X` },
  { name: 'code', label: 'Inline code', icon: <CodeIcon />, shortcut: `${mod} E` },
];

const LISTS: { kind: ListKind; label: string; icon: ReactNode; shortcut: string }[] = [
  { kind: 'bullet', label: 'Bulleted list', icon: <ListBulletIcon />, shortcut: `${mod} Shift 8` },
  { kind: 'ordered', label: 'Numbered list', icon: <span className="visual-toolbar__glyph">1.</span>, shortcut: `${mod} Shift 7` },
  { kind: 'task', label: 'Task list', icon: <CheckboxIcon />, shortcut: `${mod} Shift 9` },
];

/**
 * The formatting toolbar (contracts/ui.md §2): one Tab stop with arrow-key navigation, toggle
 * buttons with `aria-pressed`, and less common actions in a "More formatting" menu on narrow
 * screens.
 */
export function Toolbar({ view, state, style, actions, onAnnounce }: Props) {
  const wide = useMediaQuery(MEDIUM);
  const run = (command: Command, announcement?: string) => {
    if (command(view.state, view.dispatch, view) && announcement) onAnnounce(announcement);
    view.focus();
  };
  const block = currentBlock(state);
  const list = listKind(state);
  const table = isInTable(state);

  const markButton = (m: (typeof MARKS)[number]) => {
    const active = isMarkActive(state, m.name);
    return (
      <UiToolbar.Button asChild key={m.name}>
        <IconButton
          label={m.label}
          icon={m.icon}
          shortcut={m.shortcut}
          aria-pressed={active}
          onClick={() => run(toggleMarkCommand(m.name, style), `${m.label} ${active ? 'off' : 'on'}`)}
        />
      </UiToolbar.Button>
    );
  };

  const listButton = (l: (typeof LISTS)[number]) => {
    const active = list === l.kind;
    return (
      <UiToolbar.Button asChild key={l.kind}>
        <IconButton
          label={l.label}
          icon={l.icon}
          shortcut={l.shortcut}
          aria-pressed={active}
          onClick={() => run(toggleListCommand(l.kind, style), active ? `${l.label} removed` : l.label)}
        />
      </UiToolbar.Button>
    );
  };

  const quote = isInQuote(state);
  const quoteButton = (
    <UiToolbar.Button asChild key="quote">
      <IconButton label="Quote" icon={<QuoteIcon />} shortcut={`${mod} Shift .`} aria-pressed={quote} onClick={() => run(toggleQuoteCommand, quote ? 'Quote removed' : 'Quote')} />
    </UiToolbar.Button>
  );

  const tableButton = table ? (
    <TableMenu
      key="table"
      view={view}
      state={state}
      onAnnounce={onAnnounce}
      trigger={
        <UiToolbar.Button asChild>
          <IconButton label="Table" icon={<TableIcon />} aria-haspopup="menu" />
        </UiToolbar.Button>
      }
    />
  ) : (
    <UiToolbar.Button asChild key="table">
      <IconButton label="Insert table" icon={<TableIcon />} onClick={() => run(insertTableCommand(), 'Table inserted')} />
    </UiToolbar.Button>
  );

  const secondary: { key: string; label: string; enabled: boolean; onSelect: () => void }[] = [
    { key: 'strike', label: 'Strikethrough', enabled: true, onSelect: () => run(toggleMarkCommand('strike', style), 'Strikethrough') },
    { key: 'code', label: 'Inline code', enabled: true, onSelect: () => run(toggleMarkCommand('code', style), 'Inline code') },
    { key: 'quote', label: quote ? 'Remove quote' : 'Quote', enabled: true, onSelect: () => run(toggleQuoteCommand, 'Quote') },
    { key: 'table', label: 'Insert table', enabled: !table, onSelect: () => run(insertTableCommand(), 'Table inserted') },
    ...(actions.onDiagram ? [{ key: 'diagram', label: 'Diagram', enabled: true, onSelect: () => actions.onDiagram!() }] : []),
    { key: 'rule', label: 'Horizontal rule', enabled: true, onSelect: () => run(insertRuleCommand(), 'Horizontal rule inserted') },
    { key: 'undo', label: 'Undo', enabled: canUndo(state), onSelect: () => run(undo) },
    { key: 'redo', label: 'Redo', enabled: canRedo(state), onSelect: () => run(redo) },
  ];

  return (
    // Pressing a toolbar button must not take the focus and selection away from the text it
    // formats (WebKit clears the selection otherwise). Keyboard use is unaffected.
    <div
      className="visual-toolbar"
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('button')) event.preventDefault();
      }}
    >
      <UiToolbar.Root label="Formatting">
        <select
          className="visual-toolbar__select"
          aria-label="Block type"
          value={block ?? ''}
          onChange={(e) => {
            const kind = e.target.value as BlockKind;
            run(setBlockCommand(kind), BLOCKS.find((b) => b.value === kind)?.label);
          }}
        >
          {block === null && <option value="">Mixed</option>}
          {BLOCKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <UiToolbar.Separator />
        {(wide ? MARKS : MARKS.slice(0, 2)).map(markButton)}
        {actions.onLink && (
          <UiToolbar.Button asChild>
            <IconButton label="Link" icon={<Link2Icon />} shortcut={`${mod} K`} onClick={() => actions.onLink!()} />
          </UiToolbar.Button>
        )}
        <UiToolbar.Separator />
        {LISTS.map(listButton)}
        {wide && quoteButton}
        <UiToolbar.Separator />
        {wide && tableButton}
        {!wide && table && tableButton}
        {actions.onImage && (
          <UiToolbar.Button asChild>
            <IconButton label="Insert image" icon={<ImageIcon />} onClick={() => actions.onImage!()} />
          </UiToolbar.Button>
        )}
        {wide && actions.onDiagram && (
          <UiToolbar.Button asChild>
            <IconButton label="Insert diagram" icon={<Share2Icon />} onClick={() => actions.onDiagram!()} />
          </UiToolbar.Button>
        )}
        {wide && (
          <UiToolbar.Button asChild>
            <IconButton label="Horizontal rule" icon={<DividerHorizontalIcon />} onClick={() => run(insertRuleCommand(), 'Horizontal rule inserted')} />
          </UiToolbar.Button>
        )}
        {wide && (
          <>
            <UiToolbar.Separator />
            <UiToolbar.Button asChild>
              <IconButton label="Undo" icon={<ResetIcon />} shortcut={`${mod} Z`} disabled={!canUndo(state)} onClick={() => run(undo)} />
            </UiToolbar.Button>
            <UiToolbar.Button asChild>
              <IconButton
                label="Redo"
                icon={<ResetIcon className="visual-toolbar__mirror" />}
                shortcut={`${mod} Shift Z`}
                disabled={!canRedo(state)}
                onClick={() => run(redo)}
              />
            </UiToolbar.Button>
          </>
        )}
        {!wide && (
          <Menu.Root>
            <Menu.Trigger asChild>
              <UiToolbar.Button asChild>
                <IconButton label="More formatting" icon={<DotsHorizontalIcon />} />
              </UiToolbar.Button>
            </Menu.Trigger>
            <Menu.Content label="More formatting" onCloseAutoFocus={(event) => event.preventDefault()}>
              {secondary.map((item) => (
                <Menu.Item key={item.key} disabled={!item.enabled} onSelect={item.onSelect}>
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Root>
        )}
      </UiToolbar.Root>
    </div>
  );
}
