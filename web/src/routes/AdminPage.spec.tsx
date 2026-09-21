import type { AdminUserEntry } from '@dashboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/api/auth.js';
import * as client from '@/api/client.js';
import { AdminPage } from './AdminPage.js';

const ME_ID = 'me';
let users: AdminUserEntry[];
let fetchMock: ReturnType<typeof vi.spyOn>;

const user = (id: string, email: string, extra: Partial<AdminUserEntry> = {}): AdminUserEntry => ({
  id,
  email,
  role: 'USER',
  bannedAt: null,
  createdAt: '2026-02-10T00:00:00.000Z',
  ...extra,
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

function mockMe(role: 'USER' | 'ADMIN') {
  vi.spyOn(authApi, 'useMe').mockReturnValue({
    data: { id: ME_ID, email: 'admin@example.com', role, emailVerifiedAt: null, hasPassword: true, identities: [] },
    isPending: false,
  } as unknown as ReturnType<typeof authApi.useMe>);
}

/** Stateful fake server behind apiFetch. */
function installServer() {
  fetchMock = vi.spyOn(client, 'apiFetch').mockImplementation((async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      const q = new URL(path, 'http://x').searchParams.get('q') ?? '';
      const page = Number(new URL(path, 'http://x').searchParams.get('page') ?? 1);
      const matched = users.filter((u) => u.email.includes(q));
      return { users: matched.slice((page - 1) * 20, page * 20), total: matched.length, page, pageSize: 20 };
    }
    const id = path.split('/').pop()!;
    if (method === 'PATCH') {
      const patch = JSON.parse(init!.body as string);
      users = users.map((u) => (u.id === id ? { ...u, ...patch } : u));
      return users.find((u) => u.id === id);
    }
    users = users.filter((u) => u.id !== id);
    return { ok: true };
  }) as typeof client.apiFetch);
}

beforeEach(() => {
  users = [
    user(ME_ID, 'admin@example.com', { role: 'ADMIN' }),
    user('a', 'alice@example.com'),
    user('b', 'bob@example.com', { bannedAt: '2026-03-01T00:00:00.000Z' }),
  ];
  installServer();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rowOf = (email: string) => screen.getByText(email).closest('tr') as HTMLElement;

describe('AdminPage', () => {
  it('shows a 403 and never requests the user list for a non-admin', () => {
    mockMe('USER');
    renderPage();

    expect(screen.getByText(/403/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the user table with role/ban state and disables actions on the admin’s own row', async () => {
    mockMe('ADMIN');
    renderPage();

    await screen.findByText('alice@example.com');
    for (const name of ['Ban', 'Demote', 'Delete'] as const) {
      expect((within(rowOf('admin@example.com')).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(within(rowOf('alice@example.com')).getByRole('button', { name: 'Ban' })).toBeTruthy();
    expect(within(rowOf('bob@example.com')).getByText('banned')).toBeTruthy();
    expect(within(rowOf('bob@example.com')).getByRole('button', { name: 'Unban' })).toBeTruthy();
  });

  it('filters rows by email search', async () => {
    mockMe('ADMIN');
    renderPage();
    await screen.findByText('alice@example.com');

    fireEvent.change(screen.getByLabelText('Search users by email'), { target: { value: 'bob' } });

    await waitFor(() => expect(screen.queryByText('alice@example.com')).toBeNull());
    expect(screen.getByText('bob@example.com')).toBeTruthy();
  });

  it('Ban / Promote flip the row’s buttons from server state once the action completes', async () => {
    mockMe('ADMIN');
    renderPage();
    await screen.findByText('alice@example.com');

    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Ban' }));
    await waitFor(() => expect(within(rowOf('alice@example.com')).getByRole('button', { name: 'Unban' })).toBeTruthy());
    expect(within(rowOf('alice@example.com')).getByText('banned')).toBeTruthy();

    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Promote' }));
    await waitFor(() => expect(within(rowOf('alice@example.com')).getByRole('button', { name: 'Demote' })).toBeTruthy());
  });

  it('Delete removes the row after confirmation, and not when cancelled', async () => {
    mockMe('ADMIN');
    renderPage();
    await screen.findByText('alice@example.com');

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('alice@example.com')).toBeTruthy();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('alice@example.com')).toBeNull());
  });

  it('steps back a page when deleting the last row of the last page', async () => {
    mockMe('ADMIN');
    users = [
      user(ME_ID, 'admin@example.com', { role: 'ADMIN' }),
      ...Array.from({ length: 20 }, (_, i) => user(`u${i}`, `user${String(i).padStart(2, '0')}@example.com`)),
    ];
    renderPage();
    await screen.findByText('Page 1 of 2');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 2');
    await screen.findByText('user19@example.com'); // page 2 loaded (placeholder still shows page 1 until then)
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(rowOf('user19@example.com')).getByRole('button', { name: 'Delete' }));

    await screen.findByText('Page 1 of 1');
    expect(screen.queryByText('No users found.')).toBeNull();
    expect(screen.getByText('admin@example.com')).toBeTruthy();
  });

  it('shows an error and refetches when a mutation fails', async () => {
    mockMe('ADMIN');
    renderPage();
    await screen.findByText('alice@example.com');
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((async (path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        // Server state changed under us: alice is gone.
        users = users.filter((u) => u.id !== 'a');
        throw new client.ApiError(404, 'USER_NOT_FOUND');
      }
      return base(path, init);
    }) as typeof client.apiFetch);

    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Ban' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer exists/);
    await waitFor(() => expect(screen.queryByText('alice@example.com')).toBeNull());
  });
});
