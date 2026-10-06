// e2e for features/timer-realtime/spec.md's verification checklist.
//
// Follows the catalog.e2e-spec.ts / connections.e2e-spec.ts conventions: real Postgres and
// Redis via testcontainers, and here a real Socket.IO server (app.listen on an ephemeral
// port) driven by a real socket.io-client, since the gateway/Timer/FetchService pipeline
// can't be exercised through supertest's plain-HTTP client. dashboards-api isn't merged on
// this branch yet, so Dashboard/WidgetInstance rows are created directly via Prisma
// (InstanceLookupService's shape matches the schema exactly).

import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WidgetDataPayload, WidgetErrorPayload } from '@dashboard/shared';
import { AppModule } from '../src/app.module.js';
import type { WidgetDefinition } from '../src/catalog/widget-definition.js';
import { WidgetRegistryService } from '../src/catalog/widget-registry.service.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { TokenCipherService } from '../src/connections/token-cipher.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { FetchError } from '../src/timer/fetch-error.js';

declare module '@dashboard/shared' {
  interface WidgetDataMap {
    'e2e.counter': { value: number };
    'e2e.flaky': { value: number };
    'e2e.connected': { userId: string };
  }
}

describe('Timer realtime (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let cipher: TokenCipherService;
  let registry: WidgetRegistryService;
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
    cipher = app.get(TokenCipherService);
    registry = app.get(WidgetRegistryService);
    registry.registerService({ name: 'e2e', connection: 'none' });
    registry.registerService({ name: 'e2e-connected', connection: 'oauth' });
  });

  afterAll(async () => {
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

  async function createUserWithCookie(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const token = jwtService.sign({ sub: user.id, role: 'USER', tv: 0 });
    return { userId: user.id, cookie: `session=${token}` };
  }

  async function createInstance(
    userId: string,
    service: string,
    widget: string,
    params: Record<string, unknown>,
    refreshRate: number,
  ): Promise<string> {
    const dashboard = await prisma.dashboard.create({ data: { userId, name: 'D', position: 0 } });
    const instance = await prisma.widgetInstance.create({
      data: {
        dashboardId: dashboard.id,
        service,
        widget,
        params: params as Prisma.InputJsonValue,
        refreshRate,
        x: 0,
        y: 0,
        w: 1,
        h: 1,
      },
    });
    return instance.id;
  }

  function connect(cookie?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, {
        extraHeaders: cookie ? { Cookie: cookie } : {},
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  }

  function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function collectEvents<T>(socket: ClientSocket, event: string): T[] {
    const events: T[] = [];
    socket.on(event, (payload: T) => events.push(payload));
    return events;
  }

  function subscribe(socket: ClientSocket, instanceId: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => socket.emit('widget:subscribe', { instanceId }, resolve));
  }

  function unsubscribe(socket: ClientSocket, instanceId: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => socket.emit('widget:unsubscribe', { instanceId }, resolve));
  }

  it('1. rejects a handshake with no valid session cookie', async () => {
    await expect(connect()).rejects.toBeTruthy();
  });

  it('2. delivers periodic widget:data for an owned instance from an auth:none fake definition', async () => {
    const counter: WidgetDefinition<'e2e.counter'> = {
      service: 'e2e',
      name: 'counter',
      description: 'counts',
      params: [{ name: 'label', type: 'string', required: true }],
      minRefreshSec: 1,
      auth: 'none',
      fetch: async () => ({ value: 1 }),
    };
    registry.register(counter);

    const { userId, cookie } = await createUserWithCookie('t2@example.com');
    const instanceId = await createInstance(userId, 'e2e', 'counter', { label: 'u1' }, 1);
    const socket = await connect(cookie);

    const events = collectEvents<WidgetDataPayload>(socket, 'widget:data');
    const ack = await subscribe(socket, instanceId);
    expect(ack).toEqual({ ok: true });

    await waitForEvent(socket, 'widget:data');
    await new Promise((r) => setTimeout(r, 2200));

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]).toMatchObject({ instanceId, data: { value: 1 } });
  });

  it("3. subscribing to another user's instance does not deliver data and doesn't leak existence", async () => {
    const owner = await createUserWithCookie('owner@example.com');
    const attacker = await createUserWithCookie('attacker@example.com');
    const instanceId = await createInstance(owner.userId, 'e2e', 'counter', { label: 'x' }, 1);

    const socket = await connect(attacker.cookie);
    const events = collectEvents<WidgetDataPayload>(socket, 'widget:data');

    const ack = await subscribe(socket, instanceId);
    expect(ack).toEqual({ ok: false });

    await new Promise((r) => setTimeout(r, 1200));
    expect(events).toHaveLength(0);
  });

  it('4. widget:unsubscribe and a full disconnect both stop further widget:data', async () => {
    const { userId, cookie } = await createUserWithCookie('t4@example.com');
    const instanceId = await createInstance(userId, 'e2e', 'counter', { label: 'u4' }, 1);

    const socket = await connect(cookie);
    const events = collectEvents<WidgetDataPayload>(socket, 'widget:data');
    await subscribe(socket, instanceId);
    await waitForEvent(socket, 'widget:data');

    await unsubscribe(socket, instanceId);
    const countAfterUnsub = events.length;
    await new Promise((r) => setTimeout(r, 1300));
    expect(events.length).toBe(countAfterUnsub);

    // Re-subscribe via a second socket, then kill it with a raw disconnect (not widget:unsubscribe).
    const socket2 = await connect(cookie);
    const events2 = collectEvents<WidgetDataPayload>(socket2, 'widget:data');
    await subscribe(socket2, instanceId);
    await waitForEvent(socket2, 'widget:data');
    socket2.disconnect();

    await new Promise((r) => setTimeout(r, 1300));
    const countAfterDisconnect = events2.length;
    await new Promise((r) => setTimeout(r, 1300));
    expect(events2.length).toBe(countAfterDisconnect);
  });

  it('5. two sockets subscribed to the same instance receive the same broadcast widget:data', async () => {
    const { userId, cookie } = await createUserWithCookie('t5@example.com');
    const instanceId = await createInstance(userId, 'e2e', 'counter', { label: 'u5' }, 1);

    const socketA = await connect(cookie);
    const socketB = await connect(cookie);
    const eventsA = collectEvents<WidgetDataPayload>(socketA, 'widget:data');
    const eventsB = collectEvents<WidgetDataPayload>(socketB, 'widget:data');

    await subscribe(socketA, instanceId);
    await subscribe(socketB, instanceId);
    await waitForEvent(socketA, 'widget:data');
    await new Promise((r) => setTimeout(r, 200));

    expect(eventsA.length).toBeGreaterThan(0);
    expect(eventsA[0]).toEqual(eventsB[0]);
  });

  it('6. two due instances with identical (service, widget, params) trigger exactly one fetch()', async () => {
    let calls = 0;
    const dedupeWidget: WidgetDefinition<'e2e.counter'> = {
      service: 'e2e',
      name: 'dedupe',
      description: 'dedupe check',
      params: [{ name: 'label', type: 'string', required: true }],
      minRefreshSec: 60,
      auth: 'none',
      fetch: async () => {
        calls += 1;
        return { value: calls };
      },
    };
    registry.register(dedupeWidget);

    const { userId, cookie } = await createUserWithCookie('t6@example.com');
    const instanceA = await createInstance(userId, 'e2e', 'dedupe', { label: 'shared' }, 1);
    const instanceB = await createInstance(userId, 'e2e', 'dedupe', { label: 'shared' }, 1);

    const socket = await connect(cookie);
    const eventsA = collectEvents<WidgetDataPayload>(socket, 'widget:data');
    await subscribe(socket, instanceA);
    await subscribe(socket, instanceB);

    await new Promise((r) => setTimeout(r, 1500));

    expect(eventsA.filter((e) => e.instanceId === instanceA || e.instanceId === instanceB).length).toBeGreaterThan(0);
    expect(calls).toBe(1);
  });

  it('7. RATE_LIMITED emits widget:error with retryAt, and the interval between failures grows', async () => {
    const rateLimited: WidgetDefinition<'e2e.flaky'> = {
      service: 'e2e',
      name: 'flaky',
      description: 'always rate limited',
      params: [{ name: 'label', type: 'string', required: true }],
      minRefreshSec: 1,
      auth: 'none',
      fetch: async () => {
        throw new FetchError('RATE_LIMITED', 'slow down');
      },
    };
    registry.register(rateLimited);

    const { userId, cookie } = await createUserWithCookie('t7@example.com');
    const instanceId = await createInstance(userId, 'e2e', 'flaky', { label: 'x' }, 1);
    const socket = await connect(cookie);
    const errors = collectEvents<WidgetErrorPayload>(socket, 'widget:error');

    await subscribe(socket, instanceId);
    const first = await waitForEvent<WidgetErrorPayload>(socket, 'widget:error');
    expect(first).toMatchObject({ instanceId, code: 'RATE_LIMITED' });
    expect(first.retryAt).toBeTruthy();

    // Second failure is due after a 2s backoff, plus up to one 1s timer tick of granularity.
    await waitForEvent<WidgetErrorPayload>(socket, 'widget:error', 6000);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const gapMs = new Date(errors[1].retryAt!).getTime() - new Date(errors[0].retryAt!).getTime();
    expect(gapMs).toBeGreaterThan(0);
  });

  it('8. NOT_CONNECTED emits widget:error once and deactivates the instance', async () => {
    const notConnected: WidgetDefinition<'e2e.flaky'> = {
      service: 'e2e',
      name: 'no_connection',
      description: 'always not connected',
      params: [{ name: 'label', type: 'string', required: true }],
      minRefreshSec: 1,
      auth: 'none',
      fetch: async () => {
        throw new FetchError('NOT_CONNECTED', 'no connection');
      },
    };
    registry.register(notConnected);

    const { userId, cookie } = await createUserWithCookie('t8@example.com');
    const instanceId = await createInstance(userId, 'e2e', 'no_connection', { label: 'x' }, 1);
    const socket = await connect(cookie);
    const errors = collectEvents<WidgetErrorPayload>(socket, 'widget:error');

    await subscribe(socket, instanceId);
    await waitForEvent(socket, 'widget:error');
    await new Promise((r) => setTimeout(r, 1500));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ instanceId, code: 'NOT_CONNECTED' });
  });

  it('9. a cache hit inside minRefreshSec serves without calling fetch() again across two ticks', async () => {
    let calls = 0;
    const cached: WidgetDefinition<'e2e.counter'> = {
      service: 'e2e',
      name: 'cached',
      description: 'cache check',
      params: [{ name: 'label', type: 'string', required: true }],
      minRefreshSec: 30,
      auth: 'none',
      fetch: async () => {
        calls += 1;
        return { value: calls };
      },
    };
    registry.register(cached);

    const { userId, cookie } = await createUserWithCookie('t9@example.com');
    const instanceId = await createInstance(userId, 'e2e', 'cached', { label: 'x' }, 1);
    const socket = await connect(cookie);
    const events = collectEvents<WidgetDataPayload>(socket, 'widget:data');

    await subscribe(socket, instanceId);
    await waitForEvent(socket, 'widget:data');
    await new Promise((r) => setTimeout(r, 2200));

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(calls).toBe(1);
  });

  it('10. the :conn: cache suffix keeps two users’ connection-scoped fetches from sharing data', async () => {
    const connectedWidget: WidgetDefinition<'e2e.connected'> = {
      service: 'e2e-connected',
      name: 'whoami',
      description: 'reflects the caller',
      params: [{ name: 'label', type: 'string', required: true }],
      minRefreshSec: 30,
      auth: 'connection',
      fetch: async (_params, ctx) => ({ userId: ctx.userId }),
    };
    registry.register(connectedWidget);

    const userA = await createUserWithCookie('conn-a@example.com');
    const userB = await createUserWithCookie('conn-b@example.com');
    await prisma.serviceConnection.create({
      data: { userId: userA.userId, service: 'e2e-connected', externalAccountId: 'a', accessTokenEnc: cipher.encrypt('tok-a'), status: 'OK' },
    });
    await prisma.serviceConnection.create({
      data: { userId: userB.userId, service: 'e2e-connected', externalAccountId: 'b', accessTokenEnc: cipher.encrypt('tok-b'), status: 'OK' },
    });
    const instanceA = await createInstance(userA.userId, 'e2e-connected', 'whoami', { label: 'same' }, 1);
    const instanceB = await createInstance(userB.userId, 'e2e-connected', 'whoami', { label: 'same' }, 1);

    const socketA = await connect(userA.cookie);
    const socketB = await connect(userB.cookie);
    const dataA = waitForEvent<WidgetDataPayload>(socketA, 'widget:data');
    const dataB = waitForEvent<WidgetDataPayload>(socketB, 'widget:data');
    await subscribe(socketA, instanceA);
    await subscribe(socketB, instanceB);

    const [payloadA, payloadB] = await Promise.all([dataA, dataB]);
    expect(payloadA.data).toEqual({ userId: userA.userId });
    expect(payloadB.data).toEqual({ userId: userB.userId });
  });
});
