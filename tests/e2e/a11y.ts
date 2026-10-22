import { createRequire } from 'node:module';
import { expect, type Browser, type Page } from '@playwright/test';
import { signIn } from './helpers';
import { baseURL } from './env';

const require = createRequire(import.meta.url);

/**
 * IBM Equal Access engine (accessibility-checker-engine, Apache-2.0, test-only; 002 research
 * R10). API per its README: `new ace.Checker().check(document, [policy])` → report.results[],
 * each with `value: [level, outcome]`; a WCAG failure is `["VIOLATION", "FAIL"]`.
 * Policy identifier for WCAG 2.1 A + AA: "WCAG_2_1".
 */
const ENGINE = require.resolve('accessibility-checker-engine/ace.js');
const POLICY = 'WCAG_2_1';

export interface ScanOptions {
  theme: 'light' | 'dark';
  width: number;
  user?: 'alice' | 'bob';
  /** The page editor's mode (007); Markdown unless given. */
  editorMode?: 'visual' | 'markdown';
  /** Runs after navigation, e.g. to open a dialog before scanning. */
  prepare?: (page: Page) => Promise<void>;
}

interface Violation {
  ruleId: string;
  message: string;
  path: string;
}

/**
 * Scans one screen. Injecting the engine needs `bypassCSP`, so the scan runs in its own
 * browser context; CSP behaviour is tested separately in normal contexts (csp.spec.ts).
 */
export async function scanWcag(browser: Browser, url: string, options: ScanOptions): Promise<void> {
  const context = await browser.newContext({
    bypassCSP: true,
    baseURL,
    colorScheme: options.theme,
    viewport: { width: options.width, height: 900 },
  });
  try {
    const page = await context.newPage();
    await signIn(page, options.user ?? 'alice', { editorMode: options.editorMode ?? 'markdown' });
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await options.prepare?.(page);
    // Scan the settled screen, not an overlay that is still fading in.
    // (Only finite ones: a focused editor's blinking cursor animates forever.)
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
    );
    await page.addScriptTag({ path: ENGINE });
    const violations = await page.evaluate(async (policy) => {
      const ace = (window as unknown as { ace: { Checker: new () => { check(doc: Document, p: string[]): Promise<unknown> } } }).ace;
      const report = (await new ace.Checker().check(document, [policy])) as {
        results: { ruleId: string; value: [string, string]; message: string; path: { dom: string } }[];
      };
      const node = (xpath: string) =>
        document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null;
      return report.results
        .filter((r) => r.value[0] === 'VIOLATION' && r.value[1] === 'FAIL')
        // Known exception: Radix's focus guards are aria-hidden, tabindex=0 sentinel <span>s at the
        // edges of <body> while a modal is open; focusing one immediately moves focus back into
        // the dialog. They are part of the focus trap, not content (002 research R10).
        .filter((r) => !(r.ruleId === 'aria_hidden_nontabbable' && node(r.path.dom)?.hasAttribute('data-radix-focus-guard')))
        .map((r) => ({ ruleId: r.ruleId, message: r.message, path: r.path.dom }));
    }, POLICY);
    expect(violations as Violation[], `WCAG 2.1 AA violations on ${url} (${options.theme}, ${options.width}px)`).toEqual([]);
  } finally {
    await context.close();
  }
}
