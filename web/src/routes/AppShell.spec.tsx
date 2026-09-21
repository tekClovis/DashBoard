import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import * as dashboardsApi from '@/api/dashboards.js';
import { AppShell } from './AppShell.js';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

function renderShell() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/d/dash-1']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/d/:id" element={<div>home</div>} />
          </Route>
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

describe('AppShell nav', () => {
  it('hides the Admin link for a USER', () => {
    mockMe('USER');
    renderShell();

    expect(screen.getByText('Services')).toBeTruthy();
    expect(screen.queryByText('Admin')).toBeNull();
  });

  it('shows the Admin link for an ADMIN', () => {
    mockMe('ADMIN');
    renderShell();

    expect(screen.getByText('Admin')).toBeTruthy();
  });
});
