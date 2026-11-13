// Section addresses (009 data-model.md). The server prefixes every element id in user content
// (HtmlSanitizerFactory.ContentIdPrefix); fragments in URLs stay unprefixed.

export const CONTENT_ID_PREFIX = 'user-content-';

const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u;

/**
 * The server's heading id rule (Markdig `UrilizeAsGfm`, research R1), without de-duplication:
 * letters and digits of any script, `-` and `_` are kept lowercased, a space becomes `-`, the
 * rest is dropped. Works per UTF-16 code unit like .NET, so emoji (surrogate pairs) are dropped.
 */
export function gfmSlug(text: string): string {
  let slug = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === ' ') slug += '-';
    else if (c === '-' || c === '_' || LETTER_OR_DIGIT.test(c)) slug += c.toLowerCase();
  }
  return slug.length > 0 ? slug : 'section';
}

/** The fragment without `#`, percent-decoded; a malformed fragment is used as typed. */
export function decodeFragment(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The URL fragment for a section id (`#` plus the encoded id). */
export function sectionHash(id: string): string {
  return '#' + encodeURIComponent(id);
}

/** The section id of a rendered element, or null when it is not user content. */
export function sectionId(element: Element): string | null {
  return element.id.startsWith(CONTENT_ID_PREFIX) ? element.id.slice(CONTENT_ID_PREFIX.length) : null;
}

function findById(root: Element, id: string): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>('[id]')) {
    if (element.id === id) return element;
  }
  return null;
}

/**
 * The element a fragment points to inside `root` (the page article): the exact id first, then
 * the server's slug of the fragment, which turns Azure DevOps links (punctuation kept, research
 * R4) into this wiki's ids. Null when nothing matches.
 */
export function resolveSection(root: Element, hash: string): HTMLElement | null {
  const fragment = decodeFragment(hash);
  if (fragment.length === 0) return null;
  return findById(root, CONTENT_ID_PREFIX + fragment) ?? findById(root, CONTENT_ID_PREFIX + gfmSlug(fragment));
}
