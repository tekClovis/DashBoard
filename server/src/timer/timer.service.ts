// The Timer — see docs/Architecture.md §6.

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { WidgetErrorCode } from '@dashboard/shared';
import type { Server } from 'socket.io';
import type { Params, WidgetDefinition } from '../catalog/widget-definition.js';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { FetchError } from './fetch-error.js';
import { FetchService } from './fetch.service.js';

const TICK_MS = 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

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

@Injectable()
export class TimerService implements OnModuleInit, OnModuleDestroy {
  private readonly active = new Map<string, TimerEntry>();
  private server?: Server;
  private tickHandle?: NodeJS.Timeout;

  constructor(
    private readonly registry: WidgetRegistryService,
    private readonly fetchService: FetchService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.tickHandle = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.tickHandle);
  }

  /** Set once by RealtimeGateway.afterInit; emits are no-ops before that (nothing is subscribed yet anyway). */
  setServer(server: Server): void {
    this.server = server;
  }

  /** Adds the instance to the active set on its first subscriber. A no-op if already active. */
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

  deactivate(instanceId: string): void {
    this.active.delete(instanceId);
  }

  /**
   * Extension point for dashboards-api's instance PATCH (not merged on this branch yet —
   * see the spec's Constraints): updates params/refreshRate and makes the new config due
   * immediately. DELETE goes through deactivate().
   */
  reconfigure(instanceId: string, updates: { params?: Params; refreshRate?: number }): void {
    const entry = this.active.get(instanceId);
    if (!entry) return;
    if (updates.params) entry.params = updates.params;
    if (updates.refreshRate !== undefined) entry.refreshRate = updates.refreshRate;
    entry.nextDueAt = Date.now();
    entry.failures = 0;
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
      const data = await this.fetchService.get(entry.def, entry.params, entry.userId);
      // The entry may have been deactivated (unsubscribed) while the fetch was in flight.
      if (!this.active.has(instanceId)) return;
      entry.failures = 0;
      entry.inFlight = false;
      entry.nextDueAt = Date.now() + entry.refreshRate * 1000;
      this.emitData(instanceId, data);
    } catch (err) {
      if (!this.active.has(instanceId)) return;
      entry.inFlight = false;
      await this.handleFailure(instanceId, entry, err);
    }
  }

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
      await this.prisma.serviceConnection.updateMany({
        where: { userId: entry.userId, service: entry.def.service },
        data: { status: 'REAUTH' },
      });
    }
    this.emitError(instanceId, code, message);
  }

  private emitData(instanceId: string, data: unknown): void {
    this.server?.to(`instance:${instanceId}`).emit('widget:data', {
      instanceId,
      data,
      fetchedAt: new Date().toISOString(),
    });
  }

  private emitError(instanceId: string, code: WidgetErrorCode, message: string, retryAt?: Date): void {
    this.server?.to(`instance:${instanceId}`).emit('widget:error', {
      instanceId,
      code,
      message,
      ...(retryAt ? { retryAt: retryAt.toISOString() } : {}),
    });
  }
}
