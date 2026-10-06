// Share a dashboard with another user; the recipient accepts (a personal copy) or declines — see
// docs/Architecture.md §4, §8 and features/big-dashboard-share/spec.md.
//
// A DashboardShare row is a pending offer and is deleted on accept/decline. Recipient-side lookups
// are scoped by toUserId in the query itself, so someone else's share is a 404, like the rest of
// the dashboards API.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DashboardEntry, IncomingShareEntry } from '@dashboard/shared';
import { PrismaService } from '../core/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { DashboardsService } from './dashboards.service.js';

@Injectable()
export class DashboardShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboards: DashboardsService,
  ) {}

  async share(userId: string, dashboardId: string, email: string): Promise<void> {
    const dashboard = await this.prisma.dashboard.findFirst({ where: { id: dashboardId, userId } });
    if (!dashboard) throw new NotFoundException();

    const recipient = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!recipient || recipient.bannedAt) throw new BadRequestException({ error: 'UNKNOWN_USER' });
    if (recipient.id === userId) throw new BadRequestException({ error: 'CANNOT_SHARE_WITH_SELF' });

    const pending = await this.prisma.dashboardShare.findUnique({
      where: { dashboardId_toUserId: { dashboardId, toUserId: recipient.id } },
    });
    if (pending) throw new ConflictException({ error: 'ALREADY_SHARED' });
    await this.prisma.dashboardShare.create({ data: { dashboardId, fromUserId: userId, toUserId: recipient.id } });
  }

  async listIncoming(userId: string): Promise<IncomingShareEntry[]> {
    const rows = await this.prisma.dashboardShare.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { fromUser: { select: { email: true } }, dashboard: { include: { widgets: { select: { id: true } } } } },
    });
    return rows.map((row) => ({
      id: row.id,
      dashboardName: row.dashboard.name,
      fromEmail: row.fromUser.email,
      widgetCount: row.dashboard.widgets.length,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Clones the dashboard and its widgets (new ids) into the recipient's account and consumes the share. */
  async accept(userId: string, shareId: string): Promise<DashboardEntry> {
    return this.prisma.$transaction(async (tx) => {
      const share = await tx.dashboardShare.findFirst({
        where: { id: shareId, toUserId: userId },
        include: { dashboard: { include: { widgets: true } } },
      });
      if (!share) throw new NotFoundException();

      const copy = await this.dashboards.create(userId, share.dashboard.name, tx);
      await tx.widgetInstance.createMany({
        data: share.dashboard.widgets.map((w) => ({
          dashboardId: copy.id,
          service: w.service,
          widget: w.widget,
          params: w.params as Prisma.InputJsonValue,
          refreshRate: w.refreshRate,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
        })),
      });
      await tx.dashboardShare.delete({ where: { id: shareId } });
      return copy;
    });
  }

  async decline(userId: string, shareId: string): Promise<void> {
    const { count } = await this.prisma.dashboardShare.deleteMany({ where: { id: shareId, toUserId: userId } });
    if (count === 0) throw new NotFoundException();
  }
}
