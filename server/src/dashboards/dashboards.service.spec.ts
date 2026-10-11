import type { DashboardEntry, WidgetInstanceEntry } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import { makeWidgetDefinition } from '../timer/test-helpers.js';
import { DashboardEventsService, type DashboardEvent } from './dashboard-events.js';
import {
  DEFAULT_DASHBOARD_NAME,
  DEFAULT_DASHBOARD_POSITION,
  DashboardsService,
  MAX_REFRESH_SEC,
} from './dashboards.service.js';

type DashboardRow = DashboardEntry & { userId: string };
type WidgetRow = WidgetInstanceEntry;

type DashboardWhere = { id?: string; userId?: string };
type WidgetWhere = { id?: string | { in: string[] }; dashboardId?: string; dashboard?: { userId: string } };

/**
 * In-memory stand-in for the slice of PrismaService that DashboardsService uses. It honours the
 * `where` / `orderBy` it is given, so ownership scoping is decided by the query the service builds
 * rather than by a canned return value.
 */
function makeFakePrisma() {
  const dashboards: DashboardRow[] = [];
  const widgets: WidgetRow[] = [];
  const connections: { userId: string; service: string }[] = [];
  let nextId = 1;

  const matchesDashboard = (row: DashboardRow, where: DashboardWhere) =>
    (where.id === undefined || row.id === where.id) && (where.userId === undefined || row.userId === where.userId);

  const matchesWidget = (row: WidgetRow, where: WidgetWhere) => {
    if (typeof where.id === 'string' && row.id !== where.id) return false;
    if (typeof where.id === 'object' && !where.id.in.includes(row.id)) return false;
    if (where.dashboardId !== undefined && row.dashboardId !== where.dashboardId) return false;
    if (where.dashboard !== undefined) {
      const owner = dashboards.find((dashboard) => dashboard.id === row.dashboardId)?.userId;
      if (owner !== where.dashboard.userId) return false;
    }
    return true;
  };

  const sorted = (rows: DashboardRow[], orderBy?: { position: 'asc' | 'desc' }) =>
    orderBy
      ? rows.toSorted((a, b) => (orderBy.position === 'asc' ? a.position - b.position : b.position - a.position))
      : rows;

  const removeWhere = <T>(rows: T[], predicate: (row: T) => boolean): number => {
    const kept = rows.filter((row) => !predicate(row));
    const count = rows.length - kept.length;
    rows.splice(0, rows.length, ...kept);
    return count;
  };

  const prisma = {
    dashboard: {
      findMany: async (args: { where: DashboardWhere; orderBy?: { position: 'asc' | 'desc' } }) =>
        sorted(
          dashboards.filter((row) => matchesDashboard(row, args.where)),
          args.orderBy,
        ),
      findFirst: async (args: {
        where: DashboardWhere;
        orderBy?: { position: 'asc' | 'desc' };
        include?: { widgets: boolean };
      }) => {
        const row = sorted(
          dashboards.filter((candidate) => matchesDashboard(candidate, args.where)),
          args.orderBy,
        )[0];
        if (!row) return null;
        return args.include?.widgets
          ? { ...row, widgets: widgets.filter((widget) => widget.dashboardId === row.id) }
          : row;
      },
      create: async (args: { data: Omit<DashboardRow, 'id'> }) => {
        const row = { id: `d${nextId++}`, ...args.data };
        dashboards.push(row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Partial<DashboardRow> }) => {
        const row = dashboards.find((candidate) => candidate.id === args.where.id);
        if (!row) throw new Error('Record to update not found.');
        Object.assign(row, args.data);
        return row;
      },
      deleteMany: async (args: { where: DashboardWhere }) => ({
        count: removeWhere(dashboards, (row) => matchesDashboard(row, args.where)),
      }),
    },
    widgetInstance: {
      findFirst: async (args: { where: WidgetWhere }) => widgets.find((row) => matchesWidget(row, args.where)) ?? null,
      count: async (args: { where: WidgetWhere }) => widgets.filter((row) => matchesWidget(row, args.where)).length,
      create: async (args: { data: Omit<WidgetRow, 'id'> }) => {
        const row = { id: `w${nextId++}`, ...args.data };
        widgets.push(row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Partial<WidgetRow> }) => {
        const row = widgets.find((candidate) => candidate.id === args.where.id);
        if (!row) throw new Error('Record to update not found.');
        Object.assign(row, args.data);
        return row;
      },
      deleteMany: async (args: { where: WidgetWhere }) => ({
        count: removeWhere(widgets, (row) => matchesWidget(row, args.where)),
      }),
    },
    serviceConnection: {
      findUnique: async (args: { where: { userId_service: { userId: string; service: string } } }) =>
        connections.find(
          (row) =>
            row.userId === args.where.userId_service.userId && row.service === args.where.userId_service.service,
        ) ?? null,
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
  };

  return { prisma, dashboards, widgets, connections };
}

const EVENT_TYPES = ['instance.created', 'instance.updated', 'instance.deleted'] as const;

function makeService() {
  const { prisma, dashboards, widgets, connections } = makeFakePrisma();

  const registry = new WidgetRegistryService();
  registry.registerService({ name: 'fake', connection: 'none' });
  registry.registerService({ name: 'fake-connected', connection: 'oauth' });
  registry.register(
    makeWidgetDefinition({
      params: [
        { name: 'label', type: 'string', required: true },
        { name: 'count', type: 'integer', min: 1, max: 10, default: 5 },
      ],
    }),
  );
  registry.register(makeWidgetDefinition({ service: 'fake-connected', name: 'profile', auth: 'connection' }));

  const events = new DashboardEventsService();
  const emitted: DashboardEvent[] = [];
  for (const type of EVENT_TYPES) {
    events.on(type, (event: DashboardEvent) => emitted.push(event));
  }

  const service = new DashboardsService(prisma as never, registry, events);
  return { service, dashboards, widgets, connections, emitted };
}

function seedDashboard(dashboards: DashboardRow[], overrides: Partial<DashboardRow> = {}): DashboardRow {
  const row = { id: `seed-d${dashboards.length}`, userId: 'u1', name: 'Home', position: 0, ...overrides };
  dashboards.push(row);
  return row;
}

function seedWidget(widgets: WidgetRow[], dashboardId: string, overrides: Partial<WidgetRow> = {}): WidgetRow {
  const row = {
    id: `seed-w${widgets.length}`,
    dashboardId,
    service: 'fake',
    widget: 'echo',
    params: { label: 'hello', count: 5 },
    refreshRate: 120,
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    ...overrides,
  };
  widgets.push(row);
  return row;
}

const validBody = { service: 'fake', widget: 'echo', params: { label: 'hello' }, refreshRate: 120, x: 1, y: 2, w: 3, h: 4 };

describe('DashboardsService', () => {
  describe('list', () => {
    it("returns only the caller's dashboards, ordered by position, without the userId", async () => {
      const { service, dashboards } = makeService();
      seedDashboard(dashboards, { id: 'b', name: 'Second', position: 1 });
      seedDashboard(dashboards, { id: 'a', name: 'First', position: 0 });
      seedDashboard(dashboards, { id: 'x', userId: 'u2', name: 'Theirs', position: 0 });

      expect(await service.list('u1')).toEqual([
        { id: 'a', name: 'First', position: 0 },
        { id: 'b', name: 'Second', position: 1 },
      ]);
    });
  });

  describe('create', () => {
    it("puts a user's first dashboard at position 0", async () => {
      const { service, dashboards } = makeService();
      seedDashboard(dashboards, { userId: 'u2', position: 7 });

      const created = await service.create('u1', 'Work');

      expect(created).toEqual({ id: expect.any(String), name: 'Work', position: 0 });
      expect(dashboards.find((row) => row.id === created.id)?.userId).toBe('u1');
    });

    it("appends after the caller's highest position", async () => {
      const { service, dashboards } = makeService();
      seedDashboard(dashboards, { position: 4 });
      seedDashboard(dashboards, { position: 2 });
      seedDashboard(dashboards, { userId: 'u2', position: 9 });

      expect((await service.create('u1', 'Work')).position).toBe(5);
    });
  });

  describe('createDefault', () => {
    it('creates the default-named dashboard at the default position for the user', async () => {
      const { service, dashboards } = makeService();

      const created = await service.createDefault('u1');

      expect(created).toEqual({
        id: expect.any(String),
        name: DEFAULT_DASHBOARD_NAME,
        position: DEFAULT_DASHBOARD_POSITION,
      });
      expect(dashboards).toEqual([{ ...created, userId: 'u1' }]);
    });
  });

  describe('update', () => {
    it('applies only the supplied fields', async () => {
      const { service, dashboards } = makeService();
      const dashboard = seedDashboard(dashboards, { name: 'Home', position: 3 });

      expect(await service.update('u1', dashboard.id, { name: 'Renamed' })).toEqual({
        id: dashboard.id,
        name: 'Renamed',
        position: 3,
      });
    });

    it('rejects an unknown dashboard with 404', async () => {
      const { service } = makeService();

      await expect(service.update('u1', 'missing', { name: 'Renamed' })).rejects.toMatchObject({ status: 404 });
    });

    it("rejects another user's dashboard with 404 and leaves it untouched", async () => {
      const { service, dashboards } = makeService();
      const theirs = seedDashboard(dashboards, { userId: 'u2', name: 'Theirs' });

      await expect(service.update('u1', theirs.id, { name: 'Hijacked' })).rejects.toMatchObject({ status: 404 });
      expect(theirs.name).toBe('Theirs');
    });
  });

  describe('remove', () => {
    it("deletes the caller's dashboard", async () => {
      const { service, dashboards } = makeService();
      const dashboard = seedDashboard(dashboards);

      await service.remove('u1', dashboard.id);

      expect(dashboards).toEqual([]);
    });

    it('rejects an unknown dashboard with 404', async () => {
      const { service } = makeService();

      await expect(service.remove('u1', 'missing')).rejects.toMatchObject({ status: 404 });
    });

    it("rejects another user's dashboard with 404 and keeps it", async () => {
      const { service, dashboards } = makeService();
      const theirs = seedDashboard(dashboards, { userId: 'u2' });

      await expect(service.remove('u1', theirs.id)).rejects.toMatchObject({ status: 404 });
      expect(dashboards).toEqual([theirs]);
    });
  });

  describe('listWidgets', () => {
    it('returns only the instances of the requested dashboard', async () => {
      const { service, dashboards, widgets } = makeService();
      const dashboard = seedDashboard(dashboards);
      const other = seedDashboard(dashboards, { position: 1 });
      const mine = seedWidget(widgets, dashboard.id);
      seedWidget(widgets, other.id);

      expect(await service.listWidgets('u1', dashboard.id)).toEqual([mine]);
    });

    it('rejects an unknown dashboard with 404', async () => {
      const { service } = makeService();

      await expect(service.listWidgets('u1', 'missing')).rejects.toMatchObject({ status: 404 });
    });

    it("rejects another user's dashboard with 404", async () => {
      const { service, dashboards, widgets } = makeService();
      const theirs = seedDashboard(dashboards, { userId: 'u2' });
      seedWidget(widgets, theirs.id);

      await expect(service.listWidgets('u1', theirs.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('addWidgetInstance', () => {
    it('stores the instance with validated params and emits instance.created', async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);

      const entry = await service.addWidgetInstance('u1', dashboard.id, {
        ...validBody,
        params: { label: 'hello', count: '7', undeclared: 'dropped' },
      });

      expect(entry).toEqual({
        id: expect.any(String),
        dashboardId: dashboard.id,
        service: 'fake',
        widget: 'echo',
        params: { label: 'hello', count: 7 },
        refreshRate: 120,
        x: 1,
        y: 2,
        w: 3,
        h: 4,
      });
      expect(widgets).toEqual([entry]);
      expect(emitted).toEqual([{ type: 'instance.created', instance: entry }]);
    });

    it('fills in param defaults for omitted optional params', async () => {
      const { service, dashboards } = makeService();
      const dashboard = seedDashboard(dashboards);

      const entry = await service.addWidgetInstance('u1', dashboard.id, validBody);

      expect(entry.params).toEqual({ label: 'hello', count: 5 });
    });

    it('rejects an unknown dashboard with 404 and emits nothing', async () => {
      const { service, widgets, emitted } = makeService();

      await expect(service.addWidgetInstance('u1', 'missing', validBody)).rejects.toMatchObject({ status: 404 });
      expect(widgets).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it("rejects another user's dashboard with 404 and emits nothing", async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const theirs = seedDashboard(dashboards, { userId: 'u2' });

      await expect(service.addWidgetInstance('u1', theirs.id, validBody)).rejects.toMatchObject({ status: 404 });
      expect(widgets).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it.each([
      ['unknown service', { service: 'nope', widget: 'echo' }],
      ['unknown widget of a known service', { service: 'fake', widget: 'nope' }],
    ])('rejects an %s with 400 UNKNOWN_WIDGET and emits nothing', async (_label, pair) => {
      const { service, dashboards, widgets, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);

      await expect(service.addWidgetInstance('u1', dashboard.id, { ...validBody, ...pair })).rejects.toMatchObject({
        status: 400,
        response: { error: 'UNKNOWN_WIDGET' },
      });
      expect(widgets).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it.each([
      ['a missing required param', {}, 'label'],
      ['an out-of-range integer', { label: 'hello', count: 11 }, 'count'],
    ])('rejects %s with 400 INVALID_PARAMS naming the param, and emits nothing', async (_label, params, param) => {
      const { service, dashboards, widgets, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);

      await expect(service.addWidgetInstance('u1', dashboard.id, { ...validBody, params })).rejects.toMatchObject({
        status: 400,
        response: { error: 'INVALID_PARAMS', param, message: expect.stringContaining(param) },
      });
      expect(widgets).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it.each([
      ['below the widget minimum', 59],
      ['above the global maximum', MAX_REFRESH_SEC + 1],
    ])('rejects a refreshRate %s with 400 INVALID_REFRESH_RATE and emits nothing', async (_label, refreshRate) => {
      const { service, dashboards, widgets, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);

      await expect(
        service.addWidgetInstance('u1', dashboard.id, { ...validBody, refreshRate }),
      ).rejects.toMatchObject({ status: 400, response: { error: 'INVALID_REFRESH_RATE' } });
      expect(widgets).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it.each([
      ['the widget minimum', 60],
      ['the global maximum', MAX_REFRESH_SEC],
    ])('accepts a refreshRate equal to %s', async (_label, refreshRate) => {
      const { service, dashboards } = makeService();
      const dashboard = seedDashboard(dashboards);

      const entry = await service.addWidgetInstance('u1', dashboard.id, { ...validBody, refreshRate });

      expect(entry.refreshRate).toBe(refreshRate);
    });

    it('rejects a connection-scoped widget with 409 NOT_CONNECTED when the user has no connection', async () => {
      const { service, dashboards, widgets, connections, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);
      connections.push({ userId: 'u2', service: 'fake-connected' });

      await expect(
        service.addWidgetInstance('u1', dashboard.id, { ...validBody, service: 'fake-connected', widget: 'profile' }),
      ).rejects.toMatchObject({ status: 409, response: { error: 'NOT_CONNECTED' } });
      expect(widgets).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it('creates an instance of a connection-scoped widget when the user has a connection', async () => {
      const { service, dashboards, connections, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);
      connections.push({ userId: 'u1', service: 'fake-connected' });

      const entry = await service.addWidgetInstance('u1', dashboard.id, {
        ...validBody,
        service: 'fake-connected',
        widget: 'profile',
      });

      expect(entry).toMatchObject({ service: 'fake-connected', widget: 'profile', dashboardId: dashboard.id });
      expect(emitted).toEqual([{ type: 'instance.created', instance: entry }]);
    });
  });

  describe('updateWidgetInstance', () => {
    it('updates params and refreshRate and emits instance.updated', async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id);

      const entry = await service.updateWidgetInstance('u1', instance.id, {
        params: { label: 'changed', count: 9 },
        refreshRate: 300,
      });

      expect(entry).toMatchObject({ id: instance.id, params: { label: 'changed', count: 9 }, refreshRate: 300 });
      expect(widgets).toEqual([entry]);
      expect(emitted).toEqual([{ type: 'instance.updated', instance: entry }]);
    });

    it('leaves params alone when only refreshRate is supplied', async () => {
      const { service, dashboards, widgets } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id, { params: { label: 'kept', count: 3 } });

      const entry = await service.updateWidgetInstance('u1', instance.id, { refreshRate: 300 });

      expect(entry).toMatchObject({ params: { label: 'kept', count: 3 }, refreshRate: 300 });
    });

    it('leaves refreshRate alone when only params are supplied', async () => {
      const { service, dashboards, widgets } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id, { refreshRate: 900 });

      const entry = await service.updateWidgetInstance('u1', instance.id, { params: { label: 'changed' } });

      expect(entry).toMatchObject({ params: { label: 'changed', count: 5 }, refreshRate: 900 });
    });

    it('rejects an unknown instance with 404 and emits nothing', async () => {
      const { service, emitted } = makeService();

      await expect(service.updateWidgetInstance('u1', 'missing', { refreshRate: 300 })).rejects.toMatchObject({
        status: 404,
      });
      expect(emitted).toEqual([]);
    });

    it("rejects another user's instance with 404, leaves it untouched and emits nothing", async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const theirs = seedWidget(widgets, seedDashboard(dashboards, { userId: 'u2' }).id);

      await expect(service.updateWidgetInstance('u1', theirs.id, { refreshRate: 300 })).rejects.toMatchObject({
        status: 404,
      });
      expect(theirs.refreshRate).toBe(120);
      expect(emitted).toEqual([]);
    });

    it('rejects an instance whose widget type is no longer registered with 400 UNKNOWN_WIDGET', async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id, { widget: 'retired' });

      await expect(service.updateWidgetInstance('u1', instance.id, { refreshRate: 300 })).rejects.toMatchObject({
        status: 400,
        response: { error: 'UNKNOWN_WIDGET' },
      });
      expect(instance.refreshRate).toBe(120);
      expect(emitted).toEqual([]);
    });

    it('rejects invalid params with 400 INVALID_PARAMS, leaves the row untouched and emits nothing', async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id);

      await expect(
        service.updateWidgetInstance('u1', instance.id, { params: { label: 'hello', count: 0 }, refreshRate: 300 }),
      ).rejects.toMatchObject({ status: 400, response: { error: 'INVALID_PARAMS', param: 'count' } });
      expect(instance).toMatchObject({ params: { label: 'hello', count: 5 }, refreshRate: 120 });
      expect(emitted).toEqual([]);
    });

    it.each([
      ['below the widget minimum', 59],
      ['above the global maximum', MAX_REFRESH_SEC + 1],
    ])('rejects a refreshRate %s with 400 INVALID_REFRESH_RATE and emits nothing', async (_label, refreshRate) => {
      const { service, dashboards, widgets, emitted } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id);

      await expect(
        service.updateWidgetInstance('u1', instance.id, { params: { label: 'changed' }, refreshRate }),
      ).rejects.toMatchObject({ status: 400, response: { error: 'INVALID_REFRESH_RATE' } });
      expect(instance).toMatchObject({ params: { label: 'hello', count: 5 }, refreshRate: 120 });
      expect(emitted).toEqual([]);
    });

    it('rejects updating a connection-scoped instance with 409 NOT_CONNECTED when the user has no connection', async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id, {
        service: 'fake-connected',
        widget: 'profile',
      });

      await expect(service.updateWidgetInstance('u1', instance.id, { refreshRate: 300 })).rejects.toMatchObject({
        status: 409,
        response: { error: 'NOT_CONNECTED' },
      });
      expect(instance.refreshRate).toBe(120);
      expect(emitted).toEqual([]);
    });

    it('updates a connection-scoped instance when the user has a connection', async () => {
      const { service, dashboards, widgets, connections, emitted } = makeService();
      const instance = seedWidget(widgets, seedDashboard(dashboards).id, {
        service: 'fake-connected',
        widget: 'profile',
      });
      connections.push({ userId: 'u1', service: 'fake-connected' });

      const entry = await service.updateWidgetInstance('u1', instance.id, { refreshRate: 300 });

      expect(entry.refreshRate).toBe(300);
      expect(emitted).toEqual([{ type: 'instance.updated', instance: entry }]);
    });
  });

  describe('removeWidgetInstance', () => {
    it('deletes the instance and emits instance.deleted with its id', async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);
      const instance = seedWidget(widgets, dashboard.id);
      const sibling = seedWidget(widgets, dashboard.id);

      await service.removeWidgetInstance('u1', instance.id);

      expect(widgets).toEqual([sibling]);
      expect(emitted).toEqual([{ type: 'instance.deleted', instanceId: instance.id }]);
    });

    it('rejects an unknown instance with 404 and emits nothing', async () => {
      const { service, emitted } = makeService();

      await expect(service.removeWidgetInstance('u1', 'missing')).rejects.toMatchObject({ status: 404 });
      expect(emitted).toEqual([]);
    });

    it("rejects another user's instance with 404, keeps it and emits nothing", async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const theirs = seedWidget(widgets, seedDashboard(dashboards, { userId: 'u2' }).id);

      await expect(service.removeWidgetInstance('u1', theirs.id)).rejects.toMatchObject({ status: 404 });
      expect(widgets).toEqual([theirs]);
      expect(emitted).toEqual([]);
    });
  });

  describe('updateLayout', () => {
    it('moves only the listed instances and leaves everything but x/y/w/h as it was', async () => {
      const { service, dashboards, widgets, emitted } = makeService();
      const dashboard = seedDashboard(dashboards);
      const first = seedWidget(widgets, dashboard.id);
      const second = seedWidget(widgets, dashboard.id);
      // Snapshots: the fake mutates the seeded rows in place, so compare against the pre-call state.
      const before = [{ ...first }, { ...second }];
      const unlisted = seedWidget(widgets, dashboard.id, { x: 8, y: 8 });

      const result = await service.updateLayout('u1', dashboard.id, [
        { id: first.id, x: 1, y: 2, w: 3, h: 4 },
        { id: second.id, x: 5, y: 6, w: 7, h: 8 },
      ]);

      expect(result).toEqual([
        { ...before[0], x: 1, y: 2, w: 3, h: 4 },
        { ...before[1], x: 5, y: 6, w: 7, h: 8 },
      ]);
      expect(unlisted).toMatchObject({ x: 8, y: 8, w: 2, h: 2 });
      expect(emitted).toEqual([]);
    });

    it('returns an empty list for an empty batch on an owned dashboard', async () => {
      const { service, dashboards } = makeService();
      const dashboard = seedDashboard(dashboards);

      expect(await service.updateLayout('u1', dashboard.id, [])).toEqual([]);
    });

    it('rejects an unknown dashboard with 404', async () => {
      const { service } = makeService();

      await expect(service.updateLayout('u1', 'missing', [])).rejects.toMatchObject({ status: 404 });
    });

    it("rejects another user's dashboard with 404 and moves nothing", async () => {
      const { service, dashboards, widgets } = makeService();
      const theirs = seedDashboard(dashboards, { userId: 'u2' });
      const instance = seedWidget(widgets, theirs.id);

      await expect(
        service.updateLayout('u1', theirs.id, [{ id: instance.id, x: 9, y: 9, w: 9, h: 9 }]),
      ).rejects.toMatchObject({ status: 404 });
      expect(instance).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
    });

    it('rejects the batch with 404 before moving anything when one id does not exist', async () => {
      const { service, dashboards, widgets } = makeService();
      const dashboard = seedDashboard(dashboards);
      const instance = seedWidget(widgets, dashboard.id);

      await expect(
        service.updateLayout('u1', dashboard.id, [
          { id: instance.id, x: 9, y: 9, w: 9, h: 9 },
          { id: 'missing', x: 1, y: 1, w: 1, h: 1 },
        ]),
      ).rejects.toMatchObject({ status: 404 });
      expect(instance).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
    });

    it.each([
      ["another of the caller's dashboards", 'u1'],
      ["another user's dashboard", 'u2'],
    ])('rejects the batch with 404 before moving anything when one id belongs to %s', async (_label, ownerId) => {
      const { service, dashboards, widgets } = makeService();
      const dashboard = seedDashboard(dashboards);
      const mine = seedWidget(widgets, dashboard.id);
      const foreign = seedWidget(widgets, seedDashboard(dashboards, { userId: ownerId, position: 1 }).id);

      await expect(
        service.updateLayout('u1', dashboard.id, [
          { id: mine.id, x: 9, y: 9, w: 9, h: 9 },
          { id: foreign.id, x: 9, y: 9, w: 9, h: 9 },
        ]),
      ).rejects.toMatchObject({ status: 404 });
      expect(mine).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
      expect(foreign).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
    });
  });
});
