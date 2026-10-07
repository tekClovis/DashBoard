import type { AdminUserEntry, AdminUserPatch, AdminUsersResponse, OkResponse } from '@dashboard/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** Page size sent as `pageSize` by {@link useAdminUsers}. */
export const ADMIN_PAGE_SIZE = 20;

/** GET /api/admin/users — only mount for an admin (AdminPage gates), so a non-admin never fires the request. */
export function useAdminUsers({ q, page }: { q: string; page: number }) {
  return useQuery({
    queryKey: ['admin', 'users', { q, page }],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(ADMIN_PAGE_SIZE) });
      if (q) qs.set('q', q);
      return apiFetch<AdminUsersResponse>(`/admin/users?${qs}`);
    },
    placeholderData: keepPreviousData,
  });
}

/** Refetches on settle (success or failure) so the table always reflects server state. */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
}

/** PATCH /api/admin/users/{id}. */
export function useUpdateAdminUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AdminUserPatch }) =>
      apiFetch<AdminUserEntry>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSettled: invalidate,
  });
}

/** DELETE /api/admin/users/{id}. */
export function useDeleteAdminUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (id: string) => apiFetch<OkResponse>(`/admin/users/${id}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}
