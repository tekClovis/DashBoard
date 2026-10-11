import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { WidgetDefinition } from '../catalog/widget-definition.js';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { FetchError } from './fetch-error.js';
import type { FetchService } from './fetch.service.js';
import { makeWidgetDefinition } from './test-helpers.js';
import { DashboardEventsService } from '../dashboards/dashboard-events.js';
import { TimerService } from './timer.service.js';

const FETCHED_AT = '2026-01-01T00:00:00.000Z';
const result = (data: unknown, fetchedAt = FETCHED_AT) => ({ data, fetchedAt });

function makeEntry(id: string, params: Record<string, string | number>, refreshRate = 5) {
  return { id, dashboardId: 'd1', service: 'fake', widget: 'echo', params, refreshRate, x: 0, y: 0, w: 1, h: 1 };
}

function makeDef(overrides: Partial<WidgetDefinition<never>> = {}): WidgetDefinition<never> {
  return makeWidgetDefinition({ minRefreshSec: 1, ...overrides });
}

function makeServer(): {
  server: Server;
  emit: ReturnType<typeof vi.fn>;
  rooms: string[];
  socketsLeave: ReturnType<typeof vi.fn>;
} {
  const emit = vi.fn();
  const socketsLeave = vi.fn();
  const rooms: string[] = [];
  const server = {
    to: (room: string) => {
      rooms.push(room);
      return { emit };
    },
    in: (room: string) => ({ socketsLeave: (target: string) => socketsLeave(room, target) }),
  } as unknown as Server;
  return { server, emit, rooms, socketsLeave };
}

describe('TimerService', () => {
  let registry: WidgetRegistryService;
  let prisma: PrismaService;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new WidgetRegistryService();
    registry.registerService({ name: 'fake', connection: 'none' });
    prisma = { serviceConnection: { updateMany: vi.fn() } } as unknown as PrismaService;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function activateWith(fetchService: FetchService, def: WidgetDefinition<never>) {
    registry.register(def);
    const events = new DashboardEventsService();
    const timer = new TimerService(registry, fetchService, prisma, events);
    timer.onModuleInit();
    const { server, emit, rooms, socketsLeave } = makeServer();
    timer.setServer(server);
    timer.activate({ id: 'w1', service: 'fake', widget: 'echo', params: { label: 'x' }, refreshRate: 5, userId: 'u1' });
    return { timer, emit, events, rooms, socketsLeave };
  }

  it('emits widget:data to room instance:{id} on a successful due tick', async () => {
    const def = makeDef();
    const fetchService = { get: vi.fn(async () => result({ ok: true })) } as unknown as FetchService;
    const { timer, emit } = activateWith(fetchService, def);

    await vi.advanceTimersByTimeAsync(1000);

    expect(emit).toHaveBeenCalledWith('widget:data', expect.objectContaining({ instanceId: 'w1', data: { ok: true } }));
    timer.onModuleDestroy();
  });

  it('does not activate a second time for an already-active instance (no schedule reset)', async () => {
    const def = makeDef();
    const fetchService = { get: vi.fn(async () => result({ ok: true })) } as unknown as FetchService;
    const { timer } = activateWith(fetchService, def);

    await vi.advanceTimersByTimeAsync(1000); // first fetch fires, nextDueAt pushed ~5s out
    (fetchService.get as ReturnType<typeof vi.fn>).mockClear();

    timer.activate({ id: 'w1', service: 'fake', widget: 'echo', params: { label: 'x' }, refreshRate: 5, userId: 'u1' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchService.get).not.toHaveBeenCalled();
    timer.onModuleDestroy();
  });

  it('on RATE_LIMITED, emits widget:error with retryAt and backs off exponentially, capped at 15 min', async () => {
    const def = makeDef();
    const fetchService = {
      get: vi.fn(async () => {
        throw new FetchError('RATE_LIMITED', 'slow down');
      }),
    } as unknown as FetchService;
    const { timer, emit } = activateWith(fetchService, def);

    await vi.advanceTimersByTimeAsync(1000);
    expect(emit).toHaveBeenCalledWith(
      'widget:error',
      expect.objectContaining({ instanceId: 'w1', code: 'RATE_LIMITED', retryAt: expect.any(String) }),
    );

    // failures=1 -> backoff = refreshRate(5s) * 2^1 = 10s; advance past it for a 2nd failure.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchService.get).toHaveBeenCalledTimes(2);

    // Advance far enough that an uncapped backoff would exceed 15 min, and confirm it keeps firing
    // (i.e. it's capped rather than growing unbounded forever).
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect((fetchService.get as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(2);
    timer.onModuleDestroy();
  });

  it('on NOT_CONNECTED, emits widget:error once and deactivates (no further fetches)', async () => {
    const def = makeDef();
    const fetchService = {
      get: vi.fn(async () => {
        throw new FetchError('NOT_CONNECTED', 'no connection');
      }),
    } as unknown as FetchService;
    const { timer, emit } = activateWith(fetchService, def);

    await vi.advanceTimersByTimeAsync(1000);
    expect(emit).toHaveBeenCalledWith('widget:error', expect.objectContaining({ instanceId: 'w1', code: 'NOT_CONNECTED' }));
    expect(emit).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchService.get).toHaveBeenCalledTimes(1);
    timer.onModuleDestroy();
  });

  it('on REAUTH_REQUIRED, still emits widget:error when the status update fails', async () => {
    const def = makeDef();
    const fetchService = {
      get: vi.fn(async () => {
        throw new FetchError('REAUTH_REQUIRED', 'expired');
      }),
    } as unknown as FetchService;
    vi.mocked(prisma.serviceConnection.updateMany).mockRejectedValue(new Error('db down'));
    const { timer, emit } = activateWith(fetchService, def);

    await vi.advanceTimersByTimeAsync(1000);
    expect(emit).toHaveBeenCalledWith('widget:error', expect.objectContaining({ instanceId: 'w1', code: 'REAUTH_REQUIRED' }));
    timer.onModuleDestroy();
  });

  it('deactivate() stops further ticks for that instance', async () => {
    const def = makeDef();
    const fetchService = { get: vi.fn(async () => result({ ok: true })) } as unknown as FetchService;
    const { timer } = activateWith(fetchService, def);

    timer.deactivate('w1');
    await vi.advanceTimersByTimeAsync(2000);

    expect(fetchService.get).not.toHaveBeenCalled();
    timer.onModuleDestroy();
  });
  it('emits the fetch result’s fetchedAt, not the emit time', async () => {
    const def = makeDef();
    const fetchService = { get: vi.fn(async () => result({ ok: true }, '2020-05-05T00:00:00.000Z')) } as unknown as FetchService;
    const { timer, emit } = activateWith(fetchService, def);

    await vi.advanceTimersByTimeAsync(1000);

    expect(emit).toHaveBeenCalledWith(
      'widget:data',
      expect.objectContaining({ instanceId: 'w1', fetchedAt: '2020-05-05T00:00:00.000Z' }),
    );
    timer.onModuleDestroy();
  });

  it('gives two instances of one widget their own params at the same tick', async () => {
    const def = makeDef();
    registry.register(def);
    const fetchService = {
      get: vi.fn(async (_def: unknown, params: { label: string }) => result({ echoed: params.label })),
    } as unknown as FetchService;
    const timer = new TimerService(registry, fetchService, prisma, new DashboardEventsService());
    timer.onModuleInit();
    const { server, emit } = makeServer();
    timer.setServer(server);
    timer.activate({ id: 'a', service: 'fake', widget: 'echo', params: { label: 'A' }, refreshRate: 5, userId: 'u1' });
    timer.activate({ id: 'b', service: 'fake', widget: 'echo', params: { label: 'B' }, refreshRate: 5, userId: 'u1' });

    await vi.advanceTimersByTimeAsync(1000);

    expect(emit).toHaveBeenCalledWith('widget:data', expect.objectContaining({ instanceId: 'a', data: { echoed: 'A' } }));
    expect(emit).toHaveBeenCalledWith('widget:data', expect.objectContaining({ instanceId: 'b', data: { echoed: 'B' } }));
    timer.onModuleDestroy();
  });

  describe('dashboard events', () => {
    it('instance.updated applies new params and refreshRate to the live entry without a restart', async () => {
      const def = makeDef();
      const fetchService = {
        get: vi.fn(async (_def: unknown, params: { label: string }) => result({ echoed: params.label })),
      } as unknown as FetchService;
      const { timer, emit, events } = activateWith(fetchService, def);
      await vi.advanceTimersByTimeAsync(1000); // first fetch, next due in 5s
      expect(fetchService.get).toHaveBeenCalledTimes(1);

      events.emitEvent({ type: 'instance.updated', instance: makeEntry('w1', { label: 'y' }, 2) });
      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchService.get).toHaveBeenCalledTimes(2);
      expect(fetchService.get).toHaveBeenLastCalledWith(def, { label: 'y' }, 'u1');
      expect(emit).toHaveBeenLastCalledWith('widget:data', expect.objectContaining({ data: { echoed: 'y' } }));

      await vi.advanceTimersByTimeAsync(2000); // new 2s interval, not the old 5s
      expect(fetchService.get).toHaveBeenCalledTimes(3);
      timer.onModuleDestroy();
    });

    it('instance.updated for an instance that is not active is a no-op', async () => {
      const def = makeDef();
      const fetchService = { get: vi.fn(async () => result({ ok: true })) } as unknown as FetchService;
      const { timer, events } = activateWith(fetchService, def);

      events.emitEvent({ type: 'instance.updated', instance: makeEntry('other', { label: 'y' }) });
      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchService.get).toHaveBeenCalledTimes(1);
      expect(fetchService.get).toHaveBeenCalledWith(def, { label: 'x' }, 'u1');
      timer.onModuleDestroy();
    });

    it('instance.deleted deactivates the entry and makes every socket leave its room', async () => {
      const def = makeDef();
      const fetchService = { get: vi.fn(async () => result({ ok: true })) } as unknown as FetchService;
      const { timer, events, socketsLeave } = activateWith(fetchService, def);

      events.emitEvent({ type: 'instance.deleted', instanceId: 'w1' });
      await vi.advanceTimersByTimeAsync(2000);

      expect(socketsLeave).toHaveBeenCalledWith('instance:w1', 'instance:w1');
      expect(fetchService.get).not.toHaveBeenCalled();
      timer.onModuleDestroy();
    });

    it('a fetch already in flight when the instance is deleted emits nothing', async () => {
      const def = makeDef();
      let resolveFetch!: (v: ReturnType<typeof result>) => void;
      const fetchService = {
        get: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
      } as unknown as FetchService;
      const { timer, emit, events } = activateWith(fetchService, def);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchService.get).toHaveBeenCalledTimes(1);

      events.emitEvent({ type: 'instance.deleted', instanceId: 'w1' });
      resolveFetch(result({ stale: true }));
      await vi.advanceTimersByTimeAsync(0);

      expect(emit).not.toHaveBeenCalled();
      timer.onModuleDestroy();
    });

    it('a fetch in flight for the old entry is dropped after reconfigure, even if the id is active again', async () => {
      const def = makeDef();
      const resolvers: Array<(v: ReturnType<typeof result>) => void> = [];
      const fetchService = {
        get: vi.fn(() => new Promise((resolve) => resolvers.push(resolve))),
      } as unknown as FetchService;
      const { timer, emit, events } = activateWith(fetchService, def);
      await vi.advanceTimersByTimeAsync(1000); // old entry in flight

      events.emitEvent({ type: 'instance.updated', instance: makeEntry('w1', { label: 'y' }) });
      resolvers[0](result({ stale: true }));
      await vi.advanceTimersByTimeAsync(0);
      expect(emit).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000); // new entry fetches with the new params
      expect(fetchService.get).toHaveBeenLastCalledWith(def, { label: 'y' }, 'u1');
      resolvers[1](result({ fresh: true }));
      await vi.advanceTimersByTimeAsync(0);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('widget:data', expect.objectContaining({ data: { fresh: true } }));
      timer.onModuleDestroy();
    });

    it('stops listening to dashboard events once destroyed', async () => {
      const def = makeDef();
      const fetchService = { get: vi.fn(async () => result({ ok: true })) } as unknown as FetchService;
      const { timer, events } = activateWith(fetchService, def);

      timer.onModuleDestroy();

      expect(events.listenerCount('instance.updated')).toBe(0);
      expect(events.listenerCount('instance.deleted')).toBe(0);
    });
  });
});
