// GET /api/catalog — see features/catalog-api/spec.md.

import { Controller, Get, UseGuards } from '@nestjs/common';
import type { CatalogResponse } from '@dashboard/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
@UseGuards(JwtGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async get(@CurrentUser() user: RequestUser): Promise<CatalogResponse> {
    return this.catalog.forUser(user.id);
  }
}
