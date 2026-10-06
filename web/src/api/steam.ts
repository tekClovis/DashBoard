import type { GameSearchResponse } from '@dashboard/shared';
import { apiFetch } from './client.js';

/** GET /api/steam/search — Steam store matches for a game name. */
export async function searchGames(query: string) {
  const { results } = await apiFetch<GameSearchResponse>(`/steam/search?q=${encodeURIComponent(query)}`);
  return results;
}
