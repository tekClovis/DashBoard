import type {
  CreateWidgetInstanceRequest,
  LayoutUpdateEntry,
  UpdateWidgetInstanceRequest,
  WidgetInstanceEntry,
} from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

interface WidgetsResponse {
  widgets: WidgetInstanceEntry[];
}

/**
 * Widget instances of a dashboard. Assumes `GET /api/dashboards/{id}/widgets` → `{ widgets }`
 * (dashboards-api's spec lists create/patch/delete/layout but no instance list yet).
 */
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['widgets', dashboardId] }),
  });
}

/** PATCH /api/dashboards/{id}/layout — updates the cache optimistically so the grid doesn't snap back. */
export function useUpdateLayout(dashboardId: string) {
  const queryClient = useQueryClient();
  const key = ['widgets', dashboardId];
  return useMutation({
    mutationFn: (entries: LayoutUpdateEntry[]) =>
      apiFetch<void>(`/dashboards/${dashboardId}/layout`, { method: 'PATCH', body: JSON.stringify(entries) }),
    onMutate: (entries) => {
      queryClient.setQueryData<WidgetsResponse>(
        key,
        (prev) =>
          prev && {
            widgets: prev.widgets.map((w) => ({ ...w, ...entries.find((e) => e.id === w.id) })),
          },
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
