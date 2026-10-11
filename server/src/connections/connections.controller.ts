// GET /api/connections, DELETE /api/connections/{service} — see
// features/connections-api/spec.md.

import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionsResponse, OkResponse } from '@dashboard/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import { ConnectionsService } from './connections.service.js';
import { connectServiceConfigured } from './provider-config.js';
import { revokeAtProvider } from './provider-revoke.js';

@Controller('connections')
@UseGuards(JwtGuard)
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly config: ConfigService,
  ) {}

  /** List the caller's connection status for every widget service, flagging services whose provider has no credentials. */
  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<ConnectionsResponse> {
    const { connections } = await this.connections.list(user.id);
    return {
      connections: connections.map((entry) => ({
        ...entry,
        configured: connectServiceConfigured(this.config, entry.service),
      })),
    };
  }

  /**
   * Delete the caller's connection, then revoke the token at the provider.
   *
   * Revocation is best-effort and runs after the row is deleted; it never fails the request.
   * Succeeds even when no connection exists.
   */
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
