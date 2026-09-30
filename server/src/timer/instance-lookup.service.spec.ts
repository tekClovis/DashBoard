import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { InstanceLookupService } from './instance-lookup.service.js';

const ROW = {
  id: 'w1',
  dashboardId: 'd1',
  service: 'weather',
  widget: 'current',
  params: { city: 'Paris', days: 3 },
  refreshRate: 300,
  position: 0,
  dashboard: { userId: 'u1' },
};

/** Prisma stub that honours `where.id`, so a lookup by the wrong key finds nothing. */
function makeService(): InstanceLookupService {
  const prisma = {
    widgetInstance: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === ROW.id ? ROW : null),
    },
  } as unknown as PrismaService;
  return new InstanceLookupService(prisma);
}

describe('InstanceLookupService.findOwned', () => {
  it("returns only the Timer-facing fields of the caller's own instance", async () => {
    expect(await makeService().findOwned('w1', 'u1')).toStrictEqual({
      id: 'w1',
      service: 'weather',
      widget: 'current',
      params: { city: 'Paris', days: 3 },
      refreshRate: 300,
    });
  });

  it('returns null for an instance that does not exist', async () => {
    expect(await makeService().findOwned('missing', 'u1')).toBeNull();
  });

  it("returns null for an instance on another user's dashboard", async () => {
    expect(await makeService().findOwned('w1', 'u2')).toBeNull();
  });
});
