// The Timer — see docs/Architecture.md §6.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { WidgetErrorCode } from '@dashboard/shared';
import type { Server } from 'socket.io';
import type { Params, WidgetDefinition } from '../catalog/widget-definition.js';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { DashboardEventsService, type DashboardEvent } from '../dashboards/dashboard-events.js';
import { FetchError } from './fetch-error.js';
import { FetchService } from './fetch.service.js';

const TICK_MS = 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const INSTANCE_ROOM_PREFIX = 'instance:';

/** Codes that back off and retry, vs. deactivate with no retry — see Architecture §6's table. */
const RETRYABLE_CODES: ReadonlySet<WidgetErrorCode> = new Set(['RATE_LIMITED', 'UPSTREAM_ERROR']);

export interface ActivateRequest {
  id: string;
  service: string;
  widget: string;
  params: Params;
  refreshRate: number;
  userId: string;
}

interface TimerEntry {
  def: WidgetDefinition;
  params: Params;
  userId: string;
  refreshRate: number;
  nextDueAt: number;
  failures: number;
  inFlight: boolean;
}

/** Ticks every second and fetches each active widget instance when due, emitting `widget:data` / `widget:error` to its room. */
@Injectable()
export class TimerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimerService.name);
  private readonly active = new Map<string, TimerEntry>();
  private server?: Server;
  private tickHandle?: NodeJS.Timeout;

  constructor(
    private readonly registry: WidgetRegistryService,
    private readonly fetchService: FetchService,
    private readonly prisma: PrismaService,
    private readonly events: DashboardEventsService,
  ) {}

  onModuleInit(): void {
    this.tickHandle = setInterval(() => void this.tick(), TICK_MS);
    this.events.on('instance.updated', this.onInstanceUpdated);
    this.events.on('instance.deleted', this.onInstanceDeleted);
  }

  onModuleDestroy(): void {
    clearInterval(this.tickHandle);
    this.events.off('instance.updated', this.onInstanceUpdated);
    this.events.off('instance.deleted', this.onInstanceDeleted);
  }

  private readonly onInstanceUpdated = (event: Extract<DashboardEvent, { type: 'instance.updated' }>): void => {
    const { id, params, refreshRate } = event.instance;
    this.reconfigure(id, { params, refreshRate });
  };

  /** Deactivates the entry and empties its room, so no socket stays subscribed to a removed instance. */
  private readonly onInstanceDeleted = (event: Extract<DashboardEvent, { type: 'instance.deleted' }>): void => {
    this.deactivate(event.instanceId);
    const room = INSTANCE_ROOM_PREFIX + event.instanceId;
    this.server?.in(room).socketsLeave(room);
  };

  /** Set once by RealtimeGateway.afterInit; emits are no-ops before that (nothing is subscribed yet anyway). */
  setServer(server: Server): void {
    this.server = server;
  }

  /** Adds the instance to the active set, due immediately. A no-op if already active or if the widget is not in the registry. */
  activate(instance: ActivateRequest): void {
    if (this.active.has(instance.id)) return;

    const def = this.registry.get(instance.service, instance.widget);
    if (!def) return;

    this.active.set(instance.id, {
      def,
      params: instance.params,
      userId: instance.userId,
      refreshRate: instance.refreshRate,
      nextDueAt: Date.now(),
      failures: 0,
      inFlight: false,
    });
  }

  /** Remove the instance from the active set; a no-op if absent. */
  deactivate(instanceId: string): void {
    this.active.delete(instanceId);
  }

  /**
   * Applies new params/refreshRate to the live entry and makes it due immediately; a no-op if absent.
   * The entry is replaced, not mutated, so a fetch still in flight for the old config is dropped by `run`'s identity check.
   */
  reconfigure(instanceId: string, updates: { params?: Params; refreshRate?: number }): void {
    const entry = this.active.get(instanceId);
    if (!entry) return;
    this.active.set(instanceId, {
      ...entry,
      params: updates.params ?? entry.params,
      refreshRate: updates.refreshRate ?? entry.refreshRate,
      nextDueAt: Date.now(),
      failures: 0,
      inFlight: false,
    });
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const [instanceId, entry] of this.active) {
      if (entry.inFlight || entry.nextDueAt > now) continue;
      entry.inFlight = true;
      void this.run(instanceId, entry);
    }
  }

  private async run(instanceId: string, entry: TimerEntry): Promise<void> {
    try {
      const { data, fetchedAt } = await this.fetchService.get(entry.def, entry.params, entry.userId);
      // The entry may have been deactivated, deleted or reconfigured (replaced) while the fetch was in flight.
      if (this.active.get(instanceId) !== entry) return;
      entry.failures = 0;
      entry.inFlight = false;
      entry.nextDueAt = Date.now() + entry.refreshRate * 1000;
      this.emitData(instanceId, data, fetchedAt);
    } catch (err) {
      if (this.active.get(instanceId) !== entry) return;
      entry.inFlight = false;
      await this.handleFailure(instanceId, entry, err);
    }
  }

  /**
   * RATE_LIMITED / UPSTREAM_ERROR back off exponentially (refreshRate * 2^failures, capped at 15 min) and emit `retryAt`;
   * other codes deactivate the entry, and REAUTH_REQUIRED also marks the user's connection REAUTH.
   */
  private async handleFailure(instanceId: string, entry: TimerEntry, err: unknown): Promise<void> {
    const code = err instanceof FetchError ? err.code : 'UPSTREAM_ERROR';
    const message = err instanceof Error ? err.message : 'Unknown fetch error.';

    if (RETRYABLE_CODES.has(code)) {
      entry.failures += 1;
      const backoffMs = Math.min(entry.refreshRate * 1000 * 2 ** entry.failures, MAX_BACKOFF_MS);
      entry.nextDueAt = Date.now() + backoffMs;
      this.emitError(instanceId, code, message, new Date(entry.nextDueAt));
      return;
    }

    // NOT_CONNECTED / REAUTH_REQUIRED / INVALID_PARAMS: no retry until re-subscribed/reconfigured.
    this.active.delete(instanceId);
    if (code === 'REAUTH_REQUIRED') {
      try {
        await this.prisma.serviceConnection.updateMany({
          where: { userId: entry.userId, service: entry.def.service },
          data: { status: 'REAUTH' },
        });
      } catch (dbErr) {
        this.logger.error(`Failed to mark connection REAUTH: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
      }
    }
    this.emitError(instanceId, code, message);
  }

  private emitData(instanceId: string, data: unknown, fetchedAt: string): void {
    this.server?.to(INSTANCE_ROOM_PREFIX + instanceId).emit('widget:data', { instanceId, data, fetchedAt });
  }

  private emitError(instanceId: string, code: WidgetErrorCode, message: string, retryAt?: Date): void {
    this.server?.to(INSTANCE_ROOM_PREFIX + instanceId).emit('widget:error', {
      instanceId,
      code,
      message,
      ...(retryAt ? { retryAt: retryAt.toISOString() } : {}),
    });
  }
}
