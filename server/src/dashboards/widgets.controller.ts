// PATCH/DELETE /api/widgets/{id} — see features/dashboards-api/spec.md and docs/Architecture.md §3.

import { Body, Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import type { WidgetInstanceEntry } from '@dashboard/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import { UpdateWidgetInstanceDto } from './dto/update-widget-instance.dto.js';
import { DashboardsService } from './dashboards.service.js';

@Controller('widgets')
@UseGuards(JwtGuard)
export class WidgetsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWidgetInstanceDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WidgetInstanceEntry> {
    return this.dashboards.updateWidgetInstance(user.id, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<{ ok: true }> {
    await this.dashboards.removeWidgetInstance(user.id, id);
    return { ok: true };
  }
}
