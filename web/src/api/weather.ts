import type { CitySearchResponse } from '@dashboard/shared';
import { apiFetch } from './client.js';

/** GET /api/weather/search — Open-Meteo geocoding candidates for a city name. */
export async function searchCities(query: string) {
  const { results } = await apiFetch<CitySearchResponse>(`/weather/search?q=${encodeURIComponent(query)}`);
  return results;
}
