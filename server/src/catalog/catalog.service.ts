// GET /api/catalog's data assembly — see features/catalog-api/spec.md.

import { Injectable } from '@nestjs/common';
import type { CatalogResponse } from '@dashboard/shared';
import { ConnectionsService } from '../connections/connections.service.js';
import { WidgetRegistryService } from './widget-registry.service.js';

@Injectable()
export class CatalogService {
  constructor(
    private readonly registry: WidgetRegistryService,
    private readonly connections: ConnectionsService,
  ) {}

  /** Full registry, joined read-only against connections-api's per-user connection status. */
  async forUser(userId: string): Promise<CatalogResponse> {
    const { connections } = await this.connections.list(userId);
    const byService = new Map(connections.map((entry) => [entry.service, entry]));

    return {
      services: this.registry.services().map((service) => {
        const connection = byService.get(service.name);
        return {
          ...service,
          connected: connection?.connected ?? false,
          status: connection?.status ?? 'OK',
        };
      }),
    };
  }
}
