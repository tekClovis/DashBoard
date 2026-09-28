// e2e for features/steam-widgets/spec.md's verification checklist.
//
// Follows the timer-realtime.e2e-spec.ts conventions: real Postgres/Redis via testcontainers,
// a real Socket.IO server driven by socket.io-client, and Dashboard/WidgetInstance rows created
// directly via Prisma. Only the outbound Steam Web API HTTP is stubbed (global fetch, for
// api.steampowered.com only) — no real key exists in tests, and CI must not depend on Steam.

import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetDataPayload, WidgetErrorPayload } from '@dashboard/shared';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { ConnectionsService } from '../src/connections/connections.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { REDIS } from '../src/core/redis/redis.provider.js';

const STEAM_ID = '76561198000000001';
const realFetch = globalThis.fetch;

/** Stubs api.steampowered.com only; every other request goes through the real fetch. */
function stubSteamApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'api.steampowered.com') return realFetch(input, init);

    if (url.pathname === '/IPlayerService/GetRecentlyPlayedGames/v1/' && url.searchParams.get('steamid') === STEAM_ID) {
      return Response.json({
        response: {
          total_count: 3,
          games: [
            { appid: 220, name: 'Half-Life 2', playtime_2weeks: 192, playtime_forever: 900 },
            { appid: 620, name: 'Portal 2', playtime_2weeks: 90, playtime_forever: 300 },
            { appid: 413150, name: 'Stardew Valley', playtime_2weeks: 408, playtime_forever: 5000 },
          ],
        },
      });
    }
    if (url.pathname === '/ISteamNews/GetNewsForApp/v2/' && url.searchParams.get('appid') === '620') {
      return Response.json({
        appnews: {
          appid: 620,
          newsitems: [
            { gid: 'n1', title: 'Community update: new Workshop maps', url: 'https://x/n1', feedlabel: 'Community', date: 1_700_000_000 },
            { gid: 'n2', title: 'Patch notes 1.12', url: 'https://x/n2', feedlabel: 'Community', date: 1_699_000_000 },
            { gid: 'n3', title: 'Older news', url: 'https://x/n3', feedlabel: 'PC Gamer', date: 1_698_000_000 },
          ],
          count: 3,
        },
      });
    }
    // What Steam answers for an app id it doesn't know.
    return Response.json({}, { status: 403 });
  });
}

async function startApp(): Promise<{ app: INestApplication; baseUrl: string }> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api', { exclude: ['about.json'] });
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

describe('Steam widgets (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    ({ app, baseUrl } = await startApp());
    prisma = app.get(PrismaService);
    stubSteamApi();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  beforeEach(async () => {
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.serviceConnection.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUser(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const token = app.get(JwtService).sign({ sub: user.id, role: 'USER', tv: 0 });
    return { userId: user.id, cookie: `session=${token}` };
  }

  /** The same upsert the Steam OpenID callback performs (see connections.e2e-spec.ts for the handshake itself). */
  async function connectSteam(userId: string): Promise<string> {
    await app.get(ConnectionsService).upsertSteamConnection(userId, STEAM_ID);
    const row = await prisma.serviceConnection.findUniqueOrThrow({ where: { userId_service: { userId, service: 'steam' } } });
    return row.id;
  }

  async function createInstance(userId: string, widget: string, params: Record<string, number>): Promise<string> {
    const dashboard = await prisma.dashboard.create({ data: { userId, name: 'D', position: 0 } });
    const instance = await prisma.widgetInstance.create({
      data: { dashboardId: dashboard.id, service: 'steam', widget, params, refreshRate: 900, x: 0, y: 0, w: 1, h: 1 },
    });
    return instance.id;
  }

  /** Subscribes over a fresh socket to `url` and resolves with the first widget:data or widget:error. */
  function firstEvent(
    cookie: string,
    instanceId: string,
    url = baseUrl,
  ): Promise<{ event: 'widget:data'; payload: WidgetDataPayload } | { event: 'widget:error'; payload: WidgetErrorPayload }> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(url, { extraHeaders: { Cookie: cookie }, reconnection: false, forceNew: true });
      sockets.push(socket);
      const timer = setTimeout(() => reject(new Error('timed out waiting for a widget event')), 4000);
      const settle = (value: Parameters<typeof resolve>[0]) => {
        clearTimeout(timer);
        resolve(value);
      };
      socket.once('widget:data', (payload: WidgetDataPayload) => settle({ event: 'widget:data', payload }));
      socket.once('widget:error', (payload: WidgetErrorPayload) => settle({ event: 'widget:error', payload }));
      socket.once('connect_error', reject);
      socket.on('connect', () => socket.emit('widget:subscribe', { instanceId }));
    });
  }

  it('1. /about.json lists steam with recently_played and game_news', async () => {
    const res = await request(app.getHttpServer()).get('/about.json').expect(200);

    expect(res.body.server.services).toContainEqual({
      name: 'steam',
      widgets: [
        { name: 'recently_played', description: expect.any(String), params: [{ name: 'number', type: 'integer' }] },
        {
          name: 'game_news',
          description: expect.any(String),
          params: [
            { name: 'app_id', type: 'integer' },
            { name: 'number', type: 'integer' },
          ],
        },
      ],
    });
  });

  it('2. /api/catalog shows steam connected:false, then connected:true after connecting', async () => {
    const { userId, cookie } = await createUser('s2@example.com');
    const catalog = () => request(app.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(200);

    expect((await catalog()).body.services).toContainEqual(
      expect.objectContaining({ name: 'steam', connection: 'openid', connected: false }),
    );

    await connectSteam(userId);

    expect((await catalog()).body.services).toContainEqual(
      expect.objectContaining({ name: 'steam', connection: 'openid', connected: true, status: 'OK' }),
    );
  });

  it('3 + 8. recently_played returns up to `number` games, cached under :conn:{connectionId}', async () => {
    const { userId, cookie } = await createUser('s3@example.com');
    const connectionId = await connectSteam(userId);
    const instanceId = await createInstance(userId, 'recently_played', { number: 2 });

    const result = await firstEvent(cookie, instanceId);

    expect(result.event).toBe('widget:data');
    expect(result.payload).toMatchObject({
      instanceId,
      data: {
        games: [
          { appId: 220, name: 'Half-Life 2', playtime2Weeks: 192, playtimeForever: 900 },
          { appId: 620, name: 'Portal 2', playtime2Weeks: 90, playtimeForever: 300 },
        ],
      },
    });
    const keys = await app.get<Redis>(REDIS).keys('widget:steam.recently_played:*');
    expect(keys).toContainEqual(expect.stringMatching(new RegExp(`:conn:${connectionId}$`)));
  });

  it('4. game_news returns up to `number` news items for a valid app_id', async () => {
    const { userId, cookie } = await createUser('s4@example.com');
    await connectSteam(userId);
    const instanceId = await createInstance(userId, 'game_news', { app_id: 620, number: 2 });

    const result = await firstEvent(cookie, instanceId);

    expect(result.event).toBe('widget:data');
    expect(result.payload).toMatchObject({
      data: {
        appId: 620,
        items: [
          { id: 'n1', title: 'Community update: new Workshop maps' },
          { id: 'n2', title: 'Patch notes 1.12' },
        ],
      },
    });
  });

  it('5. an unconnected user gets widget:error NOT_CONNECTED', async () => {
    const { userId, cookie } = await createUser('s5@example.com');
    const instanceId = await createInstance(userId, 'recently_played', { number: 5 });

    const result = await firstEvent(cookie, instanceId);

    expect(result).toMatchObject({ event: 'widget:error', payload: { instanceId, code: 'NOT_CONNECTED' } });
  });

  it('6. an unknown app_id gets widget:error INVALID_PARAMS', async () => {
    const { userId, cookie } = await createUser('s6@example.com');
    await connectSteam(userId);
    const instanceId = await createInstance(userId, 'game_news', { app_id: 999_999_999, number: 5 });

    const result = await firstEvent(cookie, instanceId);

    expect(result).toMatchObject({ event: 'widget:error', payload: { instanceId, code: 'INVALID_PARAMS' } });
  });

  describe('without STEAM_API_KEY', () => {
    let noKeyApp: INestApplication;
    let noKeyUrl: string;

    beforeAll(async () => {
      // Hide the key from this second app instance only; SteamModule reads it once, in onModuleInit.
      // It shares the outer app's DB and JWT secret, so the outer helpers still apply.
      const realGet = ConfigService.prototype.get;
      const spy = vi
        .spyOn(ConfigService.prototype, 'get')
        .mockImplementation(function (this: ConfigService, ...args: unknown[]) {
          return args[0] === 'STEAM_API_KEY' ? undefined : (realGet as (...a: unknown[]) => unknown).apply(this, args);
        });
      try {
        ({ app: noKeyApp, baseUrl: noKeyUrl } = await startApp());
      } finally {
        spy.mockRestore();
      }
    });

    afterAll(async () => {
      await noKeyApp.close();
    });

    it('7. steam is still listed, and a fetch yields widget:error UPSTREAM_ERROR', async () => {
      const { userId, cookie } = await createUser('s7@example.com');
      await connectSteam(userId);

      const about = await request(noKeyApp.getHttpServer()).get('/about.json').expect(200);
      expect(about.body.server.services).toContainEqual(expect.objectContaining({ name: 'steam' }));
      const catalog = await request(noKeyApp.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(200);
      expect(catalog.body.services).toContainEqual(expect.objectContaining({ name: 'steam', connected: true }));

      const instanceId = await createInstance(userId, 'recently_played', { number: 5 });
      const result = await firstEvent(cookie, instanceId, noKeyUrl);

      expect(result).toMatchObject({
        event: 'widget:error',
        payload: { instanceId, code: 'UPSTREAM_ERROR', message: 'Steam API not configured' },
      });
    });
  });
});
