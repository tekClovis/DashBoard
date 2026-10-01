import type { AdminUserEntry, AdminUserPatch, AdminUsersResponse, OkResponse } from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** The server's largest accepted `pageSize`. */
const FETCH_PAGE_SIZE = 100;

/**
 * GET /api/admin/users, every page: the admin table searches and pages client-side.
 * Only mount for an admin (AdminPage gates), so a non-admin never fires the request.
 */
export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const users: AdminUserEntry[] = [];
      for (let page = 1; ; page++) {
        const qs = new URLSearchParams({ page: String(page), pageSize: String(FETCH_PAGE_SIZE) });
        const res = await apiFetch<AdminUsersResponse>(`/admin/users?${qs}`);
        users.push(...res.users);
        if (res.users.length < FETCH_PAGE_SIZE || users.length >= res.total) return users;
      }
    },
  });
}

/** Refetches on settle (success or failure) so the table always reflects server state. */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
}

export function useUpdateAdminUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AdminUserPatch }) =>
      apiFetch<AdminUserEntry>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSettled: invalidate,
  });
}

export function useDeleteAdminUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (id: string) => apiFetch<OkResponse>(`/admin/users/${id}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}
