// Open-Meteo HTTP client — see docs/Architecture.md §3 (widget catalog) and §7 (geo cache).
// No API key needed.

import type { Redis } from 'ioredis';
import { FetchError } from '../../timer/fetch-error.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 10_000;
const GEO_TTL_SEC = 24 * 60 * 60;

export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
}

/** GETs JSON, mapping transport failures, timeouts and non-2xx responses to FetchError codes. */
async function getJson<T>(url: string, query: Record<string, string | number>): Promise<T> {
  const target = `${url}?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`;
  let res: Response;
  try {
    res = await fetch(target, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new FetchError('UPSTREAM_ERROR', `Open-Meteo unreachable: ${(err as Error).message}`);
  }
  if (res.status === 429) throw new FetchError('RATE_LIMITED', 'Open-Meteo rate limit reached.');
  if (!res.ok) throw new FetchError('UPSTREAM_ERROR', `Open-Meteo responded ${res.status}.`);
  return (await res.json()) as T;
}

/** "Paris" and " paris " share one cache entry. */
export function geoCacheKey(city: string): string {
  return `geo:${city.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * Resolves a city name to coordinates, cached in Redis for 24 h. Concurrent lookups for the
 * same key share one upstream call. Unresolvable cities throw INVALID_PARAMS and are not cached.
 */
export class Geocoder {
  private readonly inFlight = new Map<string, Promise<GeoLocation>>();

  constructor(private readonly redis: Redis) {}

  resolve(city: string): Promise<GeoLocation> {
    const key = geoCacheKey(city);
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = this.lookup(key, city).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async lookup(key: string, city: string): Promise<GeoLocation> {
    const cached = await this.redis.get(key);
    if (cached !== null) return JSON.parse(cached) as GeoLocation;

    const body = await getJson<{ results?: { name: string; country?: string; latitude: number; longitude: number }[] }>(
      GEOCODING_URL,
      { name: city.trim(), count: 1, language: 'en', format: 'json' },
    );
    const hit = body.results?.[0];
    if (!hit) throw new FetchError('INVALID_PARAMS', `Could not resolve city '${city}'.`);

    const location: GeoLocation = {
      name: hit.country ? `${hit.name}, ${hit.country}` : hit.name,
      latitude: hit.latitude,
      longitude: hit.longitude,
    };
    await this.redis.set(key, JSON.stringify(location), 'EX', GEO_TTL_SEC);
    return location;
  }
}

export interface CurrentResponse {
  current: { temperature_2m: number; weather_code: number };
}

export interface DailyResponse {
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
}

export function getForecast<T>(geo: GeoLocation, query: Record<string, string | number>): Promise<T> {
  return getJson<T>(FORECAST_URL, { latitude: geo.latitude, longitude: geo.longitude, timezone: 'auto', ...query });
}

/** WMO weather interpretation codes, as documented by Open-Meteo. */
const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export function conditionFor(code: number): string {
  return WMO_CONDITIONS[code] ?? 'Unknown';
}
