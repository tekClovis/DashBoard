// e2e for features/youtube-widgets/spec.md's verification checklist.
//
// Follows github-widgets.e2e-spec.ts: real Postgres/Redis via testcontainers and a real
// Socket.IO client, so the registry -> Timer -> FetchService -> fetch() pipeline runs as in
// production. Only Google's HTTP boundary is replaced: global fetch is stubbed for
// www.googleapis.com (YouTube Data API) and oauth2.googleapis.com (token refresh); every
// other URL passes through.

import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetDataMap, WidgetDataPayload, WidgetErrorPayload } from '@dashboard/shared';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { ConnectionsService } from '../src/connections/connections.service.js';
import { TokenCipherService } from '../src/connections/token-cipher.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { REDIS } from '../src/core/redis/redis.provider.js';

const EXPIRED = 'expired-access';
const REFRESHED = 'refreshed-access';
const GOOD_REFRESH = 'good-refresh';
const RECONNECTED = 'reconnected-access';
/** Refresh tokens the fake token endpoint answers with a malformed 200 (7d). */
const MALFORMED: Record<string, object> = {
  'no-expiry-refresh': { access_token: 'T1' },
  // Past the Date range: an Invalid Date that the DB write used to reject with its own text.
  'huge-expiry-refresh': { access_token: 'T1', expires_in: 1e13 },
  // Not a valid header value: it used to be stored, then quoted back by fetch's header error.
  'newline-token-refresh': { access_token: 'tok-SECRET\nX-Injected: 1', expires_in: 3600 },
};

/** Fake YouTube Data API: 401 for the expired token, otherwise data derived from path/query. */
function fakeYoutube(url: URL, token: string): Response {
  if (token === EXPIRED) return Response.json({ error: { code: 401 } }, { status: 401 });
  const max = Number(url.searchParams.get('maxResults'));
  const snippet = (title: string, day: number) => ({
    title,
    channelTitle: 'Chan',
    publishedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`,
  });

  if (url.pathname.endsWith('/channels')) {
    if (url.searchParams.get('id') !== 'UC_known') return Response.json({ items: [] });
    return Response.json({
      items: [
        {
          snippet: { title: 'Known channel', thumbnails: { default: { url: 'https://yt3.ggpht.com/known=s88' } } },
          statistics: { subscriberCount: '2400000', hiddenSubscriberCount: false, viewCount: '180000000', videoCount: '412' },
          contentDetails: { relatedPlaylists: { uploads: 'UU_known' } },
        },
      ],
    });
  }
  if (url.pathname.endsWith('/playlistItems')) {
    const items = Array.from({ length: max }, (_, i) => ({
      snippet: { ...snippet(`upload ${i}`, 20 - i), resourceId: { videoId: `up${i}` } },
    }));
    return Response.json({ items });
  }
  if (url.pathname.endsWith('/videos')) {
    const region = url.searchParams.get('regionCode');
    return Response.json({ items: Array.from({ length: max }, (_, i) => ({ id: `tr${i}`, snippet: snippet(`${region} hit ${i}`, 22) })) });
  }
  return Response.json({ error: { code: 404 } }, { status: 404 });
}

/** Fake Google token endpoint: only GOOD_REFRESH is accepted; MALFORMED refresh tokens get a malformed 200. */
function fakeTokenEndpoint(body: URLSearchParams): Response {
  if (body.get('grant_type') === 'refresh_token') {
    const refreshToken = body.get('refresh_token');
    if (refreshToken === GOOD_REFRESH) return Response.json({ access_token: REFRESHED, expires_in: 3600, token_type: 'Bearer' });
    if (refreshToken && refreshToken in MALFORMED) return Response.json(MALFORMED[refreshToken]);
  }
  return Response.json({ error: 'invalid_grant' }, { status: 400 });
}

describe('YouTube widgets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let cipher: TokenCipherService;
  let redis: Redis;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];
  const youtubeCalls: { url: URL; token: string }[] = [];
  let tokenCalls = 0;
  // Set by holdTokenEndpoint(): the token endpoint waits on the gate, so a test can act mid-refresh.
  let held: { gate: Promise<void>; onRequest: () => void } | undefined;

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === 'oauth2.googleapis.com') {
        if (url.pathname === '/revoke') return new Response(null, { status: 200 });
        tokenCalls += 1;
        held?.onRequest();
        await held?.gate;
        return fakeTokenEndpoint(init?.body as URLSearchParams);
      }
      if (url.hostname !== 'www.googleapis.com') return realFetch(input, init);
      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer /, '');
      youtubeCalls.push({ url, token });
      return fakeYoutube(url, token);
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);

    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    cipher = app.get(TokenCipherService);
    redis = app.get(REDIS);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  beforeEach(async () => {
    youtubeCalls.length = 0;
    tokenCalls = 0;
    held = undefined;
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.serviceConnection.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUser(
    email: string,
    tokens?: { access: string; refresh?: string },
  ): Promise<{ userId: string; cookie: string; connectionId?: string }> {
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const cookie = `session=${jwtService.sign({ sub: user.id, role: 'USER', tv: 0 })}`;
    if (!tokens) return { userId: user.id, cookie };
    const connection = await prisma.serviceConnection.create({
      data: {
        userId: user.id,
        service: 'youtube',
        externalAccountId: email,
        accessTokenEnc: cipher.encrypt(tokens.access),
        refreshTokenEnc: tokens.refresh ? cipher.encrypt(tokens.refresh) : null,
        status: 'OK',
      },
    });
    return { userId: user.id, cookie, connectionId: connection.id };
  }

  async function createInstance(userId: string, widget: string, params: Record<string, string | number>): Promise<string> {
    const dashboard = await prisma.dashboard.create({ data: { userId, name: 'D', position: 0 } });
    const instance = await prisma.widgetInstance.create({
      data: { dashboardId: dashboard.id, service: 'youtube', widget, params, refreshRate: 900, x: 0, y: 0, w: 1, h: 1 },
    });
    return instance.id;
  }

  function connect(cookie: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { extraHeaders: { Cookie: cookie }, reconnection: false, forceNew: true });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  /** Subscribes `cookie`'s socket to the instance and resolves with its first widget:data or widget:error. */
  async function firstEvent(cookie: string, instanceId: string): Promise<{ data?: WidgetDataPayload; error?: WidgetErrorPayload }> {
    const socket = await connect(cookie);
    const result = new Promise<{ data?: WidgetDataPayload; error?: WidgetErrorPayload }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for widget event')), 4000);
      socket.once('widget:data', (data: WidgetDataPayload) => {
        clearTimeout(timer);
        resolve({ data });
      });
      socket.once('widget:error', (error: WidgetErrorPayload) => {
        clearTimeout(timer);
        resolve({ error });
      });
    });
    const ack = await new Promise((resolve) => socket.emit('widget:subscribe', { instanceId }, resolve));
    expect(ack).toEqual({ ok: true });
    return result;
  }

  /** Holds the next token refresh until release(); `requested` resolves once it has reached Google. */
  function holdTokenEndpoint(): { requested: Promise<void>; release: () => void } {
    let release!: () => void;
    let onRequest!: () => void;
    const requested = new Promise<void>((resolve) => (onRequest = resolve));
    held = { gate: new Promise((resolve) => (release = resolve)), onRequest };
    return { requested, release };
  }

  /** Reconnects youtube the way the OAuth callback does: same row, new tokens, status OK. */
  function reconnect(userId: string): Promise<void> {
    return app.get(ConnectionsService).upsertOAuthConnection(userId, 'youtube', {
      externalAccountId: 'g',
      accessToken: RECONNECTED,
      refreshToken: 'reconnected-refresh',
      scopes: [],
    });
  }

  /** The widget:data body of `event`, failing the test if it was a widget:error instead. */
  function dataOf<K extends keyof WidgetDataMap>(event: { data?: WidgetDataPayload; error?: WidgetErrorPayload }): WidgetDataMap[K] {
    if (!event.data) throw new Error(`expected widget:data, got ${JSON.stringify(event.error)}`);
    return event.data.data as WidgetDataMap[K];
  }

  it('1. /about.json lists youtube with its three widgets', async () => {
    const res = await request(app.getHttpServer()).get('/about.json').expect(200);

    const youtube = res.body.server.services.find((s: { name: string }) => s.name === 'youtube');
    expect(youtube.widgets.map((w: { name: string }) => w.name)).toEqual(['channel_stats', 'latest_videos', 'trending_videos']);
    expect(youtube.widgets[2].params).toEqual([
      { name: 'region', type: 'string' },
      { name: 'number', type: 'integer' },
    ]);
  });

  it('2. /api/catalog shows youtube connected:false, then connected:true once connected', async () => {
    const { userId, cookie } = await createUser('cat@example.com');
    const youtubeEntry = async () => {
      const res = await request(app.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(200);
      return res.body.services.find((s: { name: string }) => s.name === 'youtube');
    };

    expect(await youtubeEntry()).toMatchObject({ connection: 'oauth', connected: false });
    await prisma.serviceConnection.create({
      data: { userId, service: 'youtube', externalAccountId: 'g', accessTokenEnc: cipher.encrypt('t'), status: 'OK' },
    });
    expect(await youtubeEntry()).toMatchObject({ connection: 'oauth', connected: true, status: 'OK' });
  });

  it('3. channel_stats returns subscriber/view/video counts', async () => {
    const { userId, cookie } = await createUser('stats@example.com', { access: 'tok' });
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_known' });

    expect(dataOf(await firstEvent(cookie, instanceId))).toEqual({
      channelId: 'UC_known',
      title: 'Known channel',
      subscribers: 2400000,
      views: 180000000,
      videos: 412,
      imageUrl: 'https://yt3.ggpht.com/known=s88',
    });
  });

  it('3b. an unknown channel_id yields INVALID_PARAMS', async () => {
    const { userId, cookie } = await createUser('unknown@example.com', { access: 'tok' });
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_unknown' });

    expect((await firstEvent(cookie, instanceId)).error).toMatchObject({ instanceId, code: 'INVALID_PARAMS' });
  });

  it('4. latest_videos returns up to `number` videos, most recent first', async () => {
    const { userId, cookie } = await createUser('latest@example.com', { access: 'tok' });
    const instanceId = await createInstance(userId, 'latest_videos', { channel_id: 'UC_known', number: 3 });

    const { videos } = dataOf<'youtube.latest_videos'>(await firstEvent(cookie, instanceId));

    const dates = videos.map((v) => v.publishedAt);
    expect(dates).toHaveLength(3);
    expect(dates).toEqual(dates.toSorted().reverse());
    expect(videos[0].url).toBe('https://www.youtube.com/watch?v=up0');
  });

  it('5. trending_videos returns up to `number` videos for the region', async () => {
    const { userId, cookie } = await createUser('trending@example.com', { access: 'tok' });
    const instanceId = await createInstance(userId, 'trending_videos', { region: 'FR', number: 2 });

    const data = dataOf<'youtube.trending_videos'>(await firstEvent(cookie, instanceId));

    expect(data.region).toBe('FR');
    expect(data.videos.map((v) => v.title)).toEqual(['FR hit 0', 'FR hit 1']);
  });

  it('6. an expired access token is refreshed silently, persisted encrypted, and the request succeeds', async () => {
    const { userId, cookie, connectionId } = await createUser('expired@example.com', { access: EXPIRED, refresh: GOOD_REFRESH });
    const instanceId = await createInstance(userId, 'trending_videos', { region: 'US', number: 1 });

    const event = await firstEvent(cookie, instanceId);

    expect(dataOf<'youtube.trending_videos'>(event).videos).toHaveLength(1);
    expect(tokenCalls).toBe(1);
    expect(youtubeCalls.map((c) => c.token)).toEqual([EXPIRED, REFRESHED]);
    const row = await prisma.serviceConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(cipher.decrypt(row.accessTokenEnc!)).toBe(REFRESHED);
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(row.status).toBe('OK');
  });

  it('7. a failed refresh (revoked refresh token) yields REAUTH_REQUIRED and flips the connection to REAUTH', async () => {
    const { userId, cookie, connectionId } = await createUser('revoked@example.com', { access: EXPIRED, refresh: 'revoked-refresh' });
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_known' });

    const { error } = await firstEvent(cookie, instanceId);

    expect(error).toMatchObject({ instanceId, code: 'REAUTH_REQUIRED' });
    expect(tokenCalls).toBe(1);
    const row = await prisma.serviceConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(row.status).toBe('REAUTH');
  });

  it('7b. a disconnect during a refresh yields NOT_CONNECTED without leaking internals, and nothing is re-created', async () => {
    const { userId, cookie } = await createUser('disconnect@example.com', { access: EXPIRED, refresh: GOOD_REFRESH });
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_known' });
    const gate = holdTokenEndpoint();

    const event = firstEvent(cookie, instanceId);
    await gate.requested;
    await request(app.getHttpServer()).delete('/api/connections/youtube').set('Cookie', cookie).expect(200);
    gate.release();
    const { error } = await event;

    expect(error).toMatchObject({ instanceId, code: 'NOT_CONNECTED' });
    expect(error!.message).not.toMatch(/prisma|invocation|\.ts/i);
    expect(await prisma.serviceConnection.count({ where: { userId } })).toBe(0);
  });

  it.each(Object.keys(MALFORMED))('7d. a malformed token response (%s) yields UPSTREAM_ERROR with a fixed message and leaves the row untouched', async (refresh) => {
    const { userId, cookie, connectionId } = await createUser(`${refresh}@example.com`, { access: EXPIRED, refresh });
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_known' });
    const before = await prisma.serviceConnection.findUniqueOrThrow({ where: { id: connectionId } });

    const { error } = await firstEvent(cookie, instanceId);

    expect(error).toMatchObject({ instanceId, code: 'UPSTREAM_ERROR', message: 'Google token endpoint returned an invalid response.' });
    expect(await prisma.serviceConnection.findUniqueOrThrow({ where: { id: connectionId } })).toEqual(before);
  });

  it.each([
    ['refused', 'revoked-refresh'],
    ['granted', GOOD_REFRESH],
  ])('7c. a reconnect during a refresh whose old grant is %s keeps the new connection and uses its token', async (_, oldRefresh) => {
    const { userId, cookie, connectionId } = await createUser(`reconnect-${oldRefresh}@example.com`, { access: EXPIRED, refresh: oldRefresh });
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_known' });
    const gate = holdTokenEndpoint();

    const event = firstEvent(cookie, instanceId);
    await gate.requested;
    await reconnect(userId);
    gate.release();

    expect(dataOf<'youtube.channel_stats'>(await event).subscribers).toBe(2400000);
    expect(youtubeCalls.map((c) => c.token)).toEqual([EXPIRED, RECONNECTED]);
    const row = await prisma.serviceConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(row.status).toBe('OK');
    expect(cipher.decrypt(row.accessTokenEnc!)).toBe(RECONNECTED);
    expect(cipher.decrypt(row.refreshTokenEnc!)).toBe('reconnected-refresh');
  });

  it('8. an unconnected user gets widget:error NOT_CONNECTED', async () => {
    const { userId, cookie } = await createUser('noconn@example.com');
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_known' });

    expect((await firstEvent(cookie, instanceId)).error).toMatchObject({ instanceId, code: 'NOT_CONNECTED' });
    expect(youtubeCalls).toHaveLength(0);
  });

  it('9. a region failing the ISO-3166 pattern is rejected at instance create, never reaching YouTube', async () => {
    const { userId, cookie } = await createUser('badregion@example.com', { access: 'tok' });
    const dashboard = await prisma.dashboard.create({ data: { userId, name: 'D', position: 0 } });

    for (const region of ['fr', 'FRA', 'F1']) {
      await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboard.id}/widgets`)
        .set('Cookie', cookie)
        .send({ service: 'youtube', widget: 'trending_videos', params: { region, number: 5 }, refreshRate: 900, x: 0, y: 0, w: 2, h: 2 })
        .expect(400);
    }
    expect(await prisma.widgetInstance.count()).toBe(0);
    expect(youtubeCalls).toHaveLength(0);
  });

  it('10. cache keys carry :conn:{connectionId}', async () => {
    const { userId, cookie, connectionId } = await createUser('cache@example.com', { access: 'tok' });
    const instanceId = await createInstance(userId, 'channel_stats', { channel_id: 'UC_known' });

    dataOf(await firstEvent(cookie, instanceId));

    const keys = await redis.keys('widget:youtube.channel_stats:*');
    expect(keys.some((k) => k.endsWith(`:conn:${connectionId}`))).toBe(true);
  });
});
