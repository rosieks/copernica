import type { Node as PMNode } from 'prosemirror-model';
import type { SourceSnapshot } from './parse';

/**
 * Cursor mapping between the visual and the Markdown editor (contracts/fidelity.md M2): the
 * cursor goes to the innermost block that contains it, or to the start of the document.
 */

type Src = { from: number; to: number };

/** Child indexes from the document down to the innermost node containing `pos`. */
export function blockPath(doc: PMNode, pos: number): number[] {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  const path: number[] = [];
  for (let depth = 0; depth < $pos.depth; depth++) path.push($pos.index(depth));
  // A selected atom (placeholder, rule, diagram) sits right after the position.
  if ($pos.nodeAfter && !$pos.parent.isTextblock) path.push($pos.index($pos.depth));
  return path;
}

/**
 * The Markdown offset of the deepest block on `path` in a document freshly parsed from that
 * Markdown (so its source offsets are current).
 */
export function offsetForPath(doc: PMNode, snapshot: SourceSnapshot, path: readonly number[]): number {
  let node: PMNode = doc;
  let best = 0;
  for (const index of path) {
    if (index >= node.childCount) break;
    node = node.child(index);
    const src = node.attrs.src as Src | null | undefined;
    if (src) best = snapshot.preamble.length + src.from;
  }
  return best;
}

/** A document position inside the innermost block whose source contains `offset`. */
export function positionForOffset(doc: PMNode, snapshot: SourceSnapshot, offset: number): number {
  const target = offset - snapshot.preamble.length;
  let found = 0;
  let foundSize = Infinity;
  doc.descendants((node, pos) => {
    const src = node.attrs.src as Src | null | undefined;
    if (!src || target < src.from || target > src.to) return src ? false : true;
    const size = src.to - src.from;
    if (size <= foundSize) {
      found = pos + 1;
      foundSize = size;
    }
    return true;
  });
  return found;
}
