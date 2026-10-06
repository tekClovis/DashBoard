import type { ChannelSearchResponse } from '@dashboard/shared';
import { apiFetch } from './client.js';

/** GET /api/youtube/channels/search — YouTube channels matching a name. */
export async function searchChannels(query: string) {
  const { results } = await apiFetch<ChannelSearchResponse>(`/youtube/channels/search?q=${encodeURIComponent(query)}`);
  return results;
}
