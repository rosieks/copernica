import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Schemas } from '../api/client';

type TreeNode = Schemas['TreeNode'];

interface VisibleItem {
  node: TreeNode;
  level: number;
  parent?: string;
}

function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

/** Accessible page tree (WAI-ARIA tree pattern) with roving focus and arrow-key navigation. */
export function PageTree({ spaceId, root, currentPath }: { spaceId: string; root: TreeNode; currentPath?: string }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentPath ? ancestors(currentPath) : []));
  const [focused, setFocused] = useState<string | undefined>(currentPath);
  const refs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (!currentPath) return;
    setExpanded((prev) => new Set([...prev, ...ancestors(currentPath)]));
    setFocused(currentPath);
  }, [currentPath]);

  const visible = useMemo(() => {
    const items: VisibleItem[] = [];
    const walk = (nodes: TreeNode[], level: number, parent?: string) => {
      for (const node of nodes) {
        items.push({ node, level, parent });
        if (node.kind === 'folder' && expanded.has(node.path)) walk(node.children ?? [], level + 1, node.path);
      }
    };
    walk(root.children ?? [], 1);
    return items;
  }, [root, expanded]);

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

  function activate(node: TreeNode) {
    if (node.kind === 'folder') toggle(node.path);
    else navigate(`/s/${spaceId}/${node.path.split('/').map(encodeURIComponent).join('/')}`);
  }

  function onKeyDown(event: KeyboardEvent, item: VisibleItem, index: number) {
    const { node } = item;
    const isOpen = node.kind === 'folder' && expanded.has(node.path);
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
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <ul role="tree" aria-label="Pages" className="page-tree">
      {visible.map((item, index) => {
        const { node, level } = item;
        const isFolder = node.kind === 'folder';
        const isCurrent = node.path === currentPath;
        return (
          <li
            key={node.path}
            ref={(el) => {
              if (el) refs.current.set(node.path, el);
              else refs.current.delete(node.path);
            }}
            role="treeitem"
            aria-level={level}
            aria-expanded={isFolder ? expanded.has(node.path) : undefined}
            aria-selected={isCurrent}
            aria-current={isCurrent ? 'page' : undefined}
            tabIndex={node.path === focusKey ? 0 : -1}
            className={`tree-item level-${Math.min(level, 8)} ${isFolder ? 'folder' : 'page'} ${isCurrent ? 'current' : ''}`}
            onClick={() => {
              setFocused(node.path);
              activate(node);
            }}
            onKeyDown={(event) => onKeyDown(event, item, index)}
          >
            {isFolder && <span aria-hidden="true" className="tree-toggle">{expanded.has(node.path) ? '▾' : '▸'}</span>}
            {node.title ?? node.name}
          </li>
        );
      })}
    </ul>
  );
}
