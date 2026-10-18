// How a drawn diagram is shown: only as an image (constitution v1.3.0). The SVG text is never
// parsed into the wiki document; an image document cannot run scripts or load resources.

export function svgImageSrc(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** `alt` text: "name", or "name. description". */
export function diagramAltText(name: string, description?: string | null): string {
  const text = description?.trim();
  if (!text) return name;
  return `${name.replace(/[.\s]+$/, '')}. ${text}`;
}
