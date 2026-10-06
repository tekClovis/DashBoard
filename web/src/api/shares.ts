import type { DashboardEntry, IncomingSharesResponse, SentSharesResponse } from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** GET /api/shares/incoming. No periodic refetch, like the dashboards list. */
export function useIncomingShares() {
  return useQuery({
    queryKey: ['shares', 'incoming'],
    queryFn: () => apiFetch<IncomingSharesResponse>('/shares/incoming'),
  });
}

/** GET /api/dashboards/{id}/shares: who it was sent to and their answer. */
export function useSentShares(dashboardId: string) {
  return useQuery({
    queryKey: ['shares', 'sent', dashboardId],
    queryFn: () => apiFetch<SentSharesResponse>(`/dashboards/${dashboardId}/shares`),
  });
}

/** POST /api/dashboards/{id}/share. */
export function useShareDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: (_, { id }) => queryClient.invalidateQueries({ queryKey: ['shares', 'sent', id] }),
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
