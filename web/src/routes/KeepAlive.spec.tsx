import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCKET_EVENTS } from '@dashboard/shared';
import { AppShell } from './AppShell.js';
import { catalog, instance } from './dashboard-test-utils.js';

const fakeSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
};
vi.mock('socket.io-client', () => ({ io: () => fakeSocket }));

let dashboards: { id: string; name: string; position: number }[];
let fetched: string[];
const me = { id: '1', email: 'u@example.com', role: 'USER', emailVerifiedAt: null, hasPassword: true, identities: [] };

beforeEach(() => {
  dashboards = [{ id: 'dash-1', name: 'Home', position: 0 }];
  fetched = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      fetched.push(`${init?.method ?? 'GET'} ${url}`);
      const body = url.endsWith('/auth/me')
        ? me
        : url.includes('/shares')
          ? { shares: [] }
          : url === '/api/catalog'
          ? catalog
          : url === '/api/dashboards'
            ? { dashboards }
            : url.endsWith('/widgets')
              ? { widgets: [instance] }
              : {};
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const widgetGets = () => fetched.filter((c) => c === 'GET /api/dashboards/dash-1/widgets');
const emitted = (event: string) => fakeSocket.emit.mock.calls.filter((c) => c[0] === event);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderApp(path = '/d/dash-1') {
  queryClient.clear();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/d/:dashboardId" element={null} />
            <Route path="/services" element={<div>services page</div>} />
          </Route>
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const nav = () => within(screen.getAllByRole('navigation', { name: 'Main' })[0]!);
const kept = () => screen.getByTestId('kept-dashboard');

async function openDashboard() {
  const view = renderApp();
  await screen.findByRole('button', { name: 'Weather Forecast options' });
  await waitFor(() => expect(emitted(SOCKET_EVENTS.subscribe)).toHaveLength(1));
  return view;
}

describe('dashboard keep-alive', () => {
  it('keeps the dashboard mounted, hidden and inert, on another shell page', async () => {
    await openDashboard();
    fireEvent.click(nav().getByRole('link', { name: 'Services' }));

    expect(await screen.findByText('services page')).toBeTruthy();
    expect(kept().hidden).toBe(true);
    expect(kept().hasAttribute('inert')).toBe(true);
    expect(within(kept()).getByRole('button', { hidden: true, name: 'Weather Forecast options' })).toBeTruthy();
  });

  it('returns without a refetch, a resubscribe or an unsubscribe', async () => {
    await openDashboard();
    expect(widgetGets()).toHaveLength(1);

    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');
    fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }));

    await waitFor(() => expect(kept().hidden).toBe(false));
    expect(kept().hasAttribute('inert')).toBe(false);
    expect(widgetGets()).toHaveLength(1);
    expect(emitted(SOCKET_EVENTS.subscribe)).toHaveLength(1);
    expect(emitted(SOCKET_EVENTS.unsubscribe)).toHaveLength(0);
    expect(screen.queryByText('services page')).toBeNull();
  });

  it('restores the scroll position on return', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    await openDashboard();
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    fireEvent.scroll(window);

    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    fireEvent.scroll(window);
    fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }));

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 420));
  });

  it('drops the kept dashboard when it is deleted elsewhere: no hidden instance, widgets unsubscribed', async () => {
    await openDashboard();
    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');

    dashboards = [];
    await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    await waitFor(() => expect(emitted(SOCKET_EVENTS.unsubscribe)).toHaveLength(1));
    expect(within(kept()).queryByRole('button', { hidden: true, name: 'Weather Forecast options' })).toBeNull();
  });

  it('tears the dashboard down on logout', async () => {
    await openDashboard();
    fireEvent.keyDown(await screen.findByRole('button', { name: /Account:/ }), { key: 'Enter' });
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Log out' }));

    await screen.findByText('login page');
    expect(screen.queryByTestId('kept-dashboard')).toBeNull();
    expect(emitted(SOCKET_EVENTS.unsubscribe)).toHaveLength(1);
  });
});
