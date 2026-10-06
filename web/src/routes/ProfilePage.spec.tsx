import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import type { MeResponse } from '@dashboard/shared';
import { ProfilePage } from './ProfilePage.js';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (orig) => ({ ...(await orig<typeof import('react-router')>()), useNavigate: () => navigateMock }));

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
  beforeEach(() => navigateMock.mockClear());

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

  describe('delete account', () => {
    const ME: MeResponse = {
      id: '1',
      email: 'user@example.com',
      role: 'USER',
      emailVerifiedAt: null,
      hasPassword: true,
      identities: [],
    };

    function mockDelete(impl: (opts: { onSuccess?: () => void; onError?: (e: Error) => void }) => void = () => {}) {
      const mutate = vi.fn((_v: undefined, opts) => impl(opts));
      vi.spyOn(authApi, 'useDeleteAccount').mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
        typeof authApi.useDeleteAccount
      >);
      return mutate;
    }

    function openDialog() {
      fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    }

    it('opens a dialog and cancelling does not delete', () => {
      mockMe(ME);
      const mutate = mockDelete();
      renderPage();
      expect(screen.queryByRole('dialog')).toBeNull();

      openDialog();
      expect(screen.getByRole('dialog')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(mutate).not.toHaveBeenCalled();
    });

    it('keeps confirm disabled until the typed text matches the email exactly', () => {
      mockMe(ME);
      mockDelete();
      renderPage();
      openDialog();

      const confirm = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' });
      const input = screen.getByLabelText(/to confirm/);
      expect(confirm().hasAttribute('disabled')).toBe(true);
      fireEvent.change(input, { target: { value: 'USER@example.com' } });
      expect(confirm().hasAttribute('disabled')).toBe(true);
      fireEvent.change(input, { target: { value: 'user@example.com' } });
      expect(confirm().hasAttribute('disabled')).toBe(false);
    });

    it('deletes on confirm and goes to the login page', () => {
      mockMe(ME);
      const mutate = mockDelete((opts) => opts.onSuccess?.());
      renderPage();
      openDialog();
      fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'user@example.com' } });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }));

      expect(mutate).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/login');
    });

    it('shows the only-admin error on LAST_ADMIN', () => {
      mockMe({ ...ME, role: 'ADMIN' });
      mockDelete((opts) => opts.onError?.(new ApiError(409, 'LAST_ADMIN')));
      renderPage();
      openDialog();
      fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'user@example.com' } });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }));

      expect(screen.getByRole('alert').textContent).toMatch(/only admin/);
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
