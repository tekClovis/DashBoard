import type {
  CreateWidgetInstanceRequest,
  LayoutUpdateEntry,
  UpdateWidgetInstanceRequest,
  WidgetInstanceEntry,
  WidgetsResponse,
} from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** Widget instances of a dashboard — GET /api/dashboards/{id}/widgets. */
export function useWidgets(dashboardId: string) {
  return useQuery({
    queryKey: ['widgets', dashboardId],
    queryFn: () => apiFetch<WidgetsResponse>(`/dashboards/${dashboardId}/widgets`),
  });
}

export function useCreateWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWidgetInstanceRequest) =>
      apiFetch<WidgetInstanceEntry>(`/dashboards/${dashboardId}/widgets`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['widgets', dashboardId] }),
  });
}

export function useUpdateWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateWidgetInstanceRequest & { id: string }) =>
      apiFetch<WidgetInstanceEntry>(`/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['widgets', dashboardId] }),
  });
}

export function useDeleteWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/widgets/${id}`, { method: 'DELETE' }),
    // Resync on failure too, so the grid matches the server; the page shows `isError`.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['widgets', dashboardId] }),
  });
}

/** PATCH /api/dashboards/{id}/layout — updates the cache optimistically so the grid doesn't snap back. */
export function useUpdateLayout(dashboardId: string) {
  const queryClient = useQueryClient();
  const key = ['widgets', dashboardId];
  return useMutation({
    mutationFn: (entries: LayoutUpdateEntry[]) =>
      apiFetch<void>(`/dashboards/${dashboardId}/layout`, { method: 'PATCH', body: JSON.stringify(entries) }),
    onMutate: async (entries) => {
      // Stop in-flight refetches (e.g. from a concurrent delete) landing after, and overwriting, the optimistic write.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<WidgetsResponse>(
        key,
        (prev) =>
          prev && {
            widgets: prev.widgets.map((w) => ({ ...w, ...entries.find((e) => e.id === w.id) })),
          },
      );
    },
    // Settled, not just error: resync with the server whatever happened (also reverts on failure).
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
