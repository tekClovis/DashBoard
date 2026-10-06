import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { makeFakeRedis } from '../../timer/test-helpers.js';
import { conditionFor, Geocoder, geoCacheKey, getForecast, searchCities, type CurrentResponse, type GeoLocation } from './open-meteo.js';

const PARIS: GeoLocation = { name: 'Paris, France', latitude: 48.85341, longitude: 2.3488 };

/** Stubs global fetch with one canned response. */
function stubFetch(respond: () => Response) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => respond());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geoCacheKey', () => {
  it.each(['Paris', '  paris ', 'PARIS'])('normalizes %o to geo:paris', (city) => {
    expect(geoCacheKey(city)).toBe('geo:paris');
  });

  it('collapses inner whitespace runs to one space', () => {
    expect(geoCacheKey('New \t  York')).toBe('geo:new york');
  });
});

describe('conditionFor', () => {
  it.each([
    [0, 'Clear sky'],
    [48, 'Depositing rime fog'],
    [99, 'Thunderstorm with heavy hail'],
  ])('describes WMO code %i as %s', (code, label) => {
    expect(conditionFor(code)).toBe(label);
  });

  it.each([4, -1, 100])('falls back to Unknown for the unassigned code %i', (code) => {
    expect(conditionFor(code)).toBe('Unknown');
  });
});

describe('getForecast', () => {
  it('GETs the forecast for the coordinates in the local timezone, without credentials', async () => {
    const fetchMock = stubFetch(() => Response.json({}));

    await getForecast(PARIS, { current: 'temperature_2m,weather_code', forecast_days: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(input);
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '48.85341',
      longitude: '2.3488',
      timezone: 'auto',
      current: 'temperature_2m,weather_code',
      forecast_days: '3',
    });
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('lets the caller override the default timezone', async () => {
    const fetchMock = stubFetch(() => Response.json({}));

    await getForecast(PARIS, { timezone: 'Europe/Paris' });

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.getAll('timezone')).toEqual(['Europe/Paris']);
  });

  it('returns the parsed body as is, extra fields included', async () => {
    const body = {
      latitude: 48.86,
      longitude: 2.34,
      timezone: 'Europe/Paris',
      current_units: { temperature_2m: '°C' },
      current: { time: '2026-01-01T12:00', interval: 900, temperature_2m: -3.4, weather_code: 71 },
    };
    stubFetch(() => Response.json(body));

    await expect(getForecast<CurrentResponse>(PARIS, { current: 'temperature_2m,weather_code' })).resolves.toEqual(body);
  });

  it.each([
    [429, 'RATE_LIMITED', 'Open-Meteo rate limit reached.'],
    [401, 'UPSTREAM_ERROR', 'Open-Meteo responded 401.'],
    [403, 'UPSTREAM_ERROR', 'Open-Meteo responded 403.'],
    [404, 'UPSTREAM_ERROR', 'Open-Meteo responded 404.'],
    [500, 'UPSTREAM_ERROR', 'Open-Meteo responded 500.'],
  ])('maps HTTP %i to %s', async (status, code, message) => {
    stubFetch(() => Response.json({ error: true, reason: 'nope' }, { status }));

    await expect(getForecast(PARIS, {})).rejects.toMatchObject({ name: 'FetchError', code, message });
  });

  it('maps a network failure to UPSTREAM_ERROR carrying the cause', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });

    await expect(getForecast(PARIS, {})).rejects.toMatchObject({
      name: 'FetchError',
      code: 'UPSTREAM_ERROR',
      message: 'Open-Meteo unreachable: fetch failed',
    });
  });

  // Not wrapped in a FetchError: the Timer reports any other thrown error as UPSTREAM_ERROR.
  it('rejects with a SyntaxError when a 2xx body is not JSON', async () => {
    stubFetch(() => new Response('<html>proxy</html>', { status: 200 }));

    await expect(getForecast(PARIS, {})).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe('Geocoder', () => {
  let redis: Redis;
  let geocoder: Geocoder;

  beforeEach(() => {
    redis = makeFakeRedis();
    geocoder = new Geocoder(redis);
  });

  it('asks the geocoding API for the single best English match of the normalized name', async () => {
    const fetchMock = stubFetch(() => Response.json({ results: [{ name: 'New York', country: 'United States', latitude: 40.71, longitude: -74.01 }] }));

    await geocoder.resolve('  New   YORK ');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'new york', count: '1', language: 'en', format: 'json' });
  });

  it('takes the first of several results', async () => {
    stubFetch(() =>
      Response.json({
        results: [
          { id: 2988507, name: 'Paris', country: 'France', country_code: 'FR', latitude: 48.85341, longitude: 2.3488, population: 2138551 },
          { id: 4717560, name: 'Paris', country: 'United States', country_code: 'US', latitude: 33.66094, longitude: -95.55551 },
        ],
      }),
    );

    await expect(geocoder.resolve('Paris')).resolves.toEqual(PARIS);
    expect(redis.set).toHaveBeenCalledExactlyOnceWith('geo:paris', JSON.stringify(PARIS), 'EX', 86_400);
  });

  it('names a result without a country by its name alone', async () => {
    stubFetch(() => Response.json({ results: [{ name: 'Antarctica', latitude: -75, longitude: 0 }] }));

    await expect(geocoder.resolve('Antarctica')).resolves.toEqual({ name: 'Antarctica', latitude: -75, longitude: 0 });
  });

  it.each([
    ['no results field', { generationtime_ms: 0.4 }],
    ['an empty results list', { results: [] }],
  ])('throws INVALID_PARAMS for a response with %s, without caching it', async (_, body) => {
    const fetchMock = stubFetch(() => Response.json(body));

    await expect(geocoder.resolve(' Atlantis ')).rejects.toMatchObject({
      name: 'FetchError',
      code: 'INVALID_PARAMS',
      message: "Could not resolve city 'atlantis'.",
    });
    expect(redis.set).not.toHaveBeenCalled();

    // Neither cached nor left in flight: the next lookup asks upstream again.
    await expect(geocoder.resolve('Atlantis')).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a cached location without calling the geocoding API', async () => {
    const fetchMock = stubFetch(() => Response.json({ results: [] }));
    await redis.set('geo:paris', JSON.stringify(PARIS));

    await expect(geocoder.resolve(' PARIS ')).resolves.toEqual(PARIS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one upstream lookup between concurrent calls, and a failure between both callers', async () => {
    const fetchMock = stubFetch(() => Response.json({}, { status: 429 }));

    const results = await Promise.allSettled([geocoder.resolve('Paris'), geocoder.resolve('paris ')]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(results[0]).toMatchObject({ reason: { name: 'FetchError', code: 'RATE_LIMITED' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('maps a geocoding network failure to UPSTREAM_ERROR', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });

    await expect(geocoder.resolve('Paris')).rejects.toMatchObject({ name: 'FetchError', code: 'UPSTREAM_ERROR' });
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe('searchCities', () => {
  const PARIS_HITS = {
    results: [
      { name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.85341, longitude: 2.3488 },
      { name: 'Paris', admin1: 'Texas', country: 'United States', latitude: 33.66094, longitude: -95.55551 },
      { name: 'Paris', country: 'Nowhere', latitude: 1, longitude: 2 },
    ],
  };

  it('asks Open-Meteo for several candidates and maps name, region, country and coordinates', async () => {
    const fetchMock = stubFetch(() => Response.json(PARIS_HITS));

    await expect(searchCities('  Paris ')).resolves.toEqual([
      { name: 'Paris', region: 'Île-de-France', country: 'France', latitude: 48.85341, longitude: 2.3488 },
      { name: 'Paris', region: 'Texas', country: 'United States', latitude: 33.66094, longitude: -95.55551 },
      { name: 'Paris', country: 'Nowhere', latitude: 1, longitude: 2 },
    ]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('name')).toBe('Paris');
    expect(Number(url.searchParams.get('count'))).toBeGreaterThan(1);
  });

  it('returns no candidates, without calling upstream, for an empty or one-character query', async () => {
    const fetchMock = stubFetch(() => Response.json(PARIS_HITS));

    await expect(searchCities('   ')).resolves.toEqual([]);
    await expect(searchCities('p')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty list when Open-Meteo has no results', async () => {
    stubFetch(() => Response.json({ generationtime_ms: 0.3 }));

    await expect(searchCities('zzzznotacity')).resolves.toEqual([]);
  });

  it('propagates upstream failures as FetchError', async () => {
    stubFetch(() => Response.json({}, { status: 503 }));

    await expect(searchCities('Paris')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});
