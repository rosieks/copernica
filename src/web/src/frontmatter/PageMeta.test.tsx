// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Schemas } from '../api/client';
import { PageMeta } from './PageMeta';

afterEach(cleanup);

function meta(overrides: Partial<Schemas['FrontMatter']> = {}): Schemas['FrontMatter'] {
  return {
    readable: true,
    raw: null,
    title: null,
    description: null,
    tags: [],
    status: null,
    owners: [],
    authors: [],
    aliases: [],
    properties: [],
    ...overrides,
  };
}

describe('PageMeta (010 US1)', () => {
  it('renders nothing without front matter or without displayable fields', () => {
    const { container, rerender } = render(<PageMeta frontMatter={null} />);
    expect(container.innerHTML).toBe('');

    rerender(<PageMeta frontMatter={meta({ title: 'Only a title' })} />);
    expect(container.innerHTML).toBe('');
  });

  it.each([
    ['draft', 'Draft', 'This page is a draft and may be incomplete.', 'ui-callout--info'],
    ['deprecated', 'Deprecated', 'This page is deprecated. Its content may be out of date.', 'ui-callout--warning'],
    ['archived', 'Archived', 'This page is archived and kept for reference.', 'ui-callout--warning'],
  ] as const)('shows the %s banner as text', (status, title, text, tone) => {
    render(<PageMeta frontMatter={meta({ status })} />);

    const banner = screen.getByRole('note');
    expect(banner.classList.contains(tone)).toBe(true);
    expect(banner.textContent).toContain(title);
    expect(banner.textContent).toContain(text);
  });

  it('shows the description, people and tags in a labelled region', () => {
    render(
      <PageMeta
        frontMatter={meta({ description: 'How we release.', owners: ['Platform team'], authors: ['Ana', 'Bo'], tags: ['release', 'ci'] })}
      />,
    );

    const region = screen.getByRole('region', { name: 'Page metadata' });
    expect(within(region).getByText('How we release.')).toBeTruthy();
    expect(within(region).getByText('Owner').nextSibling?.textContent).toContain('Platform team');
    expect(within(region).getByText('Authors').nextSibling?.textContent).toContain('Ana, Bo');
    const tags = within(region).getByRole('list', { name: 'Tags' });
    expect(within(tags).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['release', 'ci']);
    expect(tags.querySelector('a, button, [tabindex]')).toBeNull();
  });

  it('shows an unreadable block as a warning with its raw text', () => {
    render(<PageMeta frontMatter={meta({ readable: false, raw: 'title: A\ntitle: B\n' })} />);

    expect(screen.getByRole('note').textContent).toContain("This page's metadata could not be read.");
    const details = screen.getByText('Show metadata source').closest('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('pre')!.textContent).toBe('title: A\ntitle: B\n');
  });

  it('keeps hostile values as text', () => {
    const { container } = render(
      <PageMeta
        frontMatter={meta({
          description: '<img src=x onerror=alert(1)>',
          owners: ['javascript:alert(1)'],
          tags: ['**bold**', '<script>alert(1)</script>'],
          properties: [{ name: '<b>x</b>', value: { kind: 'text', text: '[x](javascript:alert(1))' } }],
        })}
      />,
    );

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(container.querySelector('script, img, strong, b, a')).toBeNull();
  });
});

describe('PageMeta properties (010 US3)', () => {
  it('has no Properties section when there is nothing to list', () => {
    render(<PageMeta frontMatter={meta({ tags: ['x'] })} />);

    expect(screen.queryByText('Properties')).toBeNull();
  });

  it('lists aliases first and then every property in order, collapsed', () => {
    render(
      <PageMeta
        frontMatter={meta({
          aliases: ['Runbook', 'Ops'],
          properties: [
            { name: 'weight', value: { kind: 'text', text: '20' } },
            { name: 'reviewed', value: { kind: 'text', text: '' } },
            { name: 'reviewers', value: { kind: 'list', items: [{ kind: 'text', text: 'Ana' }, { kind: 'text', text: 'Bo' }] } },
            {
              name: 'links',
              value: { kind: 'map', entries: [{ name: 'repo', value: { kind: 'text', text: 'https://example.invalid' } }] },
            },
          ],
        })}
      />,
    );

    const details = screen.getByText('Properties').closest('details')!;
    expect(details.open).toBe(false);
    const names = Array.from(details.querySelectorAll(':scope > dl > div > dt')).map((dt) => dt.textContent);
    expect(names).toEqual(['Also known as', 'weight', 'reviewed', 'reviewers', 'links']);
    expect(screen.getByText('Also known as').nextSibling?.textContent).toContain('Runbook, Ops');
    expect(screen.getByText('reviewed').nextSibling?.textContent).toContain('empty');
    expect((screen.getByText('reviewers').nextSibling as HTMLElement).querySelectorAll('li')).toHaveLength(2);
    const map = (screen.getByText('links').nextSibling as HTMLElement).querySelector('dl')!;
    expect(within(map).getByText('repo').nextSibling?.textContent).toContain('https://example.invalid');
  });

  it('shows web addresses the server marked as links', () => {
    render(
      <PageMeta
        frontMatter={meta({
          properties: [
            { name: 'repo', value: { kind: 'text', text: 'https://example.invalid/repo', href: 'https://example.invalid/repo' } },
            { name: 'evil', value: { kind: 'text', text: 'javascript:alert(1)' } },
          ],
        })}
      />,
    );

    const link = screen.getByRole('link', { name: 'https://example.invalid/repo' });
    expect(link.getAttribute('href')).toBe('https://example.invalid/repo');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
  });

  it('opens and closes from its summary', () => {
    render(<PageMeta frontMatter={meta({ properties: [{ name: 'a', value: { kind: 'text', text: 'b' } }] })} />);

    const summary = screen.getByText('Properties');
    fireEvent.click(summary);
    expect(summary.closest('details')!.open).toBe(true);
    fireEvent.click(summary);
    expect(summary.closest('details')!.open).toBe(false);
  });
});
