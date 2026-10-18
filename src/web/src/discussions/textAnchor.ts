/**
 * Anchors over the article's plain text (`textContent`), matching the server (research.md R6).
 * UI added to the page in the browser (diagram toolbars, status text) is marked with
 * `data-anchor-skip` and left out, so the text stays identical to the server's.
 */

export const ANCHOR_SKIP_ATTRIBUTE = 'data-anchor-skip';

export const CONTEXT_LENGTH = 32;
export const MAX_EXACT_LENGTH = 2000;

export interface TextAnchorInput {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const skipped = node.parentElement?.closest(`[${ANCHOR_SKIP_ATTRIBUTE}]`);
      return skipped && root.contains(skipped) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

/** The anchoring text of `root`: its `textContent` without skipped UI. */
export function anchorText(root: Node): string {
  return textNodes(root)
    .map((node) => node.data)
    .join('');
}

/** Offset of (node, offset) within the anchoring text. */
function absoluteOffset(root: Node, container: Node, offset: number): number | undefined {
  if (container.nodeType !== Node.TEXT_NODE) {
    // Boundary between children: measure the text nodes before it.
    const boundary = document.createRange();
    boundary.setStart(container, offset);
    let total = 0;
    for (const node of textNodes(root)) {
      if (boundary.comparePoint(node, node.data.length) > 0) break;
      total += node.data.length;
    }
    return total;
  }
  let total = 0;
  for (const node of textNodes(root)) {
    if (node === container) return total + offset;
    total += node.data.length;
  }
  return undefined;
}

/** Converts a selection inside `root` to an anchor, or undefined if it is empty or outside. */
export function anchorFromSelection(root: HTMLElement, selection: Selection | null): TextAnchorInput | undefined {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return undefined;

  const text = anchorText(root);
  let start = absoluteOffset(root, range.startContainer, range.startOffset);
  let end = absoluteOffset(root, range.endContainer, range.endOffset);
  if (start === undefined || end === undefined || end <= start) return undefined;

  // Trim surrounding whitespace so double-click selections do not include it.
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  if (end <= start || end - start > MAX_EXACT_LENGTH) return undefined;

  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + CONTEXT_LENGTH),
    start,
    end,
  };
}

/** DOM ranges covering [start, end) of `root.textContent` (one per text node touched). */
export function rangesForOffsets(root: HTMLElement, start: number, end: number): Range[] {
  const ranges: Range[] = [];
  let position = 0;
  for (const node of textNodes(root)) {
    const nodeStart = position;
    const nodeEnd = position + node.data.length;
    position = nodeEnd;
    if (nodeEnd <= start || nodeStart >= end) continue;
    const range = document.createRange();
    range.setStart(node, Math.max(0, start - nodeStart));
    range.setEnd(node, Math.min(node.data.length, end - nodeStart));
    ranges.push(range);
  }
  return ranges;
}

/** Offset within `root.textContent` of a DOM point (used to find the discussion under a click). */
export function offsetAt(root: HTMLElement, node: Node, offset: number): number | undefined {
  return absoluteOffset(root, node, offset);
}
