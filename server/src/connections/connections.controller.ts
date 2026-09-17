// GET /api/connections, DELETE /api/connections/{service} — see
// features/connections-api/spec.md.

import { Controller, Delete, Get, Param, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionsResponse, OkResponse } from '@dashboard/shared';
import type { Request } from 'express';
import { SessionService } from '../core/session/session.service.js';
import { ConnectionsService } from './connections.service.js';
import { revokeAtProvider } from './provider-revoke.js';

@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly session: SessionService,
    private readonly connections: ConnectionsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(@Req() req: Request): Promise<ConnectionsResponse> {
    const userId = await this.session.requireUserId(req);
    return this.connections.list(userId);
  }

  @Delete(':service')
  async disconnect(@Param('service') service: string, @Req() req: Request): Promise<OkResponse> {
    const userId = await this.session.requireUserId(req);

    const existing = await this.connections.findForRevoke(userId, service);
    await this.connections.disconnect(userId, service);
    if (existing) {
      await revokeAtProvider(service, existing.accessToken, this.config);
    }

    return { ok: true };
  }
}
