import type { CatalogResponse } from '@dashboard/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** GET /api/catalog — full ParamSpecs + per-service connection status. Static catalog data: no periodic refetch. */
export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiFetch<CatalogResponse>('/catalog'),
  });
}
