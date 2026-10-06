import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import * as dashboardsApi from '@/api/dashboards.js';
import { RootRedirect } from './RootRedirect.js';

function renderRoot() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/d/:id" element={<div>dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RootRedirect', () => {
  it('sends an unauthenticated visitor to /login', async () => {
    vi.spyOn(authApi, 'useMe').mockReturnValue({ data: undefined, isPending: false } as unknown as ReturnType<
      typeof authApi.useMe
    >);
    vi.spyOn(dashboardsApi, 'useDashboards').mockReturnValue({ data: undefined, isPending: false } as unknown as ReturnType<
      typeof dashboardsApi.useDashboards
    >);

    renderRoot();

    expect(await screen.findByText('login page')).toBeTruthy();
  });

  it('sends an authenticated visitor to their first dashboard', async () => {
    vi.spyOn(authApi, 'useMe').mockReturnValue({
      data: { id: '1', email: 'user@example.com', role: 'USER', emailVerifiedAt: null, hasPassword: true, identities: [] },
      isPending: false,
    } as unknown as ReturnType<typeof authApi.useMe>);
    vi.spyOn(dashboardsApi, 'useDashboards').mockReturnValue({
      data: { dashboards: [{ id: 'dash-1', name: 'My Dashboard', position: 0 }] },
      isPending: false,
    } as unknown as ReturnType<typeof dashboardsApi.useDashboards>);

    renderRoot();

    expect(await screen.findByText('dashboard page')).toBeTruthy();
  });

  it('creates a default dashboard for a user with none and lands on it', async () => {
    vi.spyOn(authApi, 'useMe').mockReturnValue({
      data: { id: '1', email: 'user@example.com', role: 'USER', emailVerifiedAt: null, hasPassword: true, identities: [] },
      isPending: false,
    } as unknown as ReturnType<typeof authApi.useMe>);
    vi.spyOn(dashboardsApi, 'useDashboards').mockReturnValue({
      data: { dashboards: [] },
      isPending: false,
    } as unknown as ReturnType<typeof dashboardsApi.useDashboards>);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'new-1', name: 'My Dashboard', position: 0 }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderRoot();

    expect(await screen.findByText('dashboard page')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/dashboards');
    vi.unstubAllGlobals();
  });
});
