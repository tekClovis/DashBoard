import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import * as widgetData from '@/realtime/useWidgetData.js';
import { DashboardPage } from './DashboardPage.js';

export const instance = {
  id: 'i1',
  dashboardId: 'dash-1',
  service: 'weather',
  widget: 'forecast',
  params: { city: 'Paris' },
  refreshRate: 120,
  x: 4,
  y: 2,
  w: 4,
  h: 3,
};

export const catalog = {
  services: [
    {
      name: 'weather',
      connection: 'none',
      connected: true,
      status: 'OK',
      widgets: [
        {
          service: 'weather',
          name: 'forecast',
          description: 'Forecast',
          minRefreshSec: 60,
          params: [{ name: 'city', type: 'string', pattern: '^[A-Za-z]+$', required: true }],
        },
      ],
    },
    {
      name: 'github',
      connection: 'oauth',
      connected: false,
      status: 'REAUTH',
      widgets: [
        { service: 'github', name: 'commits', description: 'Commits', minRefreshSec: 300, params: [] },
      ],
    },
  ],
};

export const calls: { url: string; method: string; body?: unknown }[] = [];

/** Stubs useWidgetData and fetch (records every request in `calls`). Undo with vi.restoreAllMocks/unstubAllGlobals. */
export function setupPage() {
  calls.length = 0;
  vi.spyOn(widgetData, 'useWidgetData').mockReturnValue({ data: undefined } as ReturnType<
    typeof widgetData.useWidgetData
  >);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const body =
        url === '/api/catalog'
          ? catalog
          : url === '/api/dashboards'
            ? { dashboards: [{ id: 'dash-1', name: 'Home', position: 0 }] }
            : url.endsWith('/widgets') && method === 'GET'
              ? { widgets: [instance] }
              : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
}

type Match = (url: string, method: string) => boolean;

/** Makes requests matching `match` answer `respond()` until the returned function is called. */
export function respondWhen(match: Match, respond: () => Response) {
  const ok = vi.mocked(fetch).getMockImplementation()!;
  let active = true;
  vi.mocked(fetch).mockImplementation((url, init) =>
    active && typeof url === 'string' && match(url, init?.method ?? 'GET') ? Promise.resolve(respond()) : ok(url, init),
  );
  return () => {
    active = false;
  };
}

/** Makes requests matching `match` answer 500 until the returned function is called. */
export const failWhen = (match: Match) => respondWhen(match, () => new Response('{}', { status: 500 }));

/** Renders {@link DashboardPage} at `/d/dash-1` with a retry-free query client. */
export function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/d/dash-1']}>
        <Routes>
          <Route path="/d/:dashboardId" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Opens the weather widget's options menu via keyboard and clicks the item named `name`. */
export async function openMenuItem(name: string) {
  const trigger = await screen.findByRole('button', { name: 'Weather Forecast options' });
  // Keyboard open: after a menu item unmounts its own widget (Remove), Radix ignores later
  // synthetic pointerdowns in jsdom, but Enter on the focused trigger still opens it.
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name }));
}
