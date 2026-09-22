import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { FetchError } from '../../timer/fetch-error.js';
import { makeFakeRedis } from '../../timer/test-helpers.js';
import { Geocoder, geoCacheKey } from './open-meteo.js';
import { weatherWidgets } from './weather.widgets.js';

const PARIS = { results: [{ name: 'Paris', country: 'France', latitude: 48.85, longitude: 2.35 }] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Routes geocoding vs forecast URLs to canned Open-Meteo responses. */
function stubOpenMeteo(forecastBody: unknown, geoBody: unknown = PARIS) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    return url.hostname.startsWith('geocoding') ? json(geoBody) : json(forecastBody);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof stubOpenMeteo>, host: string): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.hostname.startsWith(host));
}

describe('weather widgets', () => {
  let redis: Redis;
  let current: ReturnType<typeof weatherWidgets>[0];
  let forecast: ReturnType<typeof weatherWidgets>[1];

  beforeEach(() => {
    redis = makeFakeRedis();
    [current, forecast] = weatherWidgets(new Geocoder(redis));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('current_weather returns Celsius for metric and Fahrenheit for imperial', async () => {
    const fetchMock = stubOpenMeteo({ current: { temperature_2m: 18.2, weather_code: 2 } });

    await expect(current.fetch({ city: 'Paris', units: 'metric' }, { userId: 'u' })).resolves.toEqual({
      location: 'Paris, France',
      temperature: 18.2,
      unit: '°C',
      condition: 'Partly cloudy',
    });
    expect((await current.fetch({ city: 'Paris', units: 'imperial' }, { userId: 'u' })).unit).toBe('°F');

    const [metricCall, imperialCall] = calls(fetchMock, 'api');
    expect(metricCall.searchParams.get('temperature_unit')).toBe('celsius');
    expect(imperialCall.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(metricCall.searchParams.get('latitude')).toBe('48.85');
  });

  it('forecast requests `days` days and maps each one', async () => {
    const fetchMock = stubOpenMeteo({
      daily: {
        time: ['2026-09-22', '2026-09-23'],
        weather_code: [0, 61],
        temperature_2m_max: [20, 17],
        temperature_2m_min: [10, 9],
      },
    });

    const data = await forecast.fetch({ city: 'Paris', days: 2 }, { userId: 'u' });

    expect(calls(fetchMock, 'api')[0].searchParams.get('forecast_days')).toBe('2');
    expect(data).toEqual({
      location: 'Paris, France',
      days: [
        { date: '2026-09-22', min: 10, max: 20, condition: 'Clear sky' },
        { date: '2026-09-23', min: 9, max: 17, condition: 'Slight rain' },
      ],
    });
  });

  it('caches geocoding under a normalized geo: key for 24h and reuses it across widgets', async () => {
    const fetchMock = stubOpenMeteo({
      current: { temperature_2m: 1, weather_code: 0 },
      daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
    });

    await current.fetch({ city: 'Paris', units: 'metric' }, { userId: 'a' });
    await forecast.fetch({ city: '  paris ', days: 3 }, { userId: 'b' });

    expect(geoCacheKey('  PARIS  ')).toBe('geo:paris');
    expect(redis.set).toHaveBeenCalledWith('geo:paris', expect.any(String), 'EX', 86400);
    expect(calls(fetchMock, 'geocoding')).toHaveLength(1);
  });

  it('dedupes concurrent geocoding lookups for the same city', async () => {
    const fetchMock = stubOpenMeteo({ current: { temperature_2m: 1, weather_code: 0 } });

    await Promise.all([
      current.fetch({ city: 'Paris', units: 'metric' }, { userId: 'a' }),
      current.fetch({ city: 'paris', units: 'imperial' }, { userId: 'b' }),
    ]);

    expect(calls(fetchMock, 'geocoding')).toHaveLength(1);
  });

  it('throws INVALID_PARAMS for an unresolvable city, without caching it', async () => {
    stubOpenMeteo({}, { generationtime_ms: 0.4 });

    const err = await current.fetch({ city: 'zzzznotacity', units: 'metric' }, { userId: 'u' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).code).toBe('INVALID_PARAMS');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('throws UPSTREAM_ERROR on a 5xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: true }, 503)));

    await expect(current.fetch({ city: 'Paris', units: 'metric' }, { userId: 'u' })).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });
  });

  it('throws UPSTREAM_ERROR on a timeout / network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }),
    );

    await expect(forecast.fetch({ city: 'Paris', days: 3 }, { userId: 'u' })).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });
  });
});
