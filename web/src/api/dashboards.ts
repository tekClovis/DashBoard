import type { DashboardEntry, DashboardsResponse } from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** GET /api/dashboards. No periodic refetch here — the Timer owns widget-data refresh, not this list. */
export function useDashboards(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboards'],
    queryFn: () => apiFetch<DashboardsResponse>('/dashboards'),
    enabled: options?.enabled,
  });
}

/** POST /api/dashboards. */
export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<DashboardEntry>('/dashboards', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

/** PATCH /api/dashboards/{id} with a new name. */
export function useRenameDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<DashboardEntry>(`/dashboards/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

/** DELETE /api/dashboards/{id}. */
export function useDeleteDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/dashboards/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ['widgets', id] });
      return queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
}
