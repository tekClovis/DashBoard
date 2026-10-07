// Dashboard + WidgetInstance CRUD — see docs/Architecture.md §4, §8 and
// features/dashboards-api/spec.md.
//
// Every lookup by {id} is scoped by userId in the query itself (a WidgetInstance has no userId
// column, so it's scoped through its `dashboard` relation), so an instance or dashboard owned by
// someone else is a 404, not a 403 — see docs/Architecture.md §8 and §10.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DashboardEntry, LayoutUpdateEntry, ParamSpec, WidgetInstanceEntry } from '@dashboard/shared';
import { validateParams, type ValidatedParams } from '../catalog/param-validator.js';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import type { Prisma, WidgetInstance } from '../generated/prisma/client.js';
import { DashboardEventsService } from './dashboard-events.js';

/** Upper bound, in seconds, of a widget instance's refreshRate. */
export const MAX_REFRESH_SEC = 86400;
export const DEFAULT_DASHBOARD_NAME = 'My Dashboard';
export const DEFAULT_DASHBOARD_POSITION = 0;

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: WidgetRegistryService,
    private readonly events: DashboardEventsService,
  ) {}

  /** The user's dashboards ordered by position. */
  async list(userId: string): Promise<DashboardEntry[]> {
    const rows = await this.prisma.dashboard.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
    });
    return rows.map(toDashboardEntry);
  }

  /**
   * Create a dashboard appended after the user's last one.
   * @param db - Lets a caller (share accept) run the create inside its own transaction.
   */
  async create(
    userId: string,
    name: string,
    db: Pick<Prisma.TransactionClient, 'dashboard'> = this.prisma,
  ): Promise<DashboardEntry> {
    const last = await db.dashboard.findFirst({
      where: { userId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const dashboard = await db.dashboard.create({
      data: { userId, name, position: last ? last.position + 1 : 0 },
    });
    return toDashboardEntry(dashboard);
  }

  /**
   * Create the default dashboard ({@link DEFAULT_DASHBOARD_NAME}) for a user.
   *
   * Not called by signup: AuthController.register creates the default row inside its
   * User-creating transaction so both rows are atomic. This is for callers without that requirement.
   */
  async createDefault(userId: string): Promise<DashboardEntry> {
    const dashboard = await this.prisma.dashboard.create({
      data: { userId, name: DEFAULT_DASHBOARD_NAME, position: DEFAULT_DASHBOARD_POSITION },
    });
    return toDashboardEntry(dashboard);
  }

  /** @throws {@link NotFoundException} when the dashboard isn't owned by `userId`. */
  async update(userId: string, id: string, data: { name?: string; position?: number }): Promise<DashboardEntry> {
    const existing = await this.prisma.dashboard.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException();

    const dashboard = await this.prisma.dashboard.update({ where: { id }, data });
    return toDashboardEntry(dashboard);
  }

  /** @throws {@link NotFoundException} when the dashboard isn't owned by `userId`. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.dashboard.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException();
  }

  /** @throws {@link NotFoundException} when the dashboard isn't owned by `userId`. */
  async listWidgets(userId: string, dashboardId: string): Promise<WidgetInstanceEntry[]> {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, userId },
      include: { widgets: true },
    });
    if (!dashboard) throw new NotFoundException();
    return dashboard.widgets.map(toWidgetInstanceEntry);
  }

  /**
   * Validate and create a widget instance on a dashboard, then emit `instance.created`.
   * @throws {@link NotFoundException} when the dashboard isn't owned by `userId`.
   * @throws {@link BadRequestException} with `UNKNOWN_WIDGET`, `INVALID_PARAMS` or `INVALID_REFRESH_RATE`.
   */
  async addWidgetInstance(
    userId: string,
    dashboardId: string,
    body: {
      service: string;
      widget: string;
      params: Record<string, unknown>;
      refreshRate: number;
      x: number;
      y: number;
      w: number;
      h: number;
    },
  ): Promise<WidgetInstanceEntry> {
    const dashboard = await this.prisma.dashboard.findFirst({ where: { id: dashboardId, userId } });
    if (!dashboard) throw new NotFoundException();

    const def = this.registry.get(body.service, body.widget);
    if (!def) throw new BadRequestException({ error: 'UNKNOWN_WIDGET' });

    const params = this.validateParamsOrThrow(def.params, body.params);
    this.validateRefreshRateOrThrow(def.minRefreshSec, body.refreshRate);

    const instance = await this.prisma.widgetInstance.create({
      data: {
        dashboardId,
        service: body.service,
        widget: body.widget,
        params,
        refreshRate: body.refreshRate,
        x: body.x,
        y: body.y,
        w: body.w,
        h: body.h,
      },
    });

    const entry = toWidgetInstanceEntry(instance);
    this.events.emitEvent({ type: 'instance.created', instance: entry });
    return entry;
  }

  /**
   * Change an instance's params and/or refreshRate (each only if given), then emit `instance.updated`.
   * @throws {@link NotFoundException} when the instance isn't on one of the user's dashboards.
   * @throws {@link BadRequestException} with `UNKNOWN_WIDGET`, `INVALID_PARAMS` or `INVALID_REFRESH_RATE`.
   */
  async updateWidgetInstance(
    userId: string,
    instanceId: string,
    body: { params?: Record<string, unknown>; refreshRate?: number },
  ): Promise<WidgetInstanceEntry> {
    const existing = await this.prisma.widgetInstance.findFirst({
      where: { id: instanceId, dashboard: { userId } },
    });
    if (!existing) throw new NotFoundException();

    const def = this.registry.get(existing.service, existing.widget);
    if (!def) throw new BadRequestException({ error: 'UNKNOWN_WIDGET' });

    const params = body.params !== undefined ? this.validateParamsOrThrow(def.params, body.params) : undefined;
    if (body.refreshRate !== undefined) {
      this.validateRefreshRateOrThrow(def.minRefreshSec, body.refreshRate);
    }

    const instance = await this.prisma.widgetInstance.update({
      where: { id: instanceId },
      data: {
        ...(params !== undefined ? { params } : {}),
        ...(body.refreshRate !== undefined ? { refreshRate: body.refreshRate } : {}),
      },
    });

    const entry = toWidgetInstanceEntry(instance);
    this.events.emitEvent({ type: 'instance.updated', instance: entry });
    return entry;
  }

  /**
   * Delete an instance and emit `instance.deleted`.
   * @throws {@link NotFoundException} when the instance isn't on one of the user's dashboards.
   */
  async removeWidgetInstance(userId: string, instanceId: string): Promise<void> {
    const { count } = await this.prisma.widgetInstance.deleteMany({
      where: { id: instanceId, dashboard: { userId } },
    });
    if (count === 0) throw new NotFoundException();
    this.events.emitEvent({ type: 'instance.deleted', instanceId });
  }

  /** Whole batch fails (nothing applied) if any entry doesn't belong to this dashboard and user. */
  async updateLayout(
    userId: string,
    dashboardId: string,
    entries: LayoutUpdateEntry[],
  ): Promise<WidgetInstanceEntry[]> {
    return this.prisma.$transaction(async (tx) => {
      const dashboard = await tx.dashboard.findFirst({ where: { id: dashboardId, userId } });
      if (!dashboard) throw new NotFoundException();

      const ids = entries.map((entry) => entry.id);
      const owned = await tx.widgetInstance.count({ where: { id: { in: ids }, dashboardId } });
      if (owned !== ids.length) throw new NotFoundException();

      const updated = await Promise.all(
        entries.map((entry) =>
          tx.widgetInstance.update({
            where: { id: entry.id },
            data: { x: entry.x, y: entry.y, w: entry.w, h: entry.h },
          }),
        ),
      );
      return updated.map(toWidgetInstanceEntry);
    });
  }

  private validateParamsOrThrow(specs: ParamSpec[], raw: Record<string, unknown>): ValidatedParams {
    const result = validateParams(specs, raw);
    if (!result.ok) {
      throw new BadRequestException({
        error: 'INVALID_PARAMS',
        param: result.error.param,
        message: result.error.message,
      });
    }
    return result.params;
  }

  private validateRefreshRateOrThrow(minRefreshSec: number, refreshRate: number): void {
    if (refreshRate < minRefreshSec || refreshRate > MAX_REFRESH_SEC) {
      throw new BadRequestException({
        error: 'INVALID_REFRESH_RATE',
        message: `refreshRate must be between ${minRefreshSec} and ${MAX_REFRESH_SEC}`,
      });
    }
  }
}

function toDashboardEntry(dashboard: { id: string; name: string; position: number }): DashboardEntry {
  return { id: dashboard.id, name: dashboard.name, position: dashboard.position };
}

function toWidgetInstanceEntry(instance: WidgetInstance): WidgetInstanceEntry {
  return {
    id: instance.id,
    dashboardId: instance.dashboardId,
    service: instance.service,
    widget: instance.widget,
    params: instance.params as Record<string, string | number>,
    refreshRate: instance.refreshRate,
    x: instance.x,
    y: instance.y,
    w: instance.w,
    h: instance.h,
  };
}
