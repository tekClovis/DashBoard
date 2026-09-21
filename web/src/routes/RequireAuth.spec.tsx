import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import { RequireAuth } from './RequireAuth.js';

function renderAt(path: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/d/:id" element={<div>dashboard page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequireAuth', () => {
  it('redirects to /login when GET /api/auth/me fails', async () => {
    vi.spyOn(authApi, 'useMe').mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof authApi.useMe>);

    renderAt('/d/abc');

    expect(await screen.findByText('login page')).toBeTruthy();
  });

  it('renders the protected route when authenticated', async () => {
    vi.spyOn(authApi, 'useMe').mockReturnValue({
      data: { id: '1', email: 'user@example.com', role: 'USER', emailVerifiedAt: null, hasPassword: true, identities: [] },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof authApi.useMe>);

    renderAt('/d/abc');

    expect(await screen.findByText('dashboard page')).toBeTruthy();
  });
});
