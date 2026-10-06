import type { SearchResponse } from '@dashboard/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client.js';

export const MIN_SEARCH_LENGTH = 2;

/** GET `${endpoint}?q=` (a ParamSpec's `search`). Idle until the query has at least MIN_SEARCH_LENGTH characters. */
export function useSearch(endpoint: string, query: string) {
  return useQuery({
    queryKey: ['search', endpoint, query],
    queryFn: () => apiFetch<SearchResponse>(`${endpoint}?q=${encodeURIComponent(query)}`),
    enabled: query.length >= MIN_SEARCH_LENGTH,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
