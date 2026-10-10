// Incoming-share endpoints — see docs/Architecture.md §3. Sending a share lives on
// DashboardsController (POST /dashboards/{id}/share).

import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { DashboardEntry, IncomingSharesResponse } from '@dashboard/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import { DashboardShareService } from './dashboard-shares.service.js';

@Controller('shares')
@UseGuards(JwtGuard)
export class SharesController {
  constructor(private readonly shares: DashboardShareService) {}

  @Get('incoming')
  async incoming(@CurrentUser() user: RequestUser): Promise<IncomingSharesResponse> {
    return { shares: await this.shares.listIncoming(user.id) };
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<DashboardEntry> {
    return this.shares.accept(user.id, id);
  }

  @Delete(':id')
  async decline(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<{ ok: true }> {
    await this.shares.decline(user.id, id);
    return { ok: true };
  }
}
