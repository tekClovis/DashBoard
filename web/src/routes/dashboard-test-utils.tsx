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
        url === '/api/catalog' ? catalog : url.endsWith('/widgets') && method === 'GET' ? { widgets: [instance] } : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
}

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

export async function openMenuItem(name: string) {
  const trigger = await screen.findByRole('button', { name: 'weather.forecast menu' });
  fireEvent(trigger, new MouseEvent('pointerdown', { button: 0, bubbles: true }));
  fireEvent.click(await screen.findByRole('menuitem', { name }));
}
