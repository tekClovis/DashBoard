import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DashboardEventsService } from './dashboard-events.js';
import { DashboardShareService } from './dashboard-shares.service.js';
import { DashboardsService } from './dashboards.service.js';

interface UserRow { id: string; email: string; bannedAt: Date | null }
interface DashRow { id: string; userId: string; name: string; position: number }
interface WidgetRow { id: string; dashboardId: string; service: string; widget: string; params: unknown; refreshRate: number; x: number; y: number; w: number; h: number }
interface ShareRow { id: string; dashboardId: string; fromUserId: string; toUserId: string; createdAt: Date }

/** In-memory slice of PrismaService honouring the `where` it is given. */
function makeFake() {
  const users: UserRow[] = [
    { id: 'u1', email: 'ada@example.com', bannedAt: null },
    { id: 'u2', email: 'grace@example.com', bannedAt: null },
    { id: 'u3', email: 'eve@example.com', bannedAt: null },
    { id: 'u4', email: 'banned@example.com', bannedAt: new Date() },
  ];
  const dashboards: DashRow[] = [{ id: 'd1', userId: 'u1', name: 'Game night', position: 0 }];
  const widgets: WidgetRow[] = [
    { id: 'w1', dashboardId: 'd1', service: 'weather', widget: 'current_weather', params: { city: 'Paris' }, refreshRate: 300, x: 0, y: 0, w: 2, h: 2 },
    { id: 'w2', dashboardId: 'd1', service: 'steam', widget: 'owned_games', params: {}, refreshRate: 600, x: 2, y: 1, w: 3, h: 4 },
  ];
  const shares: ShareRow[] = [];
  let n = 1;
  const id = (p: string) => `${p}${100 + n++}`;

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => users.find((u) => u.email === where.email) ?? null,
    },
    dashboard: {
      findFirst: async ({ where, orderBy }: { where: { id?: string; userId?: string }; orderBy?: unknown }) => {
        const rows = dashboards.filter((d) => (!where.id || d.id === where.id) && (!where.userId || d.userId === where.userId));
        return (orderBy ? rows.toSorted((a, b) => b.position - a.position) : rows)[0] ?? null;
      },
      create: async ({ data }: { data: Omit<DashRow, 'id'> }) => {
        const row = { id: id('d'), ...data };
        dashboards.push(row);
        return row;
      },
    },
    widgetInstance: {
      createMany: async ({ data }: { data: Omit<WidgetRow, 'id'>[] }) => {
        data.forEach((w) => widgets.push({ id: id('w'), ...w }));
        return { count: data.length };
      },
    },
    dashboardShare: {
      findUnique: async ({ where }: { where: { dashboardId_toUserId: { dashboardId: string; toUserId: string } } }) => {
        const key = where.dashboardId_toUserId;
        return shares.find((s) => s.dashboardId === key.dashboardId && s.toUserId === key.toUserId) ?? null;
      },
      create: async ({ data }: { data: Omit<ShareRow, 'id' | 'createdAt'> }) => {
        const row = { id: id('s'), createdAt: new Date(), ...data };
        shares.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { toUserId: string } }) =>
        shares
          .filter((s) => s.toUserId === where.toUserId)
          .map((s) => ({
            ...s,
            fromUser: users.find((u) => u.id === s.fromUserId)!,
            dashboard: { ...dashboards.find((d) => d.id === s.dashboardId)!, widgets: widgets.filter((w) => w.dashboardId === s.dashboardId) },
          })),
      findFirst: async ({ where }: { where: { id: string; toUserId: string } }) => {
        const s = shares.find((x) => x.id === where.id && x.toUserId === where.toUserId);
        if (!s) return null;
        return { ...s, dashboard: { ...dashboards.find((d) => d.id === s.dashboardId)!, widgets: widgets.filter((w) => w.dashboardId === s.dashboardId) } };
      },
      deleteMany: async ({ where }: { where: { id: string; toUserId: string } }) => {
        const i = shares.findIndex((x) => x.id === where.id && x.toUserId === where.toUserId);
        if (i >= 0) shares.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        shares.splice(shares.findIndex((x) => x.id === where.id), 1);
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };
  const dashboardsService = new DashboardsService(prisma as never, {} as never, new DashboardEventsService());
  const service = new DashboardShareService(prisma as never, dashboardsService);
  return { service, dashboards, widgets, shares };
}

describe('DashboardShareService', () => {
  describe('share', () => {
    it('creates a pending share for an existing user, matching the email case-insensitively', async () => {
      const { service, shares } = makeFake();
      await service.share('u1', 'd1', ' Grace@Example.com ');
      expect(shares).toMatchObject([{ dashboardId: 'd1', fromUserId: 'u1', toUserId: 'u2' }]);
    });

    it('rejects an unknown or banned recipient with UNKNOWN_USER', async () => {
      const { service, shares } = makeFake();
      for (const email of ['nobody@example.com', 'banned@example.com']) {
        const err = await service.share('u1', 'd1', email).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toEqual({ error: 'UNKNOWN_USER' });
      }
      expect(shares).toHaveLength(0);
    });

    it('rejects sharing with yourself', async () => {
      const { service } = makeFake();
      const err = await service.share('u1', 'd1', 'ada@example.com').catch((e: unknown) => e);
      expect((err as BadRequestException).getResponse()).toEqual({ error: 'CANNOT_SHARE_WITH_SELF' });
    });

    it('404s when the dashboard is not the caller\'s', async () => {
      const { service } = makeFake();
      await expect(service.share('u2', 'd1', 'eve@example.com')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a second pending share of the same dashboard to the same recipient with ALREADY_SHARED', async () => {
      const { service, shares } = makeFake();
      await service.share('u1', 'd1', 'grace@example.com');
      const err = await service.share('u1', 'd1', 'grace@example.com').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual({ error: 'ALREADY_SHARED' });
      expect(shares).toHaveLength(1);
    });
  });

  describe('listIncoming', () => {
    it('lists only the recipient\'s shares with dashboard name, sender and widget count', async () => {
      const { service } = makeFake();
      await service.share('u1', 'd1', 'grace@example.com');
      expect(await service.listIncoming('u3')).toEqual([]);
      expect(await service.listIncoming('u2')).toEqual([
        { id: expect.any(String), dashboardName: 'Game night', fromEmail: 'ada@example.com', widgetCount: 2, createdAt: expect.any(String) },
      ]);
    });
  });

  describe('accept', () => {
    it('creates a new dashboard for the recipient with cloned widgets (new ids, same type, params, layout) and consumes the share', async () => {
      const { service, dashboards, widgets, shares } = makeFake();
      await service.share('u1', 'd1', 'grace@example.com');
      const [{ id: shareId }] = await service.listIncoming('u2');

      const copy = await service.accept('u2', shareId);

      expect(copy).toEqual({ id: expect.any(String), name: 'Game night', position: 0 });
      expect(dashboards.find((d) => d.id === copy.id)?.userId).toBe('u2');
      const cloned = widgets.filter((w) => w.dashboardId === copy.id);
      expect(cloned.map(({ id: _id, dashboardId: _d, ...rest }) => rest)).toEqual(
        widgets.filter((w) => w.dashboardId === 'd1').map(({ id: _id, dashboardId: _d, ...rest }) => rest),
      );
      expect(cloned.map((w) => w.id)).not.toContain('w1');
      expect(cloned.map((w) => w.id)).not.toContain('w2');
      expect(widgets.filter((w) => w.dashboardId === 'd1')).toHaveLength(2);
      expect(shares).toHaveLength(0);
    });

    it('404s for anyone but the recipient and leaves the share intact', async () => {
      const { service, shares, dashboards } = makeFake();
      await service.share('u1', 'd1', 'grace@example.com');
      const shareId = shares[0].id;
      for (const user of ['u1', 'u3']) {
        await expect(service.accept(user, shareId)).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(shares).toHaveLength(1);
      expect(dashboards).toHaveLength(1);
    });
  });

  describe('decline', () => {
    it('removes the share for the recipient only', async () => {
      const { service, shares } = makeFake();
      await service.share('u1', 'd1', 'grace@example.com');
      const shareId = shares[0].id;
      await expect(service.decline('u3', shareId)).rejects.toBeInstanceOf(NotFoundException);
      await service.decline('u2', shareId);
      expect(shares).toHaveLength(0);
    });
  });
});
