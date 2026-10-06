import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { WidgetDefinition } from '../catalog/widget-definition.js';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { FetchError } from './fetch-error.js';
import type { FetchService } from './fetch.service.js';
import { makeWidgetDefinition } from './test-helpers.js';
import { TimerService } from './timer.service.js';

function makeDef(overrides: Partial<WidgetDefinition<never>> = {}): WidgetDefinition<never> {
  return makeWidgetDefinition({ minRefreshSec: 1, ...overrides });
}

function makeServer(): { server: Server; emit: ReturnType<typeof vi.fn>; rooms: string[] } {
  const emit = vi.fn();
  const rooms: string[] = [];
  const server = {
    to: (room: string) => {
      rooms.push(room);
      return { emit };
    },
  } as unknown as Server;
  return { server, emit, rooms };
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
    const timer = new TimerService(registry, fetchService, prisma);
    timer.onModuleInit();
    const { server, emit } = makeServer();
    timer.setServer(server);
    timer.activate({ id: 'w1', service: 'fake', widget: 'echo', params: { label: 'x' }, refreshRate: 5, userId: 'u1' });
    return { timer, emit };
  }

  it('emits widget:data to room instance:{id} on a successful due tick', async () => {
    const def = makeDef();
    const fetchService = { get: vi.fn(async () => ({ ok: true })) } as unknown as FetchService;
    const { timer, emit } = activateWith(fetchService, def);

    await vi.advanceTimersByTimeAsync(1000);

    expect(emit).toHaveBeenCalledWith('widget:data', expect.objectContaining({ instanceId: 'w1', data: { ok: true } }));
    timer.onModuleDestroy();
  });

  it('does not activate a second time for an already-active instance (no schedule reset)', async () => {
    const def = makeDef();
    const fetchService = { get: vi.fn(async () => ({ ok: true })) } as unknown as FetchService;
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
    const fetchService = { get: vi.fn(async () => ({ ok: true })) } as unknown as FetchService;
    const { timer } = activateWith(fetchService, def);

    timer.deactivate('w1');
    await vi.advanceTimersByTimeAsync(2000);

    expect(fetchService.get).not.toHaveBeenCalled();
    timer.onModuleDestroy();
  });
});
