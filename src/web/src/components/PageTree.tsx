import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDownIcon, ChevronRightIcon, DotsHorizontalIcon, FileTextIcon } from '@radix-ui/react-icons';
import type { Schemas } from '../api/client';
import { useMediaQuery } from '../layout/useMediaQuery';
import { useShortcut } from '../shortcuts';
import { isSingleKeyEnabled } from '../shortcuts/preference';
import { TreeItemMenu, type TreeAction } from './TreeItemMenu';
import { dropZone, edgeScroll, EXPAND_DELAY_MS, isValidDrop, parentOf, reorderBefore, type DropZone } from './treeDnd';
import './PageTree.css';

type TreeNode = Schemas['TreeNode'];

interface VisibleItem {
  node: TreeNode;
  level: number;
  parent?: string;
  /** Position among its siblings (Move up / Move down). */
  first: boolean;
  last: boolean;
}

/**
 * The item's menu is portalled, but React still bubbles its events through the tree item:
 * a click or key in the menu must not activate or navigate the item behind it.
 */
function fromPortal(event: SyntheticEvent): boolean {
  return !(event.currentTarget as Node).contains(event.target as Node);
}

/** File names of a folder's own page, shown when the folder is opened (like a README). */
const FOLDER_PAGE_NAMES = ['readme.md', 'index.md'];

/** The page a folder opens with: its README.md, else its index.md (case-insensitive); never at the root. */
export function folderPage(node: TreeNode): TreeNode | undefined {
  if (node.kind !== 'folder' || node.path === '') return undefined;
  for (const name of FOLDER_PAGE_NAMES) {
    const page = node.children?.find((c) => c.kind === 'page' && c.name.toLowerCase() === name);
    if (page) return page;
  }
  return undefined;
}

/** The folder whose own page `path` is, or undefined for ordinary pages. */
function folderOfPage(root: TreeNode, path: string): TreeNode | undefined {
  const parent = path.split('/').slice(0, -1).join('/');
  if (!parent) return undefined;
  const folder = findFolder(root, parent);
  return folder && folderPage(folder)?.path === path ? folder : undefined;
}

function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

export interface PageTreeHandle {
  /** Expands the ancestors of `path` and moves focus to it once it is rendered (FR-022). */
  focusPath: (path: string) => void;
}

interface Props {
  spaceId: string;
  root: TreeNode;
  currentPath?: string;
  /** The user may change the space; management actions are offered (005 FR-001, FR-002). */
  canWrite?: boolean;
  writeDisabledReason?: string;
  onAction?: (action: TreeAction, node: TreeNode) => void;
  /** Drag and drop (005 US4): a drop onto a folder, and a drop between siblings. */
  onDropInto?: (node: TreeNode, folder: string) => void;
  onDropReorder?: (node: TreeNode, before: string | null, target: TreeNode, zone: 'before' | 'after') => void;
  /** The item being dragged, so other drop targets (the space root) can accept it. */
  onDraggingChange?: (node: TreeNode | undefined) => void;
}

interface DropTarget {
  path: string;
  zone: DropZone;
  valid: boolean;
}

function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement as HTMLElement | null;
}

/** Accessible page tree (WAI-ARIA tree pattern) with roving focus, arrow-key navigation and item actions. */
export const PageTree = forwardRef<PageTreeHandle, Props>(function PageTree(
  { spaceId, root, currentPath, canWrite = false, writeDisabledReason, onAction, onDropInto, onDropReorder, onDraggingChange },
  ref,
) {
  const finePointer = useMediaQuery('(pointer: fine)');
  const draggable = canWrite && !writeDisabledReason && finePointer && !!(onDropInto || onDropReorder);
  const [dragging, setDragging] = useState<TreeNode>();
  const [dropTarget, setDropTarget] = useState<DropTarget>();
  const [announcement, setAnnouncement] = useState('');
  const expandTimer = useRef<{ path: string; timer: ReturnType<typeof setTimeout> }>(undefined);
  const list = useRef<HTMLUListElement>(null);
  // Keys handled on the focused item, listed in the shortcut help (005 contracts/ui.md §1).
  const noop = () => {};
  const manage = canWrite && !writeDisabledReason;
  useShortcut({ key: 'ContextMenu', single: false, label: 'Shift F10', description: 'Open the actions of the focused item', group: 'Page tree', documentOnly: true, handler: noop });
  useShortcut({ key: 'F2', single: true, label: 'F2', description: 'Rename the focused item', group: 'Page tree', documentOnly: true, enabled: manage, handler: noop });
  useShortcut({ key: 'Delete', single: true, label: 'Delete', description: 'Delete the focused item', group: 'Page tree', documentOnly: true, enabled: manage, handler: noop });
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentPath ? ancestors(currentPath) : []));
  const [focused, setFocused] = useState<string | undefined>(currentPath);
  const [menuFor, setMenuFor] = useState<string>();
  const [pendingFocus, setPendingFocus] = useState<string>();
  const refs = useRef(new Map<string, HTMLLIElement>());

  // A folder's own page is represented by the folder itself.
  const itemPath = (path: string) => folderOfPage(root, path)?.path ?? path;
  const currentItem = currentPath ? itemPath(currentPath) : undefined;

  useEffect(() => {
    if (!currentPath) return;
    setExpanded((prev) => new Set([...prev, ...ancestors(currentPath)]));
    setFocused(itemPath(currentPath));
  }, [currentPath]);

  const visible = useMemo(() => {
    const items: VisibleItem[] = [];
    const walk = (folder: TreeNode, level: number) => {
      const hidden = folderPage(folder)?.path;
      const nodes = (folder.children ?? []).filter((c) => c.path !== hidden);
      nodes.forEach((node, index) => {
        items.push({ node, level, parent: folder.path || undefined, first: index === 0, last: index === nodes.length - 1 });
        if (node.kind === 'folder' && expanded.has(node.path)) walk(node, level + 1);
      });
    };
    walk(root, 1);
    return items;
  }, [root, expanded]);

  useImperativeHandle(ref, () => ({
    focusPath(path: string) {
      const target = itemPath(path);
      setExpanded((prev) => new Set([...prev, ...ancestors(target)]));
      setFocused(target);
      setPendingFocus(target);
    },
  }));

  // Focus a requested item as soon as it is rendered (after a move it appears with the next tree).
  useEffect(() => {
    if (!pendingFocus) return;
    const element = refs.current.get(pendingFocus);
    if (element) {
      element.focus();
      setPendingFocus(undefined);
    }
  }, [pendingFocus, visible]);

  const focusKey = focused && visible.some((v) => v.node.path === focused) ? focused : visible[0]?.node.path;

  function move(path: string | undefined) {
    if (!path) return;
    setFocused(path);
    refs.current.get(path)?.focus();
  }

  function toggle(path: string, open?: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      const shouldOpen = open ?? !next.has(path);
      if (shouldOpen) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function open(path: string) {
    navigate(`/s/${spaceId}/${path.split('/').map(encodeURIComponent).join('/')}`);
  }

  /** Pages open; a folder with its own page opens it (and expands), otherwise it expands or collapses. */
  function activate(node: TreeNode) {
    if (node.kind !== 'folder') return open(node.path);
    const page = folderPage(node);
    if (page && currentPath !== page.path) {
      toggle(node.path, true);
      open(page.path);
    } else {
      toggle(node.path);
    }
  }

  // ----- Drag and drop (contracts/ui.md §6) -----

  function clearExpandTimer() {
    if (expandTimer.current) clearTimeout(expandTimer.current.timer);
    expandTimer.current = undefined;
  }

  function endDrag() {
    clearExpandTimer();
    setDragging(undefined);
    setDropTarget(undefined);
    onDraggingChange?.(undefined);
  }

  function siblingNames(path: string): string[] {
    const folder = parentOf(path);
    const parent = folder ? findFolder(root, folder) : root;
    return (parent?.children ?? []).map((c) => c.name);
  }

  function onDragOver(event: DragEvent<HTMLLIElement>, node: TreeNode) {
    if (!dragging || fromPortal(event)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const zone = dropZone(rect, event.clientY, dragging, node);
    const valid = isValidDrop(dragging, node, zone);
    if (valid) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    } else {
      event.dataTransfer.dropEffect = 'none';
    }
    if (dropTarget?.path !== node.path || dropTarget.zone !== zone) {
      setDropTarget({ path: node.path, zone, valid });
      const title = node.title ?? node.name;
      setAnnouncement(!valid ? `Cannot drop on ${title}` : zone === 'into' ? `Drop to move into ${title}` : `Drop to place ${zone} ${title}`);
    }
    // Hovering a collapsed folder expands it.
    if (node.kind === 'folder' && !expanded.has(node.path) && zone === 'into' && expandTimer.current?.path !== node.path) {
      clearExpandTimer();
      expandTimer.current = { path: node.path, timer: setTimeout(() => toggle(node.path, true), EXPAND_DELAY_MS) };
    }
    const area = scrollParent(list.current);
    if (area) {
      const bounds = area === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : area.getBoundingClientRect();
      const direction = edgeScroll(bounds, event.clientY);
      if (direction) area.scrollBy(0, direction * 12);
    }
  }

  function onDrop(event: DragEvent<HTMLLIElement>, node: TreeNode) {
    if (!dragging || fromPortal(event)) return;
    event.preventDefault();
    const zone = dropZone(event.currentTarget.getBoundingClientRect(), event.clientY, dragging, node);
    const moved = dragging;
    endDrag();
    if (!isValidDrop(moved, node, zone)) return;
    if (zone === 'into') onDropInto?.(moved, node.path);
    else if (zone === 'before' || zone === 'after') {
      onDropReorder?.(moved, reorderBefore(siblingNames(node.path), moved.name, node.name, zone), node, zone);
    }
  }

  function act(action: TreeAction, node: TreeNode) {
    setMenuFor(undefined);
    if (action === 'open') activate(node);
    else onAction?.(action, node);
  }

  function onKeyDown(event: KeyboardEvent, item: VisibleItem, index: number) {
    const { node } = item;
    const isOpen = node.kind === 'folder' && expanded.has(node.path);
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      setMenuFor(node.path);
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    switch (event.key) {
      case 'ArrowDown':
        move(visible[index + 1]?.node.path);
        break;
      case 'ArrowUp':
        move(visible[index - 1]?.node.path);
        break;
      case 'ArrowRight':
        if (node.kind === 'folder' && !isOpen) toggle(node.path, true);
        else if (isOpen) move(visible[index + 1]?.node.path);
        break;
      case 'ArrowLeft':
        if (isOpen) toggle(node.path, false);
        else move(item.parent);
        break;
      case 'Home':
        move(visible[0]?.node.path);
        break;
      case 'End':
        move(visible[visible.length - 1]?.node.path);
        break;
      case 'Enter':
      case ' ':
        activate(node);
        break;
      case 'F2':
      case 'Delete':
        // File-manager shortcuts, honouring the single-key preference (005 contracts/ui.md §1).
        if (!canWrite || writeDisabledReason || !isSingleKeyEnabled()) return;
        onAction?.(event.key === 'F2' ? 'rename' : 'delete', node);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <>
    <ul ref={list} role="tree" aria-label="Pages" className={`page-tree${dragging ? ' page-tree--dragging' : ''}`}>
      {visible.map((item, index) => {
        const { node, level } = item;
        const isFolder = node.kind === 'folder';
        const isCurrent = node.path === currentItem;
        // A folder that only holds its own page behaves like a page.
        const page = folderPage(node);
        const expandable = isFolder && (node.children ?? []).some((c) => c.path !== page?.path);
        const title = node.title ?? node.name;
        return (
          <li
            key={node.path}
            ref={(el) => {
              if (el) refs.current.set(node.path, el);
              else refs.current.delete(node.path);
            }}
            role="treeitem"
            aria-level={level}
            aria-expanded={expandable ? expanded.has(node.path) : undefined}
            aria-selected={isCurrent}
            aria-current={isCurrent ? 'page' : undefined}
            aria-haspopup="menu"
            tabIndex={node.path === focusKey ? 0 : -1}
            className={[
              'tree-item',
              `level-${Math.min(level, 8)}`,
              isCurrent ? 'tree-item--current' : '',
              menuFor === node.path ? 'tree-item--menu' : '',
              dragging?.path === node.path ? 'tree-item--dragging' : '',
              dropTarget?.path === node.path ? (dropTarget.valid ? `tree-item--drop-${dropTarget.zone}` : 'tree-item--drop-invalid') : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable={draggable || undefined}
            onDragStart={(event) => {
              if (!draggable || fromPortal(event)) return;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', node.path);
              setDragging(node);
              onDraggingChange?.(node);
              setAnnouncement(`Moving ${title}. Drop on a folder to move it there, or between items to reorder.`);
            }}
            onDragOver={(event) => onDragOver(event, node)}
            onDragLeave={(event) => {
              if (dropTarget?.path === node.path && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDropTarget(undefined);
                if (expandTimer.current?.path === node.path) clearExpandTimer();
              }
            }}
            onDrop={(event) => onDrop(event, node)}
            onDragEnd={endDrag}
            onClick={(event) => {
              if (fromPortal(event)) return;
              setFocused(node.path);
              activate(node);
            }}
            onContextMenu={(event) => {
              if (fromPortal(event)) return;
              event.preventDefault();
              setFocused(node.path);
              setMenuFor(node.path);
            }}
            onKeyDown={(event) => {
              if (!fromPortal(event)) onKeyDown(event, item, index);
            }}
          >
            <span aria-hidden="true" className="tree-item__icon">
              {expandable ? expanded.has(node.path) ? <ChevronDownIcon /> : <ChevronRightIcon /> : <FileTextIcon />}
            </span>
            <span className="tree-item__label">{title}</span>
            <TreeItemMenu
              node={node}
              canWrite={canWrite}
              writeDisabledReason={writeDisabledReason}
              position={{ first: item.first, last: item.last }}
              open={menuFor === node.path}
              onOpenChange={(open) => setMenuFor(open ? node.path : undefined)}
              onAction={(action) => act(action, node)}
              onCloseFocus={() => refs.current.get(node.path)?.focus()}
            >
              {/* Pointer shortcut only: keyboard and screen-reader users open the same menu with Shift+F10. */}
              <button
                type="button"
                className="tree-item__actions"
                tabIndex={-1}
                aria-hidden="true"
                // Names the menu, which Radix labels by its trigger.
                aria-label={`Actions for ${title}`}
                title={`Actions for ${title}`}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <DotsHorizontalIcon />
              </button>
            </TreeItemMenu>
          </li>
        );
      })}
    </ul>
    <p className="visually-hidden" role="status" aria-live="polite">
      {announcement}
    </p>
    </>
  );
});

function findFolder(node: TreeNode, path: string): TreeNode | undefined {
  for (const child of node.children ?? []) {
    if (child.kind !== 'folder') continue;
    if (child.path === path) return child;
    if (path.startsWith(`${child.path}/`)) return findFolder(child, path);
  }
  return undefined;
}
