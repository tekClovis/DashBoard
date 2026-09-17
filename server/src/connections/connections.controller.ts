// GET /api/connections, DELETE /api/connections/{service} — see
// features/connections-api/spec.md.

import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionsResponse, OkResponse } from '@dashboard/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import { ConnectionsService } from './connections.service.js';
import { revokeAtProvider } from './provider-revoke.js';

@Controller('connections')
@UseGuards(JwtGuard)
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<ConnectionsResponse> {
    return this.connections.list(user.id);
  }

  @Delete(':service')
  async disconnect(@Param('service') service: string, @CurrentUser() user: RequestUser): Promise<OkResponse> {
    const existing = await this.connections.findForRevoke(user.id, service);
    await this.connections.disconnect(user.id, service);
    if (existing) {
      await revokeAtProvider(service, existing.accessToken, this.config);
    }

    return { ok: true };
  }
}
