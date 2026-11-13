// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { routeContentLinkClick } from './contentLinks';
import { ToastProvider, TooltipProvider } from '../ui';
import { ANCHOR_SKIP_ATTRIBUTE } from '../discussions/textAnchor';
import { SectionLinks } from './SectionLinks';
import { FOLLOW_LAYOUT_MS, HIGHLIGHT_MS, useSectionNavigation } from './useSectionNavigation';

const HTML =
  '<h1 id="user-content-sections">Sections</h1><p>Intro.</p>' +
  '<h2 id="user-content-setup">Setup</h2><p>One.</p>' +
  '<h2 id="user-content-setup-1">Setup</h2><p>Two.</p>' +
  '<h3 id="user-content-zażółć">Zażółć <code>x</code></h3>' +
  '<h4 id="user-content-detail">Detail</h4>';

let location = '';

function ShowLocation() {
  const current = useLocation();
  location = current.pathname + current.search + current.hash;
  return null;
}

function Page({ html = HTML }: { html?: string }) {
  const article = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const current = useLocation();
  useSectionNavigation(article, html);
  return (
    <>
      <article
        ref={article}
        className="prose"
        onClick={(event) => routeContentLinkClick(event, navigate, current)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <SectionLinks article={article} html={html} spaceId="handbook" path="guides/sections.md" commitId={'a'.repeat(40)} isCurrent />
      <ShowLocation />
    </>
  );
}

function renderAt(entry: string, html?: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <TooltipProvider>
          <Page html={html} />
        </TooltipProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const scrolled: Element[] = [];

beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('copy-link control (US1)', () => {
  it('adds one button to every H1–H3 and none to H4', () => {
    renderAt('/s/handbook/guides/sections.md');

    const buttons = screen.getAllByRole('button', { name: /^Copy link to section:/ });
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Copy link to section: Sections',
      'Copy link to section: Setup',
      'Copy link to section: Setup',
      'Copy link to section: Zażółć x',
    ]);
    expect(document.querySelector('h4 .section-link')).toBeNull();
    for (const button of buttons) expect(button.closest(`[${ANCHOR_SKIP_ATTRIBUTE}]`)?.parentElement?.tagName).toMatch(/^H[123]$/);
  });

  it('keeps the heading text, its accessible name and the article text', () => {
    renderAt('/s/handbook/guides/sections.md');

    expect(screen.getAllByRole('heading', { name: 'Setup' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Zażółć x' })).toBeTruthy();
    const article = document.querySelector('article')!;
    const text = article.cloneNode(true) as HTMLElement;
    text.querySelectorAll(`[${ANCHOR_SKIP_ATTRIBUTE}]`).forEach((n) => n.remove());
    expect(article.textContent).toBe(text.textContent);
    expect(article.textContent).toBe('SectionsIntro.SetupOne.SetupTwo.Zażółć xDetail');
  });

  it('does not decorate twice when re-rendered with the same HTML', () => {
    const view = renderAt('/s/handbook/guides/sections.md');
    view.rerender(
      <MemoryRouter initialEntries={['/s/handbook/guides/sections.md']}>
        <ToastProvider>
          <TooltipProvider>
            <Page />
          </TooltipProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(document.querySelectorAll('.section-link')).toHaveLength(4);
  });

  it('copies the section link and shows it in the address bar without scrolling', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderAt('/s/handbook/guides/sections.md');

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Copy link to section: Setup' })[1]!);
    });

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/handbook/guides/sections.md#setup-1`);
    expect(location).toBe('/s/handbook/guides/sections.md#setup-1');
    expect(scrolled).toEqual([]);
    expect(await screen.findByText('Link copied')).toBeTruthy();
  });

  it('encodes non-ASCII ids and offers the dialog when copying is refused', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderAt('/s/handbook/guides/sections.md');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link to section: Zażółć x' }));
    });

    const field = await screen.findByLabelText('Link to this section');
    expect((field as HTMLInputElement).value).toBe(`${window.location.origin}/s/handbook/guides/sections.md#za%C5%BC%C3%B3%C5%82%C4%87`);
  });
});

describe('opening a section (US2)', () => {
  it('scrolls to, focuses and highlights the heading', () => {
    vi.useFakeTimers();
    renderAt('/s/handbook/guides/sections.md#setup-1');

    const heading = document.getElementById('user-content-setup-1')!;
    expect(scrolled).toEqual([heading]);
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(heading.classList.contains('section-target')).toBe(true);

    act(() => vi.advanceTimersByTime(HIGHLIGHT_MS));
    expect(heading.classList.contains('section-target')).toBe(false);
  });

  it('resolves Azure DevOps fragments', () => {
    renderAt('/s/handbook/guides/sections.md#Setup', '<h2 id="user-content-setup">Setup</h2>');

    expect(scrolled).toEqual([document.getElementById('user-content-setup')]);
  });

  it('tells the reader when the section does not exist', async () => {
    renderAt('/s/handbook/guides/sections.md#gone');

    expect(scrolled).toEqual([]);
    expect(await screen.findByText('Section not found')).toBeTruthy();
    expect(screen.getByText(/no section “gone”/)).toBeTruthy();
  });

  it('follows a same-page link as a new history entry', () => {
    renderAt('/s/handbook/guides/sections.md', '<p><a href="#setup">Setup</a></p><h2 id="user-content-setup">Setup</h2>');
    expect(scrolled).toEqual([]);

    fireEvent.click(screen.getByRole('link', { name: 'Setup' }));

    expect(location).toBe('/s/handbook/guides/sections.md#setup');
    expect(scrolled).toEqual([document.getElementById('user-content-setup')]);

    fireEvent.click(screen.getByRole('link', { name: 'Setup' }));
    expect(scrolled).toHaveLength(2);
  });

  it('keeps the heading in place while the layout changes, until the reader takes over', () => {
    vi.useFakeTimers();
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {
          callbacks.length = 0;
        }
      },
    );
    renderAt('/s/handbook/guides/sections.md#setup');
    expect(scrolled).toHaveLength(1);

    callbacks[0]?.([], {} as ResizeObserver);
    expect(scrolled).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(callbacks).toHaveLength(0);

    act(() => vi.advanceTimersByTime(FOLLOW_LAYOUT_MS));
    expect(scrolled).toHaveLength(2);
  });
});
