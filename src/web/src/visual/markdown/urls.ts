/**
 * URL rules for the visual editor (contracts/fidelity.md §5). They mirror the server:
 * `HtmlSanitizerFactory.AllowedSchemes` and `WikiLinkRewriter.Resolve`/`ResolvePath`.
 * The Markdown always keeps the URL as written; these functions only decide what the editor
 * may put into an `href` or load as an image.
 */

/** Must equal `AllowedSchemes` in src/Copernica/Rendering/HtmlSanitizerFactory.cs (pinned by a test). */
export const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

const WIKI_SCHEME = 'wiki:';

/**
 * A link destination as the address it means: without `<…>` and with backslash escapes
 * resolved. Destinations are stored as written so unchanged ones are written back the same.
 */
export function normalizeDestination(raw: string): string {
  const trimmed = raw.trim();
  const inner = trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed;
  return inner.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** `scheme:` prefix, or null for relative and space-root targets. */
function schemeOf(url: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** True for links with a scheme or protocol-relative ones (WikiLinkRewriter.IsExternal). */
export function isExternal(url: string): boolean {
  return url.startsWith('//') || (!url.startsWith('/') && schemeOf(url) !== null);
}

/**
 * Whether the editor may use the URL: links may be external with an allowed scheme or internal
 * (relative, space-root, `wiki:`, `#fragment`); images may also be `data:image/*`.
 */
export function isAllowedUrl(url: string, kind: 'link' | 'image'): boolean {
  const trimmed = normalizeDestination(url);
  if (EMAIL.test(trimmed)) return kind === 'link';
  if (trimmed.toLowerCase().startsWith(WIKI_SCHEME)) return true;
  if (kind === 'image' && /^data:image\/[a-z0-9.+-]+[;,]/i.test(trimmed)) return true;
  if (trimmed.startsWith('//')) return kind === 'link';
  const scheme = schemeOf(trimmed);
  if (scheme === null) return true;
  return ALLOWED_SCHEMES.includes(scheme);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves a target against the folder of `pagePath`; a leading `/` resolves from the space
 * root. Null when the result escapes the space (WikiLinkRewriter.ResolvePath).
 */
export function resolvePath(pagePath: string, relative: string): string | null {
  const decoded = safeDecode(relative).replace(/\\/g, '/');
  const segments = decoded.startsWith('/') ? [] : pagePath.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length === 0 ? null : segments.join('/');
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function splitFragment(target: string): { path: string; fragment: string } {
  const i = target.search(/[#?]/);
  if (i < 0) return { path: target, fragment: '' };
  return { path: target.slice(0, i), fragment: target[i] === '#' ? target.slice(i) : '' };
}

/** The address a link opens in the wiki, or null when it must not get an `href`. */
export function resolvePageHref(href: string, spaceId: string, pagePath: string): string | null {
  const target = normalizeDestination(href);
  // Email autolinks (`<a@b.c>`, GFM `a@b.c`) open a mail client like the server's links.
  if (EMAIL.test(target)) return `mailto:${target}`;
  if (target.toLowerCase().startsWith(WIKI_SCHEME)) {
    const rest = target.slice(WIKI_SCHEME.length).replace(/^\/+/, '');
    const slash = rest.indexOf('/');
    return slash <= 0 ? null : `/s/${rest.slice(0, slash)}/${rest.slice(slash + 1)}`;
  }
  if (target.startsWith('#')) return target;
  if (isExternal(target)) return isAllowedUrl(target, 'link') ? target : null;
  const { path, fragment } = splitFragment(target);
  const resolved = resolvePath(pagePath, path);
  if (resolved === null) return null;
  if (resolved.toLowerCase().endsWith('.md')) return `/s/${spaceId}/${encodePath(resolved)}${fragment}`;
  return `/api/spaces/${spaceId}/files/${encodePath(resolved)}`;
}

export interface PendingImage {
  repositoryPath: string;
  previewUrl: string;
}

/**
 * The address the editor loads an image from, or null for images it must not load
 * (external images, disallowed schemes, paths outside the space). Null is shown as an
 * "External image" frame.
 */
export function resolveImageSrc(
  src: string,
  spaceId: string,
  pagePath: string,
  pending: readonly PendingImage[] = [],
): string | null {
  const target = normalizeDestination(src);
  if (/^data:image\//i.test(target)) return isAllowedUrl(target, 'image') ? target : null;
  if (isExternal(target) || target.toLowerCase().startsWith(WIKI_SCHEME)) return null;
  const { path } = splitFragment(target);
  const resolved = resolvePath(pagePath, path);
  if (resolved === null) return null;
  const upload = pending.find((p) => p.repositoryPath === resolved);
  if (upload) return upload.previewUrl;
  return `/api/spaces/${spaceId}/files/${encodePath(resolved)}`;
}
