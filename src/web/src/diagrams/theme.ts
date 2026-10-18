import type { ThemeTokens } from './protocol';

const srgbCache = new Map<string, string>();

/**
 * The colour as `#rrggbb`. Tokens may resolve to `color(display-p3 …)` (Radix P3 palettes),
 * which Mermaid's colour maths cannot read; painting one canvas pixel converts any CSS colour
 * to sRGB. Without a canvas (tests) the value is returned as is.
 */
function toSrgbHex(value: string): string {
  if (!value || /^#[0-9a-f]{6}$/i.test(value)) return value;
  const cached = srgbCache.get(value);
  if (cached !== undefined) return cached;
  let result = value;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) {
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      result = '#' + [r, g, b].map((c = 0) => c.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Keep the original value.
  }

  srgbCache.set(value, result);
  return result;
}

/** The design token colours diagrams are drawn with (contracts/ui.md, Theme). */
export function currentThemeTokens(root: HTMLElement = document.documentElement): ThemeTokens {
  const style = getComputedStyle(root);
  const token = (name: string) => toSrgbHex(style.getPropertyValue(name).trim());
  return {
    dark: root.classList.contains('dark'),
    background: token('--color-bg'),
    text: token('--color-text'),
    mutedText: token('--color-text-muted'),
    border: token('--color-border'),
    primary: token('--color-accent-solid'),
    primarySubtle: token('--color-accent-subtle'),
    subtle: token('--color-bg-subtle'),
  };
}
