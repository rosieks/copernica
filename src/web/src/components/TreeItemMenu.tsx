import type { ReactNode } from 'react';
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  FilePlusIcon,
  FileTextIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import type { Schemas } from '../api/client';
import { Menu } from '../ui';

type TreeNode = Schemas['TreeNode'];

export type TreeAction = 'open' | 'new-page' | 'new-folder' | 'rename' | 'move' | 'move-up' | 'move-down' | 'delete';

interface Props {
  /** The item, or the space root (a folder with path ""). */
  node: TreeNode;
  canWrite: boolean;
  /** Why write actions are unavailable although the user may write (out of sync, initializing). */
  writeDisabledReason?: string;
  /** Position among siblings, for Move up / Move down; omitted for the root. */
  position?: { first: boolean; last: boolean };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: TreeAction) => void;
  /** Called when the menu closes without an action, to put focus back on the item. */
  onCloseFocus?: () => void;
  /** The trigger element (the row's "⋯" button). */
  children: ReactNode;
}

/** Actions of a tree item or the space root (005 contracts/ui.md §1). */
export function TreeItemMenu({ node, canWrite, writeDisabledReason, position, open, onOpenChange, onAction, onCloseFocus, children }: Props) {
  const isRoot = node.path === '';
  const isPage = node.kind === 'page';
  const label = isRoot ? 'Space actions' : `Actions for ${node.title ?? node.name}`;
  const disabled = !!writeDisabledReason;

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger asChild>{children}</Menu.Trigger>
      <Menu.Content
        label={label}
        align="start"
        onCloseAutoFocus={(event) => {
          if (onCloseFocus) {
            event.preventDefault();
            onCloseFocus();
          }
        }}
      >
        {isPage && (
          <Menu.Item icon={<FileTextIcon />} onSelect={() => onAction('open')}>
            Open
          </Menu.Item>
        )}
        {canWrite && (
          <>
            {isPage && <Menu.Separator />}
            {disabled && <Menu.Label>{writeDisabledReason}</Menu.Label>}
            <Menu.Item icon={<FilePlusIcon />} disabled={disabled} onSelect={() => onAction('new-page')}>
              New page here…
            </Menu.Item>
            {!isPage && (
              <Menu.Item icon={<PlusIcon />} disabled={disabled} onSelect={() => onAction('new-folder')}>
                New folder…
              </Menu.Item>
            )}
            {!isRoot && (
              <>
                <Menu.Separator />
                <Menu.Item icon={<Pencil1Icon />} disabled={disabled} onSelect={() => onAction('rename')}>
                  Rename…
                </Menu.Item>
                <Menu.Item icon={<ArrowRightIcon />} disabled={disabled} onSelect={() => onAction('move')}>
                  Move…
                </Menu.Item>
                {position && (
                  <>
                    <Menu.Item icon={<ArrowUpIcon />} disabled={disabled || position.first} onSelect={() => onAction('move-up')}>
                      Move up
                    </Menu.Item>
                    <Menu.Item icon={<ArrowDownIcon />} disabled={disabled || position.last} onSelect={() => onAction('move-down')}>
                      Move down
                    </Menu.Item>
                  </>
                )}
                <Menu.Separator />
                <Menu.Item tone="danger" icon={<TrashIcon />} disabled={disabled} onSelect={() => onAction('delete')}>
                  Delete…
                </Menu.Item>
              </>
            )}
          </>
        )}
        {!canWrite && !isPage && <Menu.Label>You can only read this space.</Menu.Label>}
      </Menu.Content>
    </Menu.Root>
  );
}

/** Why a user who may write cannot change the tree right now (FR-002), or undefined. */
export function writeDisabledReason(space: Schemas['Space']): string | undefined {
  switch (space.state) {
    case 'outOfSync':
      return 'The space is out of sync with its repository. Changes cannot be made right now.';
    case 'initializing':
      return 'The space is still being prepared. Try again in a moment.';
    case 'unavailable':
      return 'The space is not available right now.';
    default:
      return undefined;
  }
}
