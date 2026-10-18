import { expect, type Page } from '@playwright/test';

/** Widths from specs/002-accessible-wiki-ui/quickstart.md (V7–V9). */
export const viewports = {
  wide: { width: 1280, height: 900 },
  medium: { width: 1000, height: 800 },
  narrow: { width: 320, height: 720 },
} as const;

export async function withTheme(page: Page, colorScheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme });
}

/**
 * Records `securitypolicyviolation` events from the first script of every document.
 * Call before navigating; read with the returned function.
 */
export async function collectCspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'} ${e.sourceFile}:${e.lineNumber}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp ?? []);
}

/** No horizontal scrolling of the whole screen (FR-009, WCAG 1.4.10). */
export async function expectNoReflow(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth);
}

/** The element that has focus is never <body> after an interaction (FR-014). */
export async function expectFocusNotLost(page: Page): Promise<void> {
  // After navigation focus moves to the new view's heading once it has rendered (RouteAnnouncer).
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? 'BODY'), { message: 'focus fell back to <body>', timeout: 3_000 })
    .not.toBe('BODY');
}
