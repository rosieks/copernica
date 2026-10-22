import { test, type Page } from '@playwright/test';
import { scanWcag } from './a11y';
import { viewports } from './ui-helpers';

/** Puts a file on the editor as if it was pasted (003). */
async function pasteFile(page: Page, name: string, type: string, base64: string) {
  const editor = page.getByRole('textbox', { name: 'Page content (Markdown)' });
  await editor.click();
  await editor.evaluate(
    (target, file) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))], file.name, { type: file.type }));
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    },
    { name, type, base64 },
  );
}

/** Opens a tree item's actions menu from the keyboard (005 contracts/ui.md §1). */
async function openTreeMenu(page: Page, name: string) {
  await page.getByRole('tree', { name: 'Pages' }).getByRole('treeitem', { name, exact: true }).focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menu').waitFor();
}

// 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface Screen {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
  /** Only meaningful at some widths. */
  widths?: number[];
  editorMode?: 'visual' | 'markdown';
}

const visualEditor = (p: Page) => p.getByRole('textbox', { name: 'Page content', exact: true });

/** Puts the caret at the end of the visual editor's text and waits for ProseMirror to see it. */
async function caretAtEnd(p: Page) {
  await visualEditor(p).click();
  await p.keyboard.press('ControlOrMeta+End');
}

/** 007 contracts/ui.md §11: the visual editor and everything it opens. */
const VISUAL: Screen[] = [
  { name: 'Visual editor', url: '/s/visual/-/edit/toc-html-frontmatter.md', editorMode: 'visual' },
  {
    name: 'Visual editor "/" menu',
    url: '/s/visual/-/edit/index.md',
    editorMode: 'visual',
    prepare: async (p) => {
      await caretAtEnd(p);
      await p.keyboard.press('Enter');
      await p.keyboard.type('/');
      await p.getByRole('listbox', { name: 'Insert block' }).waitFor();
    },
  },
  {
    name: 'Visual editor link dialog',
    url: '/s/visual/-/edit/index.md',
    editorMode: 'visual',
    prepare: async (p) => {
      await caretAtEnd(p);
      await p.keyboard.press('ControlOrMeta+k');
      await p.getByRole('dialog', { name: 'Insert link' }).getByRole('option').first().waitFor();
    },
  },
  {
    name: 'Visual editor diagram dialog',
    url: '/s/visual/-/edit/index.md',
    editorMode: 'visual',
    widths: [viewports.wide.width, viewports.medium.width],
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Insert diagram' }).click();
      await p.getByRole('dialog', { name: 'Edit diagram' }).getByRole('img').waitFor();
    },
  },
  {
    name: 'Visual editor table menu',
    url: '/s/visual/-/edit/tables.md',
    editorMode: 'visual',
    widths: [viewports.wide.width, viewports.medium.width],
    prepare: async (p) => {
      await visualEditor(p).getByRole('cell', { name: 'Dev' }).first().click();
      await p.getByRole('button', { name: 'Table' }).click();
      await p.getByRole('menu', { name: 'Table' }).waitFor();
    },
  },
  {
    name: 'Visual editor more formatting',
    url: '/s/visual/-/edit/index.md',
    editorMode: 'visual',
    widths: [viewports.narrow.width],
    prepare: async (p) => {
      await p.getByRole('button', { name: 'More formatting' }).click();
      await p.getByRole('menu', { name: 'More formatting' }).waitFor();
    },
  },
  {
    name: 'Visual editor link bar',
    url: '/s/visual/-/edit/images-links.md',
    editorMode: 'visual',
    widths: [viewports.wide.width],
    prepare: async (p) => {
      await visualEditor(p).getByRole('link', { name: 'setup' }).click();
      await p.getByRole('group', { name: 'Link' }).waitFor();
    },
  },
];

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
  {
    name: 'Image description dialog',
    url: '/s/handbook/-/edit/guides/setup.md',
    prepare: async (p) => {
      await pasteFile(p, 'screenshot.png', 'image/png', PNG);
      await p.getByRole('dialog', { name: /Describe the image/ }).waitFor();
    },
  },
  {
    name: 'Image upload error',
    url: '/s/handbook/-/edit/guides/setup.md',
    prepare: async (p) => {
      await pasteFile(p, 'notes.txt', 'image/png', btoa('Not an image'));
      await p.getByRole('alert').filter({ hasText: 'was not added' }).waitFor();
    },
  },
  { name: 'Shortcut help', url: '/s/handbook/index.md', prepare: (p) => p.getByRole('article').first().click().then(() => p.keyboard.press('Shift+?')) },
  {
    name: 'Navigation sheet',
    url: '/s/handbook/index.md',
    widths: [viewports.narrow.width],
    prepare: (p) => p.getByRole('button', { name: 'Open navigation' }).click(),
  },
  // 005: tree management (quickstart T31).
  {
    name: 'Tree item menu',
    url: '/s/handbook/index.md',
    widths: [viewports.wide.width],
    prepare: (p) => openTreeMenu(p, 'Team Handbook'),
  },
  {
    name: 'Rename dialog',
    url: '/s/handbook/index.md',
    widths: [viewports.wide.width],
    prepare: async (p) => {
      await openTreeMenu(p, 'Team Handbook');
      await p.getByRole('menuitem', { name: 'Rename…' }).click();
      await p.getByRole('dialog', { name: 'Rename page' }).getByLabel('Title').fill('Handbook');
    },
  },
  {
    name: 'Move dialog',
    url: '/s/handbook/index.md',
    widths: [viewports.wide.width],
    prepare: async (p) => {
      await openTreeMenu(p, 'Team Handbook');
      await p.getByRole('menuitem', { name: 'Move…' }).click();
      await p.getByRole('dialog').getByLabel('guides').check();
    },
  },
  {
    name: 'New folder dialog',
    url: '/s/handbook/index.md',
    widths: [viewports.wide.width],
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Space actions' }).click();
      await p.getByRole('menuitem', { name: 'New folder…' }).click();
    },
  },
  {
    name: 'Delete folder dialog',
    url: '/s/handbook/index.md',
    widths: [viewports.wide.width],
    prepare: async (p) => {
      await openTreeMenu(p, 'guides');
      await p.getByRole('menuitem', { name: 'Delete…' }).click();
      await p.getByRole('alertdialog').getByText(/This removes \d+ pages/).waitFor();
    },
  },
  {
    name: 'Tree drag in progress',
    url: '/s/handbook/index.md',
    widths: [viewports.wide.width],
    prepare: async (p) => {
      // A drag that stays in progress while scanning: dragstart and dragover without a drop.
      const tree = p.getByRole('tree', { name: 'Pages' });
      await tree.getByRole('treeitem', { name: 'Team Handbook' }).evaluate((source) => {
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      });
      await tree.locator('.tree-item--dragging').waitFor();
      await tree.getByRole('treeitem', { name: 'guides' }).evaluate((target) => {
        const box = target.getBoundingClientRect();
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientY: box.top + box.height / 2 }));
      });
      await tree.locator('.tree-item--drop-into').waitFor();
    },
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
    // 007 SC-006: the visual editor at three widths.
    for (const width of [viewports.wide.width, viewports.medium.width, viewports.narrow.width]) {
      for (const screen of VISUAL.filter((s) => !s.widths || s.widths.includes(width))) {
        test(`${screen.name} — ${theme}, ${width}px`, async ({ browser }) => {
          await scanWcag(browser, screen.url, { theme, width, prepare: screen.prepare, editorMode: screen.editorMode });
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
