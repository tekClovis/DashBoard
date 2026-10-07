// Admin user management — see features/admin-ui/spec.md and docs/Architecture.md §5.3.

import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import type { AdminUserEntry, AdminUsersResponse, OkResponse } from '@dashboard/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { RequestUser } from '../auth/types.js';
import { AdminService } from './admin.service.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

/** ADMIN-only REST endpoints under `/admin/users`. */
@Controller('admin/users')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<AdminUsersResponse> {
    return this.admin.list(query);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: RequestUser,
  ): Promise<AdminUserEntry> {
    return this.admin.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: RequestUser): Promise<OkResponse> {
    await this.admin.remove(actor, id);
    return { ok: true };
  }
}
