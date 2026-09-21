// Dashboard CRUD + widget-instance/layout endpoints under a dashboard — see
// features/dashboards-api/spec.md and docs/Architecture.md §8.

import { Body, Controller, Delete, Get, Param, ParseArrayPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { DashboardEntry, DashboardsResponse, WidgetInstanceEntry, WidgetsResponse } from '@dashboard/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import { CreateDashboardDto } from './dto/create-dashboard.dto.js';
import { CreateWidgetInstanceDto } from './dto/create-widget-instance.dto.js';
import { LayoutUpdateDto } from './dto/layout-update.dto.js';
import { UpdateDashboardDto } from './dto/update-dashboard.dto.js';
import { DashboardsService } from './dashboards.service.js';

@Controller('dashboards')
@UseGuards(JwtGuard)
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<DashboardsResponse> {
    return { dashboards: await this.dashboards.list(user.id) };
  }

  @Post()
  async create(@Body() dto: CreateDashboardDto, @CurrentUser() user: RequestUser): Promise<DashboardEntry> {
    return this.dashboards.create(user.id, dto.name);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDashboardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DashboardEntry> {
    return this.dashboards.update(user.id, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<{ ok: true }> {
    await this.dashboards.remove(user.id, id);
    return { ok: true };
  }

  @Get(':id/widgets')
  async listWidgets(@Param('id') dashboardId: string, @CurrentUser() user: RequestUser): Promise<WidgetsResponse> {
    return { widgets: await this.dashboards.listWidgets(user.id, dashboardId) };
  }

  @Post(':id/widgets')
  async addWidget(
    @Param('id') dashboardId: string,
    @Body() dto: CreateWidgetInstanceDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WidgetInstanceEntry> {
    return this.dashboards.addWidgetInstance(user.id, dashboardId, dto);
  }

  @Patch(':id/layout')
  async updateLayout(
    @Param('id') dashboardId: string,
    @Body(new ParseArrayPipe({ items: LayoutUpdateDto })) entries: LayoutUpdateDto[],
    @CurrentUser() user: RequestUser,
  ): Promise<WidgetInstanceEntry[]> {
    return this.dashboards.updateLayout(user.id, dashboardId, entries);
  }
}
