import { useState, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, type Schemas } from '../api/client';
import { invalidateAfterTreeChange, reorder, type MoveResult } from '../api/treeApi';
import { moveDraft } from '../drafts';
import { spaceRoute } from '../routes';
import { useToast } from '../ui';
import { DeletePageDialog, NewPageDialog } from './PageDialogs';
import type { PageTreeHandle } from './PageTree';
import type { TreeAction } from './TreeItemMenu';
import { DeleteFolderDialog, MoveDialog, NewFolderDialog, RenameDialog } from './TreeDialogs';

type TreeNode = Schemas['TreeNode'];

type Open =
  | { kind: 'new-page'; folder: string }
  | { kind: 'new-folder'; parent: string }
  | { kind: 'rename'; node: TreeNode }
  | { kind: 'move'; node: TreeNode; destination?: string }
  | { kind: 'delete-page'; node: TreeNode }
  | { kind: 'delete-folder'; node: TreeNode };

export interface MovedState {
  /** Set in navigation state when the open page was moved, for the "moved" notice. */
  movedFrom?: string;
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function findNode(root: TreeNode, path: string): TreeNode | undefined {
  if (root.path === path) return root;
  for (const child of root.children ?? []) {
    if (child.path === path) return child;
    if (child.kind === 'folder' && path.startsWith(`${child.path}/`)) return findNode(child, path);
  }
  return undefined;
}

/** True when `path` is `item` or lies inside it (a folder). */
function within(path: string | undefined, item: string): boolean {
  return !!path && (path === item || path.startsWith(`${item}/`));
}

export interface TreeManagement {
  onAction: (action: TreeAction, node: TreeNode) => void;
  openNewPage: (folder: string) => void;
  /** Drag and drop onto a folder: Move, with the destination chosen (contracts/ui.md §6). */
  openMove: (node: TreeNode, destination: string) => void;
  /** Places `node` before the sibling named `before` (null: at the end). */
  reorderItem: (node: TreeNode, before: string | null, done: string) => Promise<void>;
  dialogs: ReactNode;
}

/**
 * Tree management (005 US1–US5): turns menu actions into dialogs and reorders, and handles
 * what happens after an operation (refresh, navigation, focus, notifications; contracts/ui.md §7).
 */
export function useTreeManagement({
  spaceId,
  root,
  base,
  currentPath,
  tree,
  returnFocusTo,
}: {
  spaceId: string;
  root: TreeNode | undefined;
  /** Commit the tree was loaded at. */
  base: string;
  currentPath?: string;
  tree: RefObject<PageTreeHandle | null>;
  returnFocusTo?: RefObject<HTMLElement | null>;
}): TreeManagement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState<Open>();
  const close = () => setOpen(undefined);

  async function reorderItem(node: TreeNode, before: string | null, done: string) {
    try {
      await reorder(spaceId, { base, folder: parentOf(node.path), item: node.name, before });
      await invalidateAfterTreeChange(queryClient, spaceId);
      notify({ tone: 'success', title: done });
      tree.current?.focusPath(node.path);
    } catch (e) {
      if (e instanceof ApiError && e.type === 'tree-changed') await queryClient.invalidateQueries({ queryKey: ['tree', spaceId] });
      notify({
        tone: 'danger',
        title: 'The order could not be changed.',
        description: e instanceof ApiError ? [e.problem.title, e.problem.detail].filter(Boolean).join(' ') : undefined,
      });
    }
  }

  function moveAmongSiblings(node: TreeNode, direction: 'up' | 'down') {
    const siblings = (root && findNode(root, parentOf(node.path))?.children) ?? [];
    const index = siblings.findIndex((s) => s.path === node.path);
    if (index < 0) return;
    // "Before" names the sibling the item ends up in front of; null is the end.
    const before = direction === 'up' ? siblings[index - 1]?.name : index + 2 < siblings.length ? siblings[index + 2]!.name : null;
    if (before === undefined) return;
    void reorderItem(node, before, direction === 'up' ? 'Moved up' : 'Moved down');
  }

  function onAction(action: TreeAction, node: TreeNode) {
    const isFolder = node.kind === 'folder';
    switch (action) {
      case 'new-page':
        setOpen({ kind: 'new-page', folder: isFolder ? node.path : parentOf(node.path) });
        break;
      case 'new-folder':
        setOpen({ kind: 'new-folder', parent: node.path });
        break;
      case 'rename':
        setOpen({ kind: 'rename', node });
        break;
      case 'move':
        setOpen({ kind: 'move', node });
        break;
      case 'delete':
        setOpen({ kind: isFolder ? 'delete-folder' : 'delete-page', node });
        break;
      case 'move-up':
      case 'move-down':
        moveAmongSiblings(node, action === 'move-up' ? 'up' : 'down');
        break;
    }
  }

  function moved(node: TreeNode, result: MoveResult, verb: 'renamed' | 'moved') {
    close();
    const updated = result.updatedPages.length;
    notify({
      tone: 'success',
      title: `${node.kind === 'folder' ? 'Folder' : 'Page'} ${verb}`,
      description: updated > 0 ? `Updated links in ${updated} ${updated === 1 ? 'page' : 'pages'}.` : undefined,
    });
    // The open page moved (itself or with its folder): follow it.
    if (currentPath && within(currentPath, node.path)) {
      const next = result.path + currentPath.slice(node.path.length);
      moveDraft(spaceId, currentPath, next);
      navigate(spaceRoute(spaceId, next), { replace: true });
    }
    tree.current?.focusPath(result.path);
  }

  const dialogs = (
    <>
      <NewPageDialog
        spaceId={spaceId}
        folder={open?.kind === 'new-page' ? open.folder || undefined : undefined}
        open={open?.kind === 'new-page'}
        onClose={close}
        returnFocusTo={returnFocusTo}
      />
      <NewFolderDialog spaceId={spaceId} parent={open?.kind === 'new-folder' ? open.parent : ''} open={open?.kind === 'new-folder'} onClose={close} />
      {open?.kind === 'rename' && (
        <RenameDialog spaceId={spaceId} base={base} node={open.node} open onClose={close} onDone={(result) => moved(open.node, result, 'renamed')} />
      )}
      {open?.kind === 'move' && root && (
        <MoveDialog
          spaceId={spaceId}
          base={base}
          node={open.node}
          root={root}
          initialDestination={open.destination}
          open
          onClose={close}
          onDone={(result) => moved(open.node, result, 'moved')}
        />
      )}
      {open?.kind === 'delete-page' && (
        <DeletePageDialog
          key={open.node.path}
          spaceId={spaceId}
          path={open.node.path}
          version={{ commitId: base }}
          open
          onClose={close}
          onDeleted={currentPath === open.node.path ? undefined : () => tree.current?.focusPath(parentOf(open.node.path))}
        />
      )}
      {open?.kind === 'delete-folder' && (
        <DeleteFolderDialog
          spaceId={spaceId}
          base={base}
          node={open.node}
          open
          onClose={close}
          onDone={() => {
            const node = open.node;
            close();
            notify({ tone: 'success', title: 'Folder deleted', description: 'It stays available in the repository history.' });
            if (within(currentPath, node.path)) navigate(`/s/${spaceId}/`);
            else if (parentOf(node.path)) tree.current?.focusPath(parentOf(node.path));
          }}
        />
      )}
    </>
  );

  return {
    onAction,
    openNewPage: (folder) => setOpen({ kind: 'new-page', folder }),
    openMove: (node, destination) => setOpen({ kind: 'move', node, destination }),
    reorderItem,
    dialogs,
  };
}
