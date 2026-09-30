import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import type { CatalogService } from './catalog.service.js';
import { CatalogController } from './catalog.controller.js';

describe('CatalogController', () => {
  it('is protected by JwtGuard', () => {
    expect(new Reflector().get(GUARDS_METADATA, CatalogController)).toEqual([JwtGuard]);
  });

  it('builds the catalog for the authenticated user id', async () => {
    const catalog = { forUser: async (userId: string) => ({ services: [], userId }) } as unknown as CatalogService;
    const user: RequestUser = { id: 'user-1', email: 'a@b.c', role: 'USER', emailVerifiedAt: null };

    await expect(new CatalogController(catalog).get(user)).resolves.toEqual({ services: [], userId: 'user-1' });
  });
});
