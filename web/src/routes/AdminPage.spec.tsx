import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import { AdminPage } from './AdminPage.js';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

function mockMe(role: 'USER' | 'ADMIN') {
  vi.spyOn(authApi, 'useMe').mockReturnValue({
    data: { id: '1', email: 'user@example.com', role, emailVerifiedAt: null, hasPassword: true, identities: [] },
    isPending: false,
  } as unknown as ReturnType<typeof authApi.useMe>);
}

describe('AdminPage', () => {
  it('shows a 403 for a non-admin who navigates here directly', () => {
    mockMe('USER');
    renderPage();

    expect(screen.getByText(/403/)).toBeTruthy();
    expect(screen.queryByText('User table placeholder (built by admin-ui).')).toBeNull();
  });

  it('renders the placeholder content for an admin', () => {
    mockMe('ADMIN');
    renderPage();

    expect(screen.getByText('User table placeholder (built by admin-ui).')).toBeTruthy();
  });
});
