import type { DashboardsResponse } from '@dashboard/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** GET /api/dashboards. No periodic refetch here — the Timer owns widget-data refresh, not this list. */
export function useDashboards(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboards'],
    queryFn: () => apiFetch<DashboardsResponse>('/dashboards'),
    enabled: options?.enabled,
  });
}
