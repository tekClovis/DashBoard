import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCKET_EVENTS } from '@dashboard/shared';
import { useNavigate } from 'react-router';
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

let widgets: unknown[];
let role: 'USER' | 'ADMIN';
let back: () => void;
let go: (path: string) => void;
let dashboards: { id: string; name: string; position: number }[];
let fetched: string[];
const me = { id: '1', email: 'u@example.com', role: 'USER', emailVerifiedAt: null, hasPassword: true, identities: [] };

beforeEach(() => {
  widgets = [instance];
  role = 'USER';
  dashboards = [{ id: 'dash-1', name: 'Home', position: 0 }];
  fetched = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      fetched.push(`${init?.method ?? 'GET'} ${url}`);
      const body = url.endsWith('/auth/me')
        ? { ...me, role }
        : url.includes('/shares')
          ? { shares: [] }
          : url === '/api/catalog'
          ? catalog
          : url === '/api/dashboards'
            ? { dashboards }
            : url.endsWith('/widgets')
              ? { widgets }
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

function NavProbe() {
  const navigate = useNavigate();
  back = () => void navigate(-1);
  go = (path) => void navigate(path);
  return null;
}

function renderApp(path = '/d/dash-1') {
  queryClient.clear();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NavProbe />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/d/:dashboardId" element={null} />
            <Route path="/services" element={<div>services page</div>} />
            <Route path="/profile" element={<div>profile page</div>} />
            <Route path="/admin" element={<div>admin page</div>} />
          </Route>
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const nav = () => within(screen.getAllByRole('navigation', { name: 'Main' })[0]!);
const kept = () => screen.getByTestId('kept-dashboard');

const forecast = { location: 'Paris', days: [] };

function push(data: unknown) {
  const onData = fakeSocket.on.mock.calls.filter((c) => c[0] === SOCKET_EVENTS.data).at(-1)![1] as (e: unknown) => void;
  act(() => onData({ instanceId: instance.id, data, fetchedAt: new Date().toISOString() }));
}

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

  it('returns with the browser Back button: same DOM, no skeleton, no new request', async () => {
    await openDashboard();
    push(forecast);
    await waitFor(() => expect(kept().querySelector('[data-slot="skeleton"]')).toBeNull());
    const grid = kept().firstElementChild;
    const widgetEl = screen.getByRole('button', { name: 'Weather Forecast options' });
    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');

    act(() => back());

    await waitFor(() => expect(kept().hidden).toBe(false));
    expect(kept().firstElementChild).toBe(grid);
    expect(screen.getByRole('button', { name: 'Weather Forecast options' })).toBe(widgetEl);
    expect(kept().querySelector('[data-slot="skeleton"], [aria-busy="true"]')).toBeNull();
    expect(widgetGets()).toHaveLength(1);
    expect(emitted(SOCKET_EVENTS.subscribe)).toHaveLength(1);
  });

  it('survives Profile and Admin (as admin) the same way', async () => {
    role = 'ADMIN';
    await openDashboard();
    const widgetEl = screen.getByRole('button', { name: 'Weather Forecast options' });

    fireEvent.click(nav().getByRole('link', { name: 'Admin' }));
    await screen.findByText('admin page');
    expect(kept().hidden).toBe(true);
    fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }));
    await waitFor(() => expect(kept().hidden).toBe(false));

    act(() => go('/profile'));
    await screen.findByText('profile page');
    expect(kept().hidden).toBe(true);
    act(() => back());
    await waitFor(() => expect(kept().hidden).toBe(false));

    expect(screen.getByRole('button', { name: 'Weather Forecast options' })).toBe(widgetEl);
    expect(widgetGets()).toHaveLength(1);
    expect(emitted(SOCKET_EVENTS.subscribe)).toHaveLength(1);
  });

  it('keeps writing realtime pushes into the cache while hidden', async () => {
    await openDashboard();
    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');

    push(forecast);
    fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }));

    await waitFor(() => expect(kept().hidden).toBe(false));
    expect(queryClient.getQueryData<{ data: unknown }>(['widget', instance.id])?.data).toEqual(forecast);
    expect(emitted(SOCKET_EVENTS.unsubscribe)).toHaveLength(0);
  });

  it('shows widget edits made while hidden (added widget, removed widget)', async () => {
    await openDashboard();
    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');

    widgets = [instance, { ...instance, id: 'i2', y: 6 }];
    await queryClient.invalidateQueries({ queryKey: ['widgets', 'dash-1'] });
    fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Weather Forecast options' })).toHaveLength(2));
    expect(emitted(SOCKET_EVENTS.subscribe).map((c) => (c[1] as { instanceId: string }).instanceId)).toContain('i2');

    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');
    widgets = [{ ...instance, id: 'i2', y: 6 }];
    await queryClient.invalidateQueries({ queryKey: ['widgets', 'dash-1'] });
    await waitFor(() => expect(emitted(SOCKET_EVENTS.unsubscribe).map((c) => (c[1] as { instanceId: string }).instanceId)).toEqual(['i1']));
  });

  it('shows a rename or an accepted share made while hidden', async () => {
    await openDashboard();
    fireEvent.click(nav().getByRole('link', { name: 'Services' }));
    await screen.findByText('services page');

    dashboards = [
      { id: 'dash-1', name: 'Renamed', position: 0 },
      { id: 'dash-2', name: 'Shared', position: 1 },
    ];
    await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }));

    await waitFor(() => expect(kept().hidden).toBe(false));
    expect(await screen.findByText('Renamed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Renamed/ }));
    expect(await screen.findByText('Shared')).toBeTruthy();
  });
});
