import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server, type Socket } from 'socket.io';
import type { UserSocketDisconnector } from '../admin/user-socket-disconnector.js';
import { JwtService } from '../auth/jwt.service.js';
import type { TokenRevocationService } from '../auth/token-revocation.service.js';
import type { Params } from '../catalog/widget-definition.js';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { DashboardEventsService } from '../dashboards/dashboard-events.js';
import { FetchError } from './fetch-error.js';
import type { FetchService } from './fetch.service.js';
import { InstanceLookupService } from './instance-lookup.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { makeWidgetDefinition } from './test-helpers.js';
import { TimerService } from './timer.service.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const REAUTH_INTERVAL_MS = 60_000;
const TICK_MS = 1000;

interface UserRow {
  id: string;
  email: string;
  role: 'USER';
  tokenVersion: number;
  bannedAt: Date | null;
  emailVerifiedAt: Date | null;
}

interface InstanceRow {
  id: string;
  service: string;
  widget: string;
  params: Params;
  refreshRate: number;
  dashboard: { userId: string };
}

type ById = { where: { id: string } };

/**
 * Real gateway, JwtService, InstanceLookupService, TimerService and an unattached Socket.IO
 * server (real in-memory adapter, so rooms / 'delete-room' / broadcast routing are the real
 * thing). Only the process boundaries are faked: Prisma, Redis-backed revocation, the
 * widget fetch, and the engine-level socket (no HTTP server is ever bound).
 */
function setup() {
  const users = new Map<string, UserRow>();
  const instanceRows = new Map<string, InstanceRow>();
  const revokedJtis = new Set<string>();

  const findUser = vi.fn(async ({ where }: ById) => users.get(where.id) ?? null);
  const prisma = {
    user: { findUnique: findUser },
    widgetInstance: { findUnique: async ({ where }: ById) => instanceRows.get(where.id) ?? null },
  } as unknown as PrismaService;
  const revocation = {
    isRevoked: async (jti: string) => revokedJtis.has(jti),
  } as unknown as TokenRevocationService;
  const jwt = new JwtService({ getOrThrow: () => 'test-secret' } as never);

  const registry = new WidgetRegistryService();
  registry.registerService({ name: 'fake', connection: 'none' });
  const def = makeWidgetDefinition({ minRefreshSec: 1 });
  registry.register(def);
  const fetch = vi.fn(async (_def: unknown, params: Params, _userId: string) => ({
    data: { echoed: params.label },
    fetchedAt: new Date().toISOString(),
  }));
  const timer = new TimerService(registry, { get: fetch } as unknown as FetchService, prisma, new DashboardEventsService());

  const gateway = new RealtimeGateway(jwt, prisma, revocation, timer, new InstanceLookupService(prisma));
  const server = new Server();
  const use = vi.spyOn(server, 'use');
  // Nest assigns the @WebSocketServer() property itself before calling afterInit.
  Object.assign(gateway, { server });
  gateway.afterInit(server);
  timer.onModuleInit();
  const middleware = use.mock.calls[0][0];
  const nsp = server.of('/');

  function addUser(id: string, overrides: Partial<UserRow> = {}): string {
    users.set(id, { id, email: `${id}@b.com`, role: 'USER', tokenVersion: 0, bannedAt: null, emailVerifiedAt: null, ...overrides });
    return jwt.sign({ sub: id, role: 'USER', tv: 0 });
  }

  function addInstance(id: string, ownerId: string, overrides: Partial<InstanceRow> = {}): void {
    instanceRows.set(id, {
      id,
      service: 'fake',
      widget: 'echo',
      params: { label: id },
      refreshRate: 5,
      dashboard: { userId: ownerId },
      ...overrides,
    });
  }

  /** A socket as the adapter sees it: room membership and delivery go through the real adapter. */
  function makeSocket(id: string, cookie?: string) {
    const received: unknown[] = [];
    // What a real Socket#disconnect does: leave every room, drop out of the namespace, and
    // (via Nest's 'disconnect' listener) reach the gateway's handleDisconnect.
    const disconnect = vi.fn(() => {
      nsp.adapter.delAll(id);
      nsp.sockets.delete(id);
      gateway.handleDisconnect(socket);
    });
    const socket: Socket = {
      id,
      data: {},
      handshake: { headers: { cookie } },
      join: (room: string) => nsp.adapter.addAll(id, new Set([room])),
      leave: (room: string) => nsp.adapter.del(id, room),
      disconnect,
      notifyOutgoingListeners: (packet: { data: unknown }) => received.push(packet.data),
      client: { writeToEngine: () => undefined },
    } as unknown as Socket;
    nsp.sockets.set(id, socket);
    return { socket, received, disconnect };
  }

  /** Runs the handshake middleware; resolves with the error passed to `next`, if any. */
  function handshake(socket: Socket): Promise<Error | undefined> {
    return new Promise((resolve) => middleware(socket, resolve));
  }

  /** Full connect for an existing-or-new valid user: handshake + handleConnection. */
  async function connect(socketId: string, userId: string) {
    const token = addUser(userId);
    const made = makeSocket(socketId, `session=${token}`);
    expect(await handshake(made.socket)).toBeUndefined();
    await gateway.handleConnection(made.socket);
    return made;
  }

  const roomsOf = (socket: Socket) => [...(nsp.adapter.sids.get(socket.id) ?? [])];

  return { gateway, timer, def, fetch, findUser, users, revokedJtis, jwt, addUser, addInstance, makeSocket, handshake, connect, roomsOf };
}

describe('RealtimeGateway', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    ctx = setup();
  });

  afterEach(() => {
    ctx.timer.onModuleDestroy();
    vi.useRealTimers();
  });

  describe('handshake auth', () => {
    it('rejects a handshake with no session cookie, without a user lookup', async () => {
      const { socket } = ctx.makeSocket('s1', 'other=1');

      const err = await ctx.handshake(socket);

      expect(err?.message).toBe('Unauthorized');
      expect(socket.data.userId).toBeUndefined();
      expect(ctx.findUser).not.toHaveBeenCalled();
    });

    it('rejects a token whose signature does not verify', async () => {
      const token = ctx.addUser('u1');
      const { socket } = ctx.makeSocket('s1', `session=${token.slice(0, -2)}xx`);

      expect((await ctx.handshake(socket))?.message).toBe('Unauthorized');
      expect(socket.data.userId).toBeUndefined();
    });

    it('rejects a token revoked by logout', async () => {
      const token = ctx.addUser('u1');
      ctx.revokedJtis.add(ctx.jwt.verify(token)!.jti);
      const { socket } = ctx.makeSocket('s1', `session=${token}`);

      expect((await ctx.handshake(socket))?.message).toBe('Unauthorized');
      expect(socket.data.userId).toBeUndefined();
    });

    it('rejects a banned user', async () => {
      const token = ctx.addUser('u1', { bannedAt: NOW });
      const { socket } = ctx.makeSocket('s1', `session=${token}`);

      expect((await ctx.handshake(socket))?.message).toBe('Unauthorized');
      expect(socket.data.userId).toBeUndefined();
    });

    it('rejects a token superseded by logout-all (tokenVersion mismatch)', async () => {
      const token = ctx.addUser('u1', { tokenVersion: 1 });
      const { socket } = ctx.makeSocket('s1', `session=${token}`);

      expect((await ctx.handshake(socket))?.message).toBe('Unauthorized');
    });

    it('rejects (rather than leaving the handshake hanging) when the user lookup throws', async () => {
      const token = ctx.addUser('u1');
      ctx.findUser.mockRejectedValueOnce(new Error('db down'));
      const { socket } = ctx.makeSocket('s1', `session=${token}`);

      expect((await ctx.handshake(socket))?.message).toBe('Unauthorized');
      expect(socket.data.userId).toBeUndefined();
    });

    it('accepts a valid session and records the user id on the socket', async () => {
      const token = ctx.addUser('u1');
      const { socket } = ctx.makeSocket('s1', `theme=dark; session=${token}`);

      expect(await ctx.handshake(socket)).toBeUndefined();
      expect(socket.data.userId).toBe('u1');
    });
  });

  describe('connection and periodic re-auth', () => {
    it("joins the user's own room on connect", async () => {
      const { socket } = await ctx.connect('s1', 'u1');

      expect(ctx.roomsOf(socket)).toEqual(['user:u1']);
    });

    it('joins nothing and schedules no re-auth for a socket without a user id', async () => {
      const { socket } = ctx.makeSocket('s1');

      await ctx.gateway.handleConnection(socket);
      await vi.advanceTimersByTimeAsync(REAUTH_INTERVAL_MS);

      expect(ctx.roomsOf(socket)).toEqual([]);
      expect(ctx.findUser).not.toHaveBeenCalled();
    });

    it('keeps a still-valid session connected across re-auth ticks', async () => {
      const { disconnect } = await ctx.connect('s1', 'u1');

      await vi.advanceTimersByTimeAsync(2 * REAUTH_INTERVAL_MS);

      expect(ctx.findUser).toHaveBeenCalledTimes(3); // handshake + two re-checks
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a socket whose user was banned after it connected', async () => {
      const { disconnect } = await ctx.connect('s1', 'u1');
      ctx.users.get('u1')!.bannedAt = NOW;

      await vi.advanceTimersByTimeAsync(REAUTH_INTERVAL_MS - 1);
      expect(disconnect).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(disconnect).toHaveBeenCalledWith(true);
    });

    it('treats a failed re-check as inconclusive, and still checks on the next tick', async () => {
      const { disconnect } = await ctx.connect('s1', 'u1');
      ctx.findUser.mockRejectedValueOnce(new Error('db down'));

      await vi.advanceTimersByTimeAsync(REAUTH_INTERVAL_MS);
      expect(disconnect).not.toHaveBeenCalled();

      ctx.users.get('u1')!.bannedAt = NOW;
      await vi.advanceTimersByTimeAsync(REAUTH_INTERVAL_MS);
      expect(disconnect).toHaveBeenCalledWith(true);
    });

    it('does not start another re-check while the previous one is still pending', async () => {
      await ctx.connect('s1', 'u1');
      ctx.findUser.mockClear();
      ctx.findUser.mockImplementationOnce(() => new Promise(() => undefined));

      await vi.advanceTimersByTimeAsync(3 * REAUTH_INTERVAL_MS);

      expect(ctx.findUser).toHaveBeenCalledTimes(1);
    });

    it('stops re-checking a socket once it has disconnected', async () => {
      const { socket } = await ctx.connect('s1', 'u1');
      ctx.findUser.mockClear();

      ctx.gateway.handleDisconnect(socket);
      await vi.advanceTimersByTimeAsync(2 * REAUTH_INTERVAL_MS);

      expect(ctx.findUser).not.toHaveBeenCalled();
    });
  });

  describe('widget:subscribe / widget:unsubscribe', () => {
    it('joins the instance room and starts fetching with the stored config on the first subscriber', async () => {
      const { socket } = await ctx.connect('s1', 'u1');
      ctx.addInstance('w1', 'u1', { params: { label: 'x' }, refreshRate: 5 });

      expect(await ctx.gateway.handleSubscribe(socket, { instanceId: 'w1' })).toEqual({ ok: true });
      expect(ctx.roomsOf(socket)).toContain('instance:w1');

      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(ctx.fetch.mock.calls).toEqual([[ctx.def, { label: 'x' }, 'u1']]);

      await vi.advanceTimersByTimeAsync(4 * TICK_MS);
      expect(ctx.fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(ctx.fetch).toHaveBeenCalledTimes(2);
    });

    it("rejects another user's instance: no room join, no fetch", async () => {
      const { socket } = await ctx.connect('s1', 'u1');
      ctx.addInstance('w2', 'u2');

      expect(await ctx.gateway.handleSubscribe(socket, { instanceId: 'w2' })).toEqual({ ok: false });

      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(ctx.roomsOf(socket)).toEqual(['user:u1']);
      expect(ctx.fetch).not.toHaveBeenCalled();
    });

    it('answers an unknown instance exactly like a not-owned one', async () => {
      const { socket } = await ctx.connect('s1', 'u1');

      expect(await ctx.gateway.handleSubscribe(socket, { instanceId: 'missing' })).toEqual({ ok: false });
      expect(ctx.roomsOf(socket)).toEqual(['user:u1']);
    });

    it('rejects a subscribe from a socket with no user id, even for an existing instance', async () => {
      const { socket } = ctx.makeSocket('s1');
      ctx.addInstance('w1', 'u1');

      expect(await ctx.gateway.handleSubscribe(socket, { instanceId: 'w1' })).toEqual({ ok: false });
      expect(ctx.roomsOf(socket)).toEqual([]);
    });

    it.each([
      ['an empty instanceId', { instanceId: '' }],
      ['no body', undefined],
    ])('rejects subscribe and unsubscribe with %s', async (_label, body) => {
      const { socket } = await ctx.connect('s1', 'u1');
      const payload = body as { instanceId: string };

      expect(await ctx.gateway.handleSubscribe(socket, payload)).toEqual({ ok: false });
      expect(await ctx.gateway.handleUnsubscribe(socket, payload)).toEqual({ ok: false });
      expect(ctx.roomsOf(socket)).toEqual(['user:u1']);
    });

    it('keeps fetching while one of two subscribers remains, and stops when the last one unsubscribes', async () => {
      const a = await ctx.connect('s1', 'u1');
      const b = await ctx.connect('s2', 'u1');
      ctx.addInstance('w1', 'u1', { refreshRate: 1 });
      await ctx.gateway.handleSubscribe(a.socket, { instanceId: 'w1' });
      await ctx.gateway.handleSubscribe(b.socket, { instanceId: 'w1' });
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(ctx.fetch).toHaveBeenCalledTimes(1);

      expect(await ctx.gateway.handleUnsubscribe(a.socket, { instanceId: 'w1' })).toEqual({ ok: true });
      expect(ctx.roomsOf(a.socket)).toEqual(['user:u1']);
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(ctx.fetch).toHaveBeenCalledTimes(2);

      await ctx.gateway.handleUnsubscribe(b.socket, { instanceId: 'w1' });
      await vi.advanceTimersByTimeAsync(3 * TICK_MS);
      expect(ctx.fetch).toHaveBeenCalledTimes(2);
    });

    it('stops fetching when the last subscriber disconnects without unsubscribing', async () => {
      const { socket } = await ctx.connect('s1', 'u1');
      ctx.addInstance('w1', 'u1', { refreshRate: 1 });
      await ctx.gateway.handleSubscribe(socket, { instanceId: 'w1' });
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(ctx.fetch).toHaveBeenCalledTimes(1);

      socket.disconnect(true);
      await vi.advanceTimersByTimeAsync(3 * TICK_MS);

      expect(ctx.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('emissions', () => {
    it('delivers widget:data only to sockets subscribed to that instance', async () => {
      const a = await ctx.connect('s1', 'u1');
      const b = await ctx.connect('s2', 'u2');
      const idle = await ctx.connect('s3', 'u1');
      ctx.addInstance('w1', 'u1');
      ctx.addInstance('w2', 'u2');
      await ctx.gateway.handleSubscribe(a.socket, { instanceId: 'w1' });
      await ctx.gateway.handleSubscribe(b.socket, { instanceId: 'w2' });

      await vi.advanceTimersByTimeAsync(TICK_MS);

      const fetchedAt = new Date(NOW.getTime() + TICK_MS).toISOString();
      expect(a.received).toStrictEqual([['widget:data', { instanceId: 'w1', data: { echoed: 'w1' }, fetchedAt }]]);
      expect(b.received).toStrictEqual([['widget:data', { instanceId: 'w2', data: { echoed: 'w2' }, fetchedAt }]]);
      expect(idle.received).toEqual([]);
    });

    it('delivers a retryable widget:error with retryAt to the subscribed room only', async () => {
      const a = await ctx.connect('s1', 'u1');
      const other = await ctx.connect('s2', 'u2');
      ctx.addInstance('w1', 'u1', { refreshRate: 5 });
      ctx.fetch.mockRejectedValue(new FetchError('RATE_LIMITED', 'slow down'));
      await ctx.gateway.handleSubscribe(a.socket, { instanceId: 'w1' });

      await vi.advanceTimersByTimeAsync(TICK_MS);

      // First failure backs off refreshRate * 2^1 = 10s from the failing tick.
      const retryAt = new Date(NOW.getTime() + TICK_MS + 10_000).toISOString();
      expect(a.received).toStrictEqual([
        ['widget:error', { instanceId: 'w1', code: 'RATE_LIMITED', message: 'slow down', retryAt }],
      ]);
      expect(other.received).toEqual([]);
    });

    it('delivers a terminal widget:error without retryAt', async () => {
      const a = await ctx.connect('s1', 'u1');
      ctx.addInstance('w1', 'u1');
      ctx.fetch.mockRejectedValue(new FetchError('NOT_CONNECTED', 'connect first'));
      await ctx.gateway.handleSubscribe(a.socket, { instanceId: 'w1' });

      await vi.advanceTimersByTimeAsync(TICK_MS);

      expect(a.received).toStrictEqual([['widget:error', { instanceId: 'w1', code: 'NOT_CONNECTED', message: 'connect first' }]]);
    });

    it('reports a non-FetchError failure as UPSTREAM_ERROR', async () => {
      const a = await ctx.connect('s1', 'u1');
      ctx.addInstance('w1', 'u1');
      ctx.fetch.mockRejectedValue(new Error('socket hang up'));
      await ctx.gateway.handleSubscribe(a.socket, { instanceId: 'w1' });

      await vi.advanceTimersByTimeAsync(TICK_MS);

      expect(a.received).toEqual([
        ['widget:error', expect.objectContaining({ instanceId: 'w1', code: 'UPSTREAM_ERROR', message: 'socket hang up' })],
      ]);
    });
  });

  describe('disconnectUser (admin ban / role change / delete)', () => {
    it("closes every socket of that user and leaves other users' sockets alone", async () => {
      const first = await ctx.connect('s1', 'u1');
      const second = await ctx.connect('s2', 'u1');
      const bystander = await ctx.connect('s3', 'u2');
      const disconnector: UserSocketDisconnector = ctx.gateway;

      disconnector.disconnectUser('u1');

      expect(first.disconnect).toHaveBeenCalledWith(true);
      expect(second.disconnect).toHaveBeenCalledWith(true);
      expect(bystander.disconnect).not.toHaveBeenCalled();
    });

    it('stops the widget timers the disconnected user was the last subscriber of', async () => {
      const { socket } = await ctx.connect('s1', 'u1');
      ctx.addInstance('w1', 'u1', { refreshRate: 1 });
      await ctx.gateway.handleSubscribe(socket, { instanceId: 'w1' });

      ctx.gateway.disconnectUser('u1');
      await vi.advanceTimersByTimeAsync(3 * TICK_MS);

      expect(ctx.fetch).not.toHaveBeenCalled();
    });

    it('is a no-op before the Socket.IO server exists', () => {
      const gateway = new RealtimeGateway(ctx.jwt, {} as PrismaService, {} as TokenRevocationService, ctx.timer, {} as InstanceLookupService);

      expect(() => gateway.disconnectUser('u1')).not.toThrow();
    });
  });
});
