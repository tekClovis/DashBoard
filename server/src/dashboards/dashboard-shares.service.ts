// Share a dashboard with another user; the recipient accepts (a personal copy) or declines — see
// docs/Architecture.md §8.2, §3 and features/big-dashboard-share/spec.md.
//
// A DashboardShare row is an offer; accept/decline keep it with the new status for the sender. Recipient-side lookups
// are scoped by toUserId in the query itself, so someone else's share is a 404, like the rest of
// the dashboards API.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DashboardEntry, IncomingShareEntry, SentShareEntry } from '@dashboard/shared';
import { PrismaService } from '../core/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { DashboardsService } from './dashboards.service.js';

@Injectable()
export class DashboardShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboards: DashboardsService,
  ) {}

  /**
   * Offer a dashboard to another user by email.
   * @throws {@link NotFoundException} when the dashboard isn't owned by `userId`.
   * @throws {@link BadRequestException} with `UNKNOWN_USER` (no such or banned user) or `CANNOT_SHARE_WITH_SELF`.
   * @throws {@link ConflictException} with `ALREADY_SHARED` when a PENDING share already exists.
   */
  async share(userId: string, dashboardId: string, email: string): Promise<void> {
    const dashboard = await this.prisma.dashboard.findFirst({ where: { id: dashboardId, userId } });
    if (!dashboard) throw new NotFoundException();

    const recipient = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!recipient || recipient.bannedAt) throw new BadRequestException({ error: 'UNKNOWN_USER' });
    if (recipient.id === userId) throw new BadRequestException({ error: 'CANNOT_SHARE_WITH_SELF' });

    const pending = await this.prisma.dashboardShare.findUnique({
      where: { dashboardId_toUserId: { dashboardId, toUserId: recipient.id } },
    });
    if (pending?.status === 'PENDING') throw new ConflictException({ error: 'ALREADY_SHARED' });
    // An answered share can be offered again: reopen the same row (unique per dashboard + recipient).
    if (pending) {
      await this.prisma.dashboardShare.update({
        where: { id: pending.id },
        data: { status: 'PENDING', fromUserId: userId, createdAt: new Date() },
      });
      return;
    }
    await this.prisma.dashboardShare.create({ data: { dashboardId, fromUserId: userId, toUserId: recipient.id } });
  }

  /** Who the dashboard was sent to and their answer, oldest first. */
  async listSent(userId: string, dashboardId: string): Promise<SentShareEntry[]> {
    const dashboard = await this.prisma.dashboard.findFirst({ where: { id: dashboardId, userId } });
    if (!dashboard) throw new NotFoundException();
    const rows = await this.prisma.dashboardShare.findMany({
      where: { dashboardId },
      orderBy: { createdAt: 'asc' },
      include: { toUser: { select: { email: true } } },
    });
    return rows.map((row) => ({ id: row.id, toEmail: row.toUser.email, status: row.status }));
  }

  /** Pending shares offered to `userId`, newest first. */
  async listIncoming(userId: string): Promise<IncomingShareEntry[]> {
    const rows = await this.prisma.dashboardShare.findMany({
      where: { toUserId: userId, status: 'PENDING' },
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

  /**
   * Clone the dashboard and its widgets (new ids) into the recipient's account and mark the share ADDED, atomically.
   * @returns the new dashboard copy.
   * @throws {@link NotFoundException} when the share isn't a PENDING one addressed to `userId`.
   */
  async accept(userId: string, shareId: string): Promise<DashboardEntry> {
    return this.prisma.$transaction(async (tx) => {
      const share = await tx.dashboardShare.findFirst({
        where: { id: shareId, toUserId: userId, status: 'PENDING' },
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
      await tx.dashboardShare.update({ where: { id: shareId }, data: { status: 'ADDED' } });
      return copy;
    });
  }

  /**
   * Mark a pending share DECLINED.
   * @throws {@link NotFoundException} when the share isn't a PENDING one addressed to `userId`.
   */
  async decline(userId: string, shareId: string): Promise<void> {
    const { count } = await this.prisma.dashboardShare.updateMany({
      where: { id: shareId, toUserId: userId, status: 'PENDING' },
      data: { status: 'DECLINED' },
    });
    if (count === 0) throw new NotFoundException();
  }
}
