// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '../ui';
import { PageInfo } from './PageInfo';

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PageInfo', () => {
  it('describes the shown version from history?version=…&limit=1', async () => {
    const fetch = respond(200, {
      items: [{ commitId: 'c'.repeat(40), authorName: 'Grace', authorEmail: 'g@x', authoredAt: '2026-10-17T08:00:00Z', message: 'Second pass.' }],
      nextCursor: null,
    });
    vi.stubGlobal('fetch', fetch);

    render(wrap(<PageInfo spaceId="handbook" path="guides/history.md" commitId={'a'.repeat(40)} />));

    expect(await screen.findByText('Grace')).toBeTruthy();
    expect(screen.getByText(/Second pass\./)).toBeTruthy();
    const time = document.querySelector('time')!;
    expect(time.getAttribute('datetime')).toBe('2026-10-17T08:00:00Z');
    expect(time.tabIndex).toBe(0);
    expect(String(fetch.mock.calls[0]![0])).toBe(`/api/spaces/handbook/history/guides/history.md?version=${'a'.repeat(40)}&limit=1`);
  });

  it('renders nothing when the information cannot be loaded', async () => {
    const fetch = respond(500, { title: 'Broken' });
    vi.stubGlobal('fetch', fetch);

    const { container } = render(wrap(<PageInfo spaceId="handbook" path="a.md" commitId={'a'.repeat(40)} />));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.page__info')).toBeNull());
  });
});
