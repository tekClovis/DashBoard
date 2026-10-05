// e2e for features/weather-widgets/spec.md's verification checklist (items 3-8; items 1-2 are
// covered by about.e2e-spec.ts and catalog.e2e-spec.ts).
//
// Follows timer-realtime.e2e-spec.ts: real Postgres/Redis via testcontainers and a real
// Socket.IO server driven by socket.io-client. Upstream calls hit the real Open-Meteo API (no
// key needed); `fetch` is only spied on, never stubbed, to count geocoding requests.

import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitySearchResponse, CurrentWeatherData, ForecastData, WidgetDataPayload, WidgetErrorPayload } from '@dashboard/shared';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { REDIS } from '../src/core/redis/redis.provider.js';

const UPSTREAM_TIMEOUT_MS = 15_000;

describe('Weather widgets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let redis: Redis;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);

    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    redis = app.get(REDIS);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.serviceConnection.deleteMany();
    await prisma.user.deleteMany();
    await redis.flushdb();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    vi.restoreAllMocks();
  });

  async function createUserWithCookie(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const token = jwtService.sign({ sub: user.id, role: 'USER', tv: 0 });
    return { userId: user.id, cookie: `session=${token}` };
  }

  async function createInstance(userId: string, widget: string, params: Record<string, string | number>): Promise<string> {
    const dashboard = await prisma.dashboard.create({ data: { userId, name: 'D', position: 0 } });
    const instance = await prisma.widgetInstance.create({
      data: { dashboardId: dashboard.id, service: 'weather', widget, params, refreshRate: 900, x: 0, y: 0, w: 1, h: 1 },
    });
    return instance.id;
  }

  function connect(cookie: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { extraHeaders: { Cookie: cookie }, reconnection: false, forceNew: true });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  }

  /** Subscribes and resolves with the first `event` payload for this instance. */
  function subscribeAndWait<T extends { instanceId: string }>(
    socket: ClientSocket,
    instanceId: string,
    event: 'widget:data' | 'widget:error',
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), UPSTREAM_TIMEOUT_MS);
      const onEvent = (payload: T) => {
        if (payload.instanceId !== instanceId) return;
        clearTimeout(timer);
        socket.off(event, onEvent);
        resolve(payload);
      };
      socket.on(event, onEvent);
      socket.emit('widget:subscribe', { instanceId });
    });
  }

  it('3/5. current_weather pushes real data: Celsius for metric, Fahrenheit for imperial', async () => {
    const { userId, cookie } = await createUserWithCookie('w1@example.com');
    const metricId = await createInstance(userId, 'current_weather', { city: 'Paris', units: 'metric' });
    const imperialId = await createInstance(userId, 'current_weather', { city: 'Paris', units: 'imperial' });
    const socket = await connect(cookie);

    const [metric, imperial] = await Promise.all([
      subscribeAndWait<WidgetDataPayload>(socket, metricId, 'widget:data'),
      subscribeAndWait<WidgetDataPayload>(socket, imperialId, 'widget:data'),
    ]);
    const c = metric.data as CurrentWeatherData;
    const f = imperial.data as CurrentWeatherData;

    expect(c).toMatchObject({ location: 'Paris, France', unit: '°C', temperature: expect.any(Number) });
    expect(c.condition).not.toBe('');
    expect(f.unit).toBe('°F');
    expect(Math.abs(f.temperature - (c.temperature * 9) / 5 - 32)).toBeLessThan(2);
  }, 30_000);

  it('4. forecast with days: 5 returns 5 days', async () => {
    const { userId, cookie } = await createUserWithCookie('w2@example.com');
    const instanceId = await createInstance(userId, 'forecast', { city: 'Paris', days: 5 });
    const socket = await connect(cookie);

    const { data } = await subscribeAndWait<WidgetDataPayload>(socket, instanceId, 'widget:data');
    const forecast = data as ForecastData;

    expect(forecast.days).toHaveLength(5);
    expect(forecast.days[0]).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      min: expect.any(Number),
      max: expect.any(Number),
      condition: expect.any(String),
    });
  }, 30_000);

  it('6/8. instances of two users with the same city share one geo: key and one geocoding call; no :conn: suffix', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const alice = await createUserWithCookie('alice@example.com');
    const bob = await createUserWithCookie('bob@example.com');
    const aliceId = await createInstance(alice.userId, 'current_weather', { city: 'Paris', units: 'metric' });
    const bobId = await createInstance(bob.userId, 'forecast', { city: ' paris ', days: 3 });

    await subscribeAndWait(await connect(alice.cookie), aliceId, 'widget:data');
    await subscribeAndWait(await connect(bob.cookie), bobId, 'widget:data');

    const geocodingCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes('geocoding-api'));
    expect(geocodingCalls).toHaveLength(1);
    expect(await redis.keys('geo:*')).toEqual(['geo:paris']);
    const ttl = await redis.ttl('geo:paris');
    expect(ttl).toBeGreaterThan(86_000);
    expect(ttl).toBeLessThanOrEqual(86_400);

    const widgetKeys = await redis.keys('widget:weather.*');
    expect(widgetKeys).toHaveLength(2);
    for (const key of widgetKeys) expect(key).not.toContain(':conn:');
  }, 30_000);

  // features/big-weather-search/spec.md checklist.
  describe('city search', () => {
    const search = (cookie: string | undefined, q: string) =>
      fetch(`${baseUrl}/api/weather/search?q=${encodeURIComponent(q)}`, { headers: cookie ? { Cookie: cookie } : {} });

    it('1. returns several candidates for "Paris", each with name, country and coordinates', async () => {
      const { cookie } = await createUserWithCookie('s1@example.com');

      const res = await search(cookie, 'Paris');
      const { results } = (await res.json()) as CitySearchResponse;

      expect(res.status).toBe(200);
      expect(results.length).toBeGreaterThan(1);
      for (const c of results)
        expect(c).toMatchObject({ name: expect.any(String), country: expect.any(String), latitude: expect.any(Number), longitude: expect.any(Number) });
      expect(results.some((c) => c.country === 'France')).toBe(true);
      expect(results.some((c) => c.country === 'United States')).toBe(true);
    }, 30_000);

    it('5. an empty query or an unknown city answers 200 with no results', async () => {
      const { cookie } = await createUserWithCookie('s2@example.com');

      for (const q of ['', 'zzzznotacity']) {
        const res = await search(cookie, q);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ results: [] });
      }
    }, 30_000);

    it('requires a session', async () => {
      expect((await search(undefined, 'Paris')).status).toBe(401);
    });

    it('3/4. a widget saved with a picked candidate shows that place and never re-geocodes the name', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { userId, cookie } = await createUserWithCookie('s3@example.com');
      const instanceId = await createInstance(userId, 'current_weather', {
        city: 'Paris',
        region: 'Texas',
        country: 'United States',
        latitude: '33.66094',
        longitude: '-95.55551',
        units: 'metric',
      });

      const { data } = await subscribeAndWait<WidgetDataPayload>(await connect(cookie), instanceId, 'widget:data');

      expect((data as CurrentWeatherData).location).toBe('Paris, United States');
      expect(fetchSpy.mock.calls.filter(([input]) => String(input).includes('geocoding-api'))).toHaveLength(0);
      const forecastCall = fetchSpy.mock.calls.map(([input]) => String(input)).find((u) => u.includes('api.open-meteo.com'));
      expect(new URL(forecastCall ?? '').searchParams.get('latitude')).toBe('33.66094');
    }, 30_000);
  });

  it('7. an unresolvable city emits widget:error INVALID_PARAMS', async () => {
    const { userId, cookie } = await createUserWithCookie('w4@example.com');
    const instanceId = await createInstance(userId, 'current_weather', { city: 'zzzznotacity', units: 'metric' });
    const socket = await connect(cookie);

    const error = await subscribeAndWait<WidgetErrorPayload>(socket, instanceId, 'widget:error');

    expect(error).toMatchObject({ instanceId, code: 'INVALID_PARAMS' });
    expect(error.retryAt).toBeUndefined();
  }, 30_000);
});
