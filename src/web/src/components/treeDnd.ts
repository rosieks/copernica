/** Drag and drop in the page tree (005 research R11, contracts/ui.md §6): pure geometry and rules. */

export type DropZone = 'into' | 'before' | 'after' | 'none';

export interface DndItem {
  path: string;
  kind: 'page' | 'folder';
}

/** Hovering a collapsed folder this long expands it. */
export const EXPAND_DELAY_MS = 700;

/** Distance from the top or bottom edge of the scroll area that scrolls it. */
export const EDGE_PX = 32;

export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * Where a drop over `target` would go: the top or bottom quarter of a sibling reorders, the
 * middle half of a folder row moves into it. A folder of another parent accepts the whole row.
 */
export function dropZone(rect: { top: number; height: number }, clientY: number, dragged: DndItem, target: DndItem): DropZone {
  const position = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  const sibling = parentOf(target.path) === parentOf(dragged.path);
  if (sibling && position < 0.25) return 'before';
  if (sibling && position > 0.75) return 'after';
  return target.kind === 'folder' ? 'into' : 'none';
}

/** Whether dropping `dragged` on `target` in `zone` does something allowed. */
export function isValidDrop(dragged: DndItem, target: DndItem, zone: DropZone): boolean {
  if (zone === 'none' || target.path === dragged.path) return false;
  if (zone === 'into') {
    if (target.kind !== 'folder') return false;
    if (parentOf(dragged.path) === target.path) return false; // already there
    return !(dragged.kind === 'folder' && target.path.startsWith(`${dragged.path}/`));
  }
  return parentOf(target.path) === parentOf(dragged.path);
}

/**
 * The `before` of a reorder request: the sibling the dragged item ends up in front of, or null
 * for the end. `siblings` are the names in the folder in display order.
 */
export function reorderBefore(siblings: string[], dragged: string, target: string, zone: 'before' | 'after'): string | null {
  const others = siblings.filter((name) => name !== dragged);
  if (zone === 'before') return target;
  const index = others.indexOf(target);
  return index >= 0 && index + 1 < others.length ? others[index + 1]! : null;
}

/** -1 to scroll up, 1 to scroll down, 0 to stay, for a pointer near the edges of the scroll area. */
export function edgeScroll(rect: { top: number; bottom: number }, clientY: number, edge = EDGE_PX): -1 | 0 | 1 {
  if (clientY < rect.top + edge) return -1;
  if (clientY > rect.bottom - edge) return 1;
  return 0;
}
