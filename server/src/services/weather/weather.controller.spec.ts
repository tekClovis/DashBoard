import { BadGatewayException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JwtGuard } from '../../auth/jwt.guard.js';
import { WeatherController } from './weather.controller.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WeatherController', () => {
  it('is protected by JwtGuard', () => {
    expect(new Reflector().get(GUARDS_METADATA, WeatherController)).toEqual([JwtGuard]);
  });

  it('wraps the candidates in { results }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          results: [
            { name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.85, longitude: 2.35 },
            { name: 'Paris', admin1: 'Texas', country: 'United States', latitude: 33.66, longitude: -95.56 },
          ],
        }),
      ),
    );

    const { results } = await new WeatherController().search('Paris');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ name: 'Paris', region: 'Île-de-France', country: 'France', latitude: 48.85, longitude: 2.35 });
  });

  it('answers a missing query with an empty list, not an error', async () => {
    await expect(new WeatherController().search(undefined)).resolves.toEqual({ results: [] });
  });

  it('maps an upstream failure to 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 500 })));

    await expect(new WeatherController().search('Paris')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
