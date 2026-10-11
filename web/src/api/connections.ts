import type { ConnectionsResponse, OkResponse } from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

/** GET /api/connections. */
export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => apiFetch<ConnectionsResponse>('/connections'),
  });
}

/** DELETE /api/connections/{service}; refreshes the connections list on success. */
export function useDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (service: string) => apiFetch<OkResponse>(`/connections/${service}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  });
}

/** Start URL of the real OAuth/OpenID handshake for a service — see docs/Architecture.md §8.3. */
export function connectUrl(service: string): string {
  return `/api/oauth/${service === 'youtube' ? 'google' : service}/start?intent=connect`;
}

/** Full-page redirect into the real OAuth/OpenID handshake. */
export function startConnect(service: string): void {
  window.location.href = connectUrl(service);
}
