/**
 * A starting point for the image description (FR-005), from the file name:
 * "network-diagram_v2.png" → "Network diagram v2"; generic clipboard names → "Image".
 */
export function suggestAlt(fileName: string): string {
  const base = (fileName.split(/[\\/]/).pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
  // The original file name is used (not the stored one with its random suffix).
  const words = base.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words || /^(image|blob|clipboard|pasted image)$/i.test(words)) return 'Image';
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** Markdown for an image; brackets in the description are escaped. */
export function imageMarkdown(alt: string, link: string): string {
  return `![${alt.replace(/([[\]\\])/g, '\\$1')}](${link})`;
}
