// e2e for features/github-widgets/spec.md's verification checklist (item 1 lives in
// about.e2e-spec.ts).
//
// Follows timer-realtime.e2e-spec.ts: real Postgres/Redis via testcontainers and a real
// Socket.IO client, so the registry -> Timer -> FetchService -> fetch() pipeline runs as in
// production. Only the GitHub HTTP boundary is replaced: global fetch is stubbed for
// api.github.com (every other URL passes through), answering per access token.

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
import { TokenCipherService } from '../src/connections/token-cipher.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { REDIS } from '../src/core/redis/redis.provider.js';

const PULLS = [
  { number: 1, title: 'Improve README', state: 'open', html_url: 'p1', user: { login: 'a' } },
  { number: 2, title: 'Old refactor', state: 'closed', html_url: 'p2', user: { login: 'b' } },
];

/** Fake api.github.com: 401 for token 'revoked', otherwise data derived from the path/query/token. */
function fakeGithub(url: URL, token: string): Response {
  if (token === 'revoked') return Response.json({ message: 'Bad credentials' }, { status: 401 });

  if (url.pathname.endsWith('/commits')) {
    const count = Number(url.searchParams.get('per_page'));
    const commits = Array.from({ length: count }, (_, i) => ({
      sha: `sha${i}-${token}`,
      html_url: `c${i}`,
      commit: { message: `commit ${i}`, author: { name: 'Ada', date: `2026-01-${String(20 - i).padStart(2, '0')}` } },
    }));
    return Response.json(commits);
  }
  if (url.pathname.endsWith('/pulls')) {
    const state = url.searchParams.get('state');
    return Response.json(state === 'all' ? PULLS : PULLS.filter((p) => p.state === state));
  }
  if (url.pathname.endsWith('/dependabot/alerts')) return Response.json([]);
  return Response.json({ message: 'Not Found' }, { status: 404 });
}

describe('GitHub widgets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let cipher: TokenCipherService;
  let redis: Redis;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];
  const githubCalls: URL[] = [];

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== 'api.github.com') return realFetch(input, init);
      githubCalls.push(url);
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      return fakeGithub(url, auth.replace(/^Bearer /, ''));
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
    githubCalls.length = 0;
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.serviceConnection.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUser(email: string, githubToken?: string): Promise<{ userId: string; cookie: string; connectionId?: string }> {
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const cookie = `session=${jwtService.sign({ sub: user.id, role: 'USER', tv: 0 })}`;
    if (githubToken === undefined) return { userId: user.id, cookie };
    const connection = await prisma.serviceConnection.create({
      data: { userId: user.id, service: 'github', externalAccountId: email, accessTokenEnc: cipher.encrypt(githubToken), status: 'OK' },
    });
    return { userId: user.id, cookie, connectionId: connection.id };
  }

  async function createInstance(userId: string, widget: string, params: Record<string, string | number>): Promise<string> {
    const dashboard = await prisma.dashboard.create({ data: { userId, name: 'D', position: 0 } });
    const instance = await prisma.widgetInstance.create({
      data: { dashboardId: dashboard.id, service: 'github', widget, params, refreshRate: 60, x: 0, y: 0, w: 1, h: 1 },
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

  /** The widget:data body of `event`, failing the test if it was a widget:error instead. */
  function dataOf<K extends keyof WidgetDataMap>(event: { data?: WidgetDataPayload; error?: WidgetErrorPayload }): WidgetDataMap[K] {
    if (!event.data) throw new Error(`expected widget:data, got ${JSON.stringify(event.error)}`);
    return event.data.data as WidgetDataMap[K];
  }

  it('2. /api/catalog shows github connected:false, then connected:true once connected', async () => {
    const { userId, cookie } = await createUser('cat@example.com');
    const githubEntry = async () => {
      const res = await request(app.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(200);
      return res.body.services.find((s: { name: string }) => s.name === 'github');
    };

    expect(await githubEntry()).toMatchObject({ connection: 'oauth', connected: false });
    await prisma.serviceConnection.create({
      data: { userId, service: 'github', externalAccountId: 'gh', accessTokenEnc: cipher.encrypt('t'), status: 'OK' },
    });
    expect(await githubEntry()).toMatchObject({ connection: 'oauth', connected: true, status: 'OK' });
  });

  it('3. recent_commits yields `number` commits, most recent first', async () => {
    const { userId, cookie } = await createUser('commits@example.com', 'tok-commits');
    const instanceId = await createInstance(userId, 'recent_commits', { repo: 'octocat/hello-world', number: 3 });

    const { commits } = dataOf<'github.recent_commits'>(await firstEvent(cookie, instanceId));

    const dates = commits.map((c) => c.date);
    expect(dates).toHaveLength(3);
    expect(dates).toEqual(dates.toSorted().reverse());
    expect(githubCalls[0].pathname).toBe('/repos/octocat/hello-world/commits');
  });

  it.each([
    ['closed', ['closed']],
    ['all', ['open', 'closed']],
  ])('4. pull_requests with state %s returns only matching PRs', async (state, expected) => {
    const { userId, cookie } = await createUser(`pulls-${state}@example.com`, 'tok-pulls');
    const instanceId = await createInstance(userId, 'pull_requests', { repo: 'octocat/hello-world', state });

    const data = dataOf<'github.pull_requests'>(await firstEvent(cookie, instanceId));

    expect(data.state).toBe(state);
    expect(data.pulls.map((p) => p.state)).toEqual(expected);
  });

  it('5. security_alerts returns the alert list shape (empty is valid)', async () => {
    const { userId, cookie } = await createUser('alerts@example.com', 'tok-alerts');
    const instanceId = await createInstance(userId, 'security_alerts', { repo: 'octocat/hello-world' });

    expect(dataOf(await firstEvent(cookie, instanceId))).toEqual({ repo: 'octocat/hello-world', alerts: [] });
  });

  it('6. an unconnected user gets widget:error NOT_CONNECTED', async () => {
    const { userId, cookie } = await createUser('noconn@example.com');
    const instanceId = await createInstance(userId, 'security_alerts', { repo: 'octocat/hello-world' });

    const { error } = await firstEvent(cookie, instanceId);

    expect(error).toMatchObject({ instanceId, code: 'NOT_CONNECTED' });
    expect(githubCalls).toHaveLength(0);
  });

  it('7. a repo failing the owner/name pattern is rejected at instance create, never reaching GitHub', async () => {
    const { userId, cookie } = await createUser('badrepo@example.com', 'tok-bad');
    const dashboard = await prisma.dashboard.create({ data: { userId, name: 'D', position: 0 } });

    for (const repo of ['not-a-repo', 'owner/..', 'a/b/c']) {
      await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboard.id}/widgets`)
        .set('Cookie', cookie)
        .send({ service: 'github', widget: 'security_alerts', params: { repo }, refreshRate: 300, x: 0, y: 0, w: 2, h: 2 })
        .expect(400);
    }
    expect(await prisma.widgetInstance.count()).toBe(0);
    expect(githubCalls).toHaveLength(0);
  });

  it('8. a revoked token yields REAUTH_REQUIRED and flips the connection to REAUTH', async () => {
    const { userId, cookie, connectionId } = await createUser('revoked@example.com', 'revoked');
    const instanceId = await createInstance(userId, 'pull_requests', { repo: 'octocat/hello-world', state: 'open' });

    const { error } = await firstEvent(cookie, instanceId);

    expect(error).toMatchObject({ instanceId, code: 'REAUTH_REQUIRED' });
    const row = await prisma.serviceConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(row.status).toBe('REAUTH');
  });

  it("9. cache keys carry :conn:{connectionId}, so two users' identical params never share data", async () => {
    const a = await createUser('cache-a@example.com', 'tok-a');
    const b = await createUser('cache-b@example.com', 'tok-b');
    const params = { repo: 'octocat/cache-check', number: 1 };
    const instanceA = await createInstance(a.userId, 'recent_commits', params);
    const instanceB = await createInstance(b.userId, 'recent_commits', params);

    const [eventA, eventB] = await Promise.all([firstEvent(a.cookie, instanceA), firstEvent(b.cookie, instanceB)]);

    expect(dataOf<'github.recent_commits'>(eventA).commits[0].sha).toBe('sha0-tok-a');
    expect(dataOf<'github.recent_commits'>(eventB).commits[0].sha).toBe('sha0-tok-b');
    const keys = await redis.keys('widget:github.recent_commits:*');
    expect(keys.some((k) => k.endsWith(`:conn:${a.connectionId}`))).toBe(true);
    expect(keys.some((k) => k.endsWith(`:conn:${b.connectionId}`))).toBe(true);
  });
});
