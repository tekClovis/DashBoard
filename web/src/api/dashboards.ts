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
