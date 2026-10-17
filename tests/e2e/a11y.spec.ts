import { test, type Page } from '@playwright/test';
import { scanWcag } from './a11y';
import { viewports } from './ui-helpers';

interface Screen {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
  /** Only meaningful at some widths. */
  widths?: number[];
}

const SCREENS: Screen[] = [
  { name: 'S2 space list', url: '/' },
  { name: 'S3 page', url: '/s/handbook/index.md' },
  { name: 'S3 old version', url: '/s/handbook/-/history/guides/history.md', prepare: (p) => p.getByRole('link', { name: /, version of / }).first().click() },
  { name: 'S4 editor', url: '/s/handbook/-/edit/guides/setup.md' },
  { name: 'S5 history', url: '/s/handbook/-/history/guides/history.md' },
  { name: 'S7 profile', url: '/profile' },
  {
    name: 'New page dialog',
    url: '/s/handbook/index.md',
    widths: [viewports.wide.width],
    prepare: (p) => p.getByRole('button', { name: 'New page' }).click(),
  },
  {
    name: 'Delete page dialog',
    url: '/s/handbook/guides/setup.md',
    widths: [viewports.wide.width],
    prepare: async (p) => {
      await p.getByRole('button', { name: 'More page actions' }).click();
      await p.getByRole('menuitem', { name: 'Delete page…' }).click();
      // Hover the destructive button too: its hover colour must keep the contrast.
      await p.getByRole('alertdialog').getByRole('button', { name: 'Delete page' }).hover();
    },
  },
  { name: 'Shortcut help', url: '/s/handbook/index.md', prepare: (p) => p.getByRole('article').first().click().then(() => p.keyboard.press('Shift+?')) },
  {
    name: 'Navigation sheet',
    url: '/s/handbook/index.md',
    widths: [viewports.narrow.width],
    prepare: (p) => p.getByRole('button', { name: 'Open navigation' }).click(),
  },
  {
    name: 'Discussions sheet',
    url: '/s/handbook/index.md',
    widths: [viewports.narrow.width],
    prepare: (p) => p.getByRole('button', { name: /^Discussions \(\d+\)$/ }).click(),
  },
];

test.describe('002 — WCAG 2.1 AA (V25)', () => {
  test.slow();

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [viewports.wide.width, viewports.narrow.width]) {
      for (const screen of SCREENS.filter((s) => !s.widths || s.widths.includes(width))) {
        test(`${screen.name} — ${theme}, ${width}px`, async ({ browser }) => {
          await scanWcag(browser, screen.url, { theme, width, prepare: screen.prepare });
        });
      }
    }
  }

  // The sign-in screen renders at /signin whether or not the visitor is signed in.
  for (const theme of ['light', 'dark'] as const) {
    test(`S1 sign-in — ${theme}`, async ({ browser }) => {
      await scanWcag(browser, '/signin', { theme, width: viewports.narrow.width });
    });
  }
});
