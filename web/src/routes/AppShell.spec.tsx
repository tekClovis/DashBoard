import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import * as dashboardsApi from '@/api/dashboards.js';
import { AppShell } from './AppShell.js';

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Handler>();
const managerHandlers = new Map<string, Handler>();
const fakeSocket = {
  on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  io: {
    on: vi.fn((event: string, handler: Handler) => managerHandlers.set(event, handler)),
    off: vi.fn(),
  },
};

vi.mock('socket.io-client', () => ({ io: () => fakeSocket }));
// The kept-alive dashboard is covered by KeepAlive.spec.tsx; here it would only add unmocked requests.
vi.mock('./DashboardPage.js', () => ({ DashboardPage: () => <div>kept dashboard</div> }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderShell() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/d/dash-1']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/d/:id" element={<div>home</div>} />
          </Route>
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockMe(role: 'USER' | 'ADMIN') {
  vi.spyOn(authApi, 'useMe').mockReturnValue({
    data: { id: '1', email: 'user@example.com', role, emailVerifiedAt: null, hasPassword: true, identities: [] },
    isPending: false,
  } as unknown as ReturnType<typeof authApi.useMe>);
  vi.spyOn(dashboardsApi, 'useDashboards').mockReturnValue({
    data: { dashboards: [{ id: 'dash-1', name: 'My Dashboard', position: 0 }] },
    isPending: false,
  } as unknown as ReturnType<typeof dashboardsApi.useDashboards>);
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }));

describe('AppShell nav', () => {
  it('hides the brand link below md so the dashboard switcher has room', () => {
    mockMe('USER');
    renderShell();

    const brand = screen.getAllByText('dashboard')[0].closest('a')!;
    expect(brand.className).toContain('max-md:hidden');
  });

  it('hides the Admin link for a USER', () => {
    mockMe('USER');
    renderShell();

    expect(mainNav().getByRole('link', { name: 'Services' })).toBeTruthy();
    expect(screen.queryByText('Admin')).toBeNull();
  });

  it('shows the Admin link for an ADMIN', () => {
    mockMe('ADMIN');
    renderShell();

    expect(mainNav().getByRole('link', { name: 'Admin' })).toBeTruthy();
  });

  it('marks the current page with aria-current', () => {
    mockMe('USER');
    renderShell();

    expect(mainNav().getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
    expect(mainNav().getByRole('link', { name: 'Services' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('AppShell connection state', () => {
  const chip = () => screen.getByTestId('connection');
  const lamp = () => chip().querySelector('[data-slot="lamp"]')?.getAttribute('data-state');

  it('renders lamp, label and banner for live → reconnecting → offline → live', () => {
    mockMe('USER');
    renderShell();

    act(() => handlers.get('connect')?.());
    expect(chip().textContent).toBe('Live');
    expect(lamp()).toBe('live');
    expect(screen.queryByText(/Live updates paused/)).toBeNull();

    act(() => handlers.get('disconnect')?.('transport close'));
    act(() => managerHandlers.get('reconnect_attempt')?.(1));
    expect(chip().textContent).toBe('Reconnecting#1');
    expect(lamp()).toBe('stale');
    expect(screen.getByText(/Live updates paused/)).toBeTruthy();
    expect(screen.getByText('Reconnecting, attempt 1')).toBeTruthy();

    act(() => managerHandlers.get('reconnect_attempt')?.(2));
    expect(chip().textContent).toBe('Reconnecting#2');
    expect(screen.getByText('Reconnecting, attempt 2')).toBeTruthy();

    act(() => managerHandlers.get('reconnect_failed')?.());
    expect(chip().textContent).toBe('Offline');
    expect(lamp()).toBe('error');
    expect(screen.getByRole('alert').textContent).toContain('Can’t reach the server');

    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(fakeSocket.connect).toHaveBeenCalled();

    act(() => handlers.get('connect')?.());
    expect(chip().textContent).toBe('Live');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Live updates paused/)).toBeNull();
  });
});

describe('AppShell account menu', () => {
  it('shows the email, Profile and Log out, and Log out calls the logout API', async () => {
    mockMe('USER');
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify(url.includes('/shares') ? { shares: [] } : { ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderShell();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Account: user@example.com' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('user@example.com')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Profile' }).getAttribute('href')).toBe('/profile');

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByText('login page')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
});

describe('AppShell mobile menu', () => {
  it('opens a sheet with nav, theme and Log out; Escape closes it and refocuses the menu button', async () => {
    mockMe('ADMIN');
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    trigger.focus();

    fireEvent.click(trigger);
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    for (const name of ['Dashboard', 'Services', 'Profile', 'Admin']) {
      expect(within(sheet).getByRole('link', { name })).toBeTruthy();
    }
    expect(within(sheet).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
    expect(within(sheet).getByRole('button', { name: /theme$/ })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Log out' })).toBeTruthy();

    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes the sheet when the viewport grows to md or wider', () => {
    const listeners = new Set<(e: { matches: boolean }) => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => ({
        matches: false,
        media,
        addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.add(l),
        removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.delete(l),
      })),
    );
    mockMe('USER');
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeTruthy();

    act(() => listeners.forEach((l) => l({ matches: true })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
