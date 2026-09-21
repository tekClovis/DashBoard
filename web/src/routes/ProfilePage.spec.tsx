import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import type { MeResponse } from '@dashboard/shared';
import { ProfilePage } from './ProfilePage.js';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockMe(me: MeResponse) {
  vi.spyOn(authApi, 'useMe').mockReturnValue({ data: me, isPending: false } as unknown as ReturnType<typeof authApi.useMe>);
}

describe('ProfilePage', () => {
  it('shows the current user email and role', () => {
    mockMe({
      id: '1',
      email: 'user@example.com',
      role: 'USER',
      emailVerifiedAt: null,
      hasPassword: true,
      identities: [],
    });
    renderPage();

    expect(screen.getByText('user@example.com (USER)')).toBeTruthy();
  });

  it('disables Unlink for the sole remaining login method', () => {
    mockMe({
      id: '1',
      email: 'user@example.com',
      role: 'USER',
      emailVerifiedAt: null,
      hasPassword: false,
      identities: [{ provider: 'GITHUB' }],
    });
    renderPage();

    // GitHub is linked and is the only login method (no password, one identity) — no clickable
    // Unlink button, just the disabled indicator.
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
  });

  it('allows unlinking a non-sole identity', () => {
    mockMe({
      id: '1',
      email: 'user@example.com',
      role: 'USER',
      emailVerifiedAt: null,
      hasPassword: true,
      identities: [{ provider: 'GITHUB' }],
    });
    renderPage();

    expect(screen.getByRole('button', { name: 'Unlink' })).toBeTruthy();
  });

  it('logs out on Log out click', () => {
    const logoutMutate = vi.fn();
    mockMe({
      id: '1',
      email: 'user@example.com',
      role: 'USER',
      emailVerifiedAt: null,
      hasPassword: true,
      identities: [],
    });
    vi.spyOn(authApi, 'useLogout').mockReturnValue({ mutate: logoutMutate, isPending: false } as unknown as ReturnType<
      typeof authApi.useLogout
    >);
    vi.spyOn(authApi, 'useLogoutAll').mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<
      typeof authApi.useLogoutAll
    >);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(logoutMutate).toHaveBeenCalled();
  });
});
