import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import type { MeResponse } from '@dashboard/shared';
import { ProfilePage } from './ProfilePage.js';

afterEach(() => vi.restoreAllMocks());

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

function mockMe(overrides: Partial<MeResponse> = {}) {
  const me: MeResponse = {
    id: '1',
    email: 'user@example.com',
    role: 'USER',
    emailVerifiedAt: null,
    hasPassword: true,
    identities: [],
    ...overrides,
  };
  vi.spyOn(authApi, 'useMe').mockReturnValue({ data: me, isPending: false } as unknown as ReturnType<typeof authApi.useMe>);
}

const card = (name: string) => screen.getByRole('region', { name });

describe('ProfilePage', () => {
  it('shows the account email, role and confirmation date', () => {
    mockMe({ emailVerifiedAt: '2026-09-02T10:11:12.000Z' });
    renderPage();

    const account = card('Account');
    expect(within(account).getByText('user@example.com')).toBeTruthy();
    expect(within(account).getByText('USER')).toBeTruthy();
    expect(within(account).getByText('2026-09-02')).toBeTruthy();
  });

  it('marks an unconfirmed email as not confirmed', () => {
    mockMe();
    renderPage();

    expect(within(card('Account')).getByText('Not confirmed')).toBeTruthy();
  });

  it('shows the password and identity states in the sign-in methods card', () => {
    mockMe({ identities: [{ provider: 'GITHUB' }] });
    renderPage();

    const methods = card('Sign-in methods');
    expect(within(methods).getByText('Set')).toBeTruthy();
    expect(within(methods).getByText('Linked')).toBeTruthy();
    expect(within(methods).getByText('Not linked')).toBeTruthy();
    expect(within(methods).getByRole('button', { name: 'Link Google' })).toBeTruthy();
  });

  it('shows "Only sign-in method" instead of Unlink for the sole remaining login method', () => {
    mockMe({ hasPassword: false, identities: [{ provider: 'GITHUB' }] });
    renderPage();

    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByText('Only sign-in method')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
  });

  it('unlinks a non-sole identity', () => {
    const mutate = vi.fn();
    mockMe({ identities: [{ provider: 'GITHUB' }] });
    vi.spyOn(authApi, 'useUnlinkIdentity').mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
      typeof authApi.useUnlinkIdentity
    >);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));

    expect(mutate).toHaveBeenCalledWith('github', expect.anything());
  });

  it('logs out, or out of all devices, from the sessions card', () => {
    const logoutMutate = vi.fn();
    const logoutAllMutate = vi.fn();
    mockMe();
    vi.spyOn(authApi, 'useLogout').mockReturnValue({ mutate: logoutMutate, isPending: false } as unknown as ReturnType<
      typeof authApi.useLogout
    >);
    vi.spyOn(authApi, 'useLogoutAll').mockReturnValue({
      mutate: logoutAllMutate,
      isPending: false,
    } as unknown as ReturnType<typeof authApi.useLogoutAll>);

    renderPage();
    const sessions = card('Sessions');
    fireEvent.click(within(sessions).getByRole('button', { name: 'Log out' }));
    fireEvent.click(within(sessions).getByRole('button', { name: 'Log out of all devices' }));

    expect(logoutMutate).toHaveBeenCalled();
    expect(logoutAllMutate).toHaveBeenCalled();
  });
});
