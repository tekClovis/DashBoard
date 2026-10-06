import type { DashboardEntry, IncomingSharesResponse } from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** GET /api/shares/incoming. No periodic refetch, like the dashboards list. */
export function useIncomingShares() {
  return useQuery({
    queryKey: ['shares', 'incoming'],
    queryFn: () => apiFetch<IncomingSharesResponse>('/shares/incoming'),
  });
}

/** POST /api/dashboards/{id}/share. */
export function useShareDashboard() {
  return useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      apiFetch<{ ok: true }>(`/dashboards/${id}/share`, { method: 'POST', body: JSON.stringify({ email }) }),
  });
}

/** POST /api/shares/{id}/accept: creates a personal copy. */
export function useAcceptShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<DashboardEntry>(`/shares/${id}/accept`, { method: 'POST' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboards'] }),
        queryClient.invalidateQueries({ queryKey: ['shares', 'incoming'] }),
      ]),
  });
}

/** DELETE /api/shares/{id}. */
export function useDeclineShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/shares/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shares', 'incoming'] }),
  });
}
