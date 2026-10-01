import type { AdminUserEntry } from '@dashboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as authApi from '@/api/auth.js';
import * as client from '@/api/client.js';
import { AdminPage } from './AdminPage.js';

const ME_ID = 'me';
let users: AdminUserEntry[];
let fetchMock: MockInstance<typeof client.apiFetch>;

const user = (id: string, email: string, extra: Partial<AdminUserEntry> = {}): AdminUserEntry => ({
  id,
  email,
  role: 'USER',
  bannedAt: null,
  createdAt: '2026-02-10T00:00:00.000Z',
  ...extra,
});

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => user(`u${i}`, `user${String(i).padStart(3, '0')}@example.com`));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockMe(role: 'USER' | 'ADMIN') {
  vi.spyOn(authApi, 'useMe').mockReturnValue({
    data: { id: ME_ID, email: 'admin@example.com', role, emailVerifiedAt: null, hasPassword: true, identities: [] },
    isPending: false,
  } as unknown as ReturnType<typeof authApi.useMe>);
}

/** Stateful fake server behind apiFetch; GET pages like the real one (no `q` — search is client-side). */
function installServer() {
  fetchMock = vi.spyOn(client, 'apiFetch').mockImplementation((async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      const params = new URL(path, 'http://x').searchParams;
      const page = Number(params.get('page'));
      const pageSize = Number(params.get('pageSize'));
      return { users: users.slice((page - 1) * pageSize, page * pageSize), total: users.length, page, pageSize };
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

const gets = () => fetchMock.mock.calls.filter(([, init]) => !init?.method);

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

// The mobile cards render alongside the table (CSS picks one), so scope lookups to the table.
const table = () => screen.getByRole('table');
const rowOf = (email: string) => within(table()).getByText(email).closest('tr') as HTMLElement;

describe('AdminPage', () => {
  it('shows "Admins only" and never requests the user list for a non-admin', () => {
    mockMe('USER');
    renderPage();

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Admins only')).toBeTruthy();
    expect(within(alert).getByRole('link', { name: 'Back to dashboard' }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('table')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows skeleton rows while the users load', async () => {
    mockMe('ADMIN');
    renderPage();

    expect(table().getAttribute('aria-busy')).toBe('true');
    expect(table().querySelector('[data-slot="skeleton"]')).toBeTruthy();
    await within(table()).findByText('alice@example.com');
    expect(table().getAttribute('aria-busy')).toBe('false');
  });

  it('renders the count, role and status badges, and marks the admin’s own row', async () => {
    mockMe('ADMIN');
    renderPage();

    await within(table()).findByText('alice@example.com');
    expect(screen.getByText('3', { selector: '.font-mono' }).parentElement?.textContent).toBe(
      '3 user accounts. Changes apply immediately.',
    );
    const own = rowOf('admin@example.com');
    expect(within(own).getByText('You')).toBeTruthy();
    expect(within(own).getByText('ADMIN')).toBeTruthy();
    for (const name of ['Ban', 'Demote', 'Delete'] as const) {
      const btn = within(own).getByRole('button', { name });
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.getAttribute('aria-describedby')).toBe(screen.getByText(/can’t ban, demote or delete your own/).id);
    }
    expect(within(rowOf('alice@example.com')).getByText('Active')).toBeTruthy();
    expect(within(rowOf('bob@example.com')).getByText('Banned')).toBeTruthy();
    expect(within(rowOf('bob@example.com')).getByRole('button', { name: 'Unban' })).toBeTruthy();
  });

  it('ignores clicks on the admin’s own aria-disabled actions', async () => {
    mockMe('ADMIN');
    renderPage();
    await within(table()).findByText('alice@example.com');

    fireEvent.click(within(rowOf('admin@example.com')).getByRole('button', { name: 'Ban' }));
    fireEvent.click(within(rowOf('admin@example.com')).getByRole('button', { name: 'Delete' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
  });

  it('loads every page of users, beyond the server’s 100-per-request cap', async () => {
    mockMe('ADMIN');
    users = many(150);
    renderPage();

    await screen.findByText('1–8 of 150');
    expect(gets()).toHaveLength(2);
  });

  it('filters the loaded users by email client-side, without refetching', async () => {
    mockMe('ADMIN');
    renderPage();
    await within(table()).findByText('alice@example.com');

    fireEvent.change(screen.getByLabelText('Search users by email'), { target: { value: 'BOB' } });

    expect(within(table()).queryByText('alice@example.com')).toBeNull();
    expect(within(table()).getByText('bob@example.com')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('1 user found.');
    expect(gets()).toHaveLength(1);
  });

  it('says so when no user matches the search', async () => {
    mockMe('ADMIN');
    renderPage();
    await within(table()).findByText('alice@example.com');

    fireEvent.change(screen.getByLabelText('Search users by email'), { target: { value: 'zed' } });

    expect(screen.getByText('No users match “zed”.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('pages through users eight at a time', async () => {
    mockMe('ADMIN');
    users = many(20);
    renderPage();

    await screen.findByText('1–8 of 20');
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('17–20 of 20')).toBeTruthy();
    expect(within(table()).getByText('user019@example.com')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves focus to the other pager button when the first or last page is reached', async () => {
    mockMe('ADMIN');
    users = many(20);
    renderPage();
    await screen.findByText('1–8 of 20');
    const prev = () => screen.getByRole('button', { name: 'Previous page' });
    const next = () => screen.getByRole('button', { name: 'Next page' });

    next().focus();
    fireEvent.click(next());
    expect(document.activeElement).toBe(next());
    fireEvent.click(next());
    expect(document.activeElement).toBe(prev());

    fireEvent.click(prev());
    expect(document.activeElement).toBe(prev());
    fireEvent.click(prev());
    expect(document.activeElement).toBe(next());
  });

  it('moves focus to Previous on reaching the last of two pages', async () => {
    mockMe('ADMIN');
    users = many(10);
    renderPage();
    await screen.findByText('1–8 of 10');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous page' }));
  });

  it('searching resets to the first page', async () => {
    mockMe('ADMIN');
    users = many(20);
    renderPage();
    await screen.findByText('1–8 of 20');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    fireEvent.change(screen.getByLabelText('Search users by email'), { target: { value: 'user01' } });

    expect(screen.getByText('1–8 of 10')).toBeTruthy();
  });

  it('shows a load error with a Retry that refetches', async () => {
    mockMe('ADMIN');
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce((async () => {
      throw new client.ApiError(500, 'INTERNAL');
    }) as typeof client.apiFetch);
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Couldn’t load users')).toBeTruthy();
    fetchMock.mockImplementation(base);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(within(await screen.findByRole('table')).getByText('alice@example.com')).toBeTruthy();
  });

  it('Ban / Promote flip the row’s buttons from server state once the action completes', async () => {
    mockMe('ADMIN');
    renderPage();
    await within(table()).findByText('alice@example.com');

    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Ban' }));
    await waitFor(() => expect(within(rowOf('alice@example.com')).getByRole('button', { name: 'Unban' })).toBeTruthy());
    expect(within(rowOf('alice@example.com')).getByText('Banned')).toBeTruthy();

    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Promote' }));
    await waitFor(() => expect(within(rowOf('alice@example.com')).getByRole('button', { name: 'Demote' })).toBeTruthy());
  });

  it('Delete asks in an alertdialog; Cancel keeps the user and returns focus to the row action', async () => {
    mockMe('ADMIN');
    renderPage();
    await within(table()).findByText('alice@example.com');

    const trigger = within(rowOf('alice@example.com')).getByRole('button', { name: 'Delete' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete alice@example.com?' });
    expect(within(dialog).getByText(/removes the account, its dashboards, widgets and service connections/)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(document.activeElement).toBe(trigger)); // Radix restores focus on the next tick
    expect(document.activeElement).toBe(trigger);
    expect(within(table()).getByText('alice@example.com')).toBeTruthy();
  });

  it('Delete account removes the user and moves focus to the search', async () => {
    mockMe('ADMIN');
    renderPage();
    await within(table()).findByText('alice@example.com');

    fireEvent.click(within(rowOf('alice@example.com')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(within(table()).queryByText('alice@example.com')).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Search users by email'));
  });

  it('steps back a page when deleting the last row of the last page', async () => {
    mockMe('ADMIN');
    users = [user(ME_ID, 'admin@example.com', { role: 'ADMIN' }), ...many(8)];
    renderPage();
    await screen.findByText('1–8 of 9');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(within(rowOf('user007@example.com')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    await screen.findByText('1–8 of 8');
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('shows an error and refetches when a mutation fails', async () => {
    mockMe('ADMIN');
    renderPage();
    await within(table()).findByText('alice@example.com');
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
    await waitFor(() => expect(within(table()).queryByText('alice@example.com')).toBeNull());
  });
});
