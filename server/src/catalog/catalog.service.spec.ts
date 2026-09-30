import { describe, expect, it } from 'vitest';
import type { TokenCipherService } from '../connections/token-cipher.service.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { makeWidgetDefinition } from '../timer/test-helpers.js';
import { CatalogService } from './catalog.service.js';
import { WidgetRegistryService } from './widget-registry.service.js';

/** Real ConnectionsService over a Prisma stub returning the given rows for 'user-1' only. */
function makeConnections(rows: { service: string; status: string }[]): ConnectionsService {
  const prisma = {
    serviceConnection: {
      findMany: async ({ where }: { where: { userId: string } }) => (where.userId === 'user-1' ? rows : []),
    },
  } as unknown as PrismaService;
  return new ConnectionsService(prisma, {} as TokenCipherService);
}

function populatedRegistry(): WidgetRegistryService {
  const registry = new WidgetRegistryService();
  registry.registerService({ name: 'weather', connection: 'none' });
  registry.registerService({ name: 'github', connection: 'oauth' });
  registry.registerService({ name: 'steam', connection: 'openid' });
  registry.register(makeWidgetDefinition({ service: 'weather', name: 'current_weather', minRefreshSec: 300 }));
  registry.register(makeWidgetDefinition({ service: 'github', name: 'repo_stats' }));
  return registry;
}

describe('CatalogService.forUser', () => {
  it('returns an empty service list from an empty registry', async () => {
    const service = new CatalogService(new WidgetRegistryService(), makeConnections([]));

    expect(await service.forUser('user-1')).toEqual({ services: [] });
  });

  it('joins every registered service with the user connection status, keeping full widget specs', async () => {
    const service = new CatalogService(populatedRegistry(), makeConnections([{ service: 'github', status: 'EXPIRED' }]));

    const { services } = await service.forUser('user-1');

    expect(services.map((s) => [s.name, s.connected, s.status])).toEqual([
      ['weather', true, 'OK'],
      ['github', true, 'EXPIRED'],
      ['steam', false, 'OK'],
    ]);
    expect(services[0]).toEqual({
      name: 'weather',
      connection: 'none',
      connected: true,
      status: 'OK',
      widgets: [
        {
          service: 'weather',
          name: 'current_weather',
          description: 'test',
          params: [{ name: 'label', type: 'string', required: true }],
          minRefreshSec: 300,
        },
      ],
    });
  });

  it('only reflects the requesting user connections', async () => {
    const service = new CatalogService(populatedRegistry(), makeConnections([{ service: 'github', status: 'OK' }]));

    const { services } = await service.forUser('someone-else');

    expect(services.find((s) => s.name === 'github')).toMatchObject({ connected: false, status: 'OK' });
  });

  it('reports a registered service unknown to connections as disconnected with status OK', async () => {
    const registry = new WidgetRegistryService();
    registry.registerService({ name: 'mystery', connection: 'oauth' });
    const service = new CatalogService(registry, makeConnections([]));

    const { services } = await service.forUser('user-1');

    expect(services).toEqual([{ name: 'mystery', connection: 'oauth', widgets: [], connected: false, status: 'OK' }]);
  });
});
