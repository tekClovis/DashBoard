// Minimal local lookup of a WidgetInstance's owner, standing in for dashboards-api's
// instance CRUD — that branch isn't merged yet (see features/timer-realtime/spec.md's
// Constraints). The returned shape matches the Prisma `WidgetInstance` model, so swapping
// this for dashboards-api's own service later needs no changes on the Timer/gateway side.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service.js';

export interface OwnedWidgetInstance {
  id: string;
  service: string;
  widget: string;
  params: Record<string, string | number>;
  refreshRate: number;
}

@Injectable()
export class InstanceLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns null both when the instance doesn't exist and when it belongs to another user, so the caller can't distinguish the two. */
  async findOwned(instanceId: string, userId: string): Promise<OwnedWidgetInstance | null> {
    const instance = await this.prisma.widgetInstance.findUnique({
      where: { id: instanceId },
      include: { dashboard: { select: { userId: true } } },
    });
    if (!instance || instance.dashboard.userId !== userId) return null;

    return {
      id: instance.id,
      service: instance.service,
      widget: instance.widget,
      params: instance.params as Record<string, string | number>,
      refreshRate: instance.refreshRate,
    };
  }
}
