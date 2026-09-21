import type { AdminUserEntry } from '@dashboard/shared';
import { useState } from 'react';
import { ADMIN_PAGE_SIZE, useAdminUsers, useDeleteAdminUser, useUpdateAdminUser } from '@/api/admin.js';
import { useMe } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';

const ERROR_MESSAGES: Record<string, string> = {
  CANNOT_MODIFY_SELF: "You can't ban, demote or delete your own account.",
  USER_NOT_FOUND: 'That user no longer exists.',
};

function describeError(err: unknown): string {
  if (err instanceof ApiError) return ERROR_MESSAGES[err.code] ?? `Request failed (${err.status}).`;
  return 'Request failed.';
}

/** Matches features/admin-ui/mock.html. Client gate is UX only — every /api/admin/* route enforces ADMIN server-side. */
export function AdminPage() {
  const { data: me } = useMe();

  if (!me) return null;
  if (me.role !== 'ADMIN') {
    return (
      <div className="bg-background min-h-svh p-6">
        <p className="text-destructive text-sm">403 — this page is for admins only.</p>
      </div>
    );
  }
  return <UserTable selfId={me.id} />;
}

function UserTable({ selfId }: { selfId: string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const users = useAdminUsers({ q, page });
  const update = useUpdateAdminUser();
  const remove = useDeleteAdminUser();
  const [error, setError] = useState<string | null>(null);

  const rows = users.data?.users ?? [];
  const total = users.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const busyId = update.isPending ? update.variables?.id : remove.isPending ? remove.variables : undefined;

  const callbacks = { onMutate: () => setError(null), onError: (e: unknown) => setError(describeError(e)) };

  function toggleBan(u: AdminUserEntry) {
    update.mutate({ id: u.id, patch: { bannedAt: u.bannedAt ? null : new Date().toISOString() } }, callbacks);
  }
  function toggleRole(u: AdminUserEntry) {
    update.mutate({ id: u.id, patch: { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' } }, callbacks);
  }
  function del(u: AdminUserEntry) {
    if (!window.confirm(`Delete ${u.email}? This removes all of their data.`)) return;
    remove.mutate(u.id, callbacks);
  }

  return (
    <div className="bg-background min-h-svh p-6">
      <main className="mx-auto max-w-3xl">
        <h1 className="text-lg font-semibold">Admin — users</h1>
        <Input
          className="my-3 w-64"
          type="search"
          aria-label="Search users by email"
          placeholder="Search by email..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        {error && (
          <p role="alert" className="text-destructive mb-3 text-sm">
            {error}
          </p>
        )}
        {users.isError && (
          <p role="alert" className="text-destructive mb-3 text-sm">
            Couldn't load users.
          </p>
        )}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="p-2 font-medium">Email</th>
              <th className="p-2 font-medium">Role</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Created</th>
              <th className="p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const disabled = u.id === selfId || busyId === u.id;
              return (
                <tr key={u.id} className="border-border border-b">
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${u.role === 'ADMIN' ? 'bg-blue-100 text-blue-700' : 'bg-secondary'}`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="p-2">
                    {u.bannedAt ? (
                      <span className="text-destructive rounded-full bg-red-100 px-2 py-0.5 text-xs">banned</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2">{u.createdAt.slice(0, 10)}</td>
                  <td className="flex gap-1 p-2">
                    <Button size="sm" variant="outline" disabled={disabled} onClick={() => toggleBan(u)}>
                      {u.bannedAt ? 'Unban' : 'Ban'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={disabled} onClick={() => toggleRole(u)}>
                      {u.role === 'ADMIN' ? 'Demote' : 'Promote'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={disabled}
                      onClick={() => del(u)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.isSuccess && rows.length === 0 && <p className="text-muted-foreground p-2 text-sm">No users found.</p>}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {lastPage}
          </span>
          <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </main>
    </div>
  );
}
