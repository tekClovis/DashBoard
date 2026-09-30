import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { JwtGuard } from '../auth/jwt.guard.js';
import { ROLES_KEY } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { RequestUser } from '../auth/types.js';
import { AdminController } from './admin.controller.js';
import type { AdminService } from './admin.service.js';

const ID = '3f2a9c1e-5b7d-4e8f-9a1b-0c2d3e4f5a6b';
const actor: RequestUser = { id: 'admin-1', email: 'a@b.c', role: 'ADMIN', emailVerifiedAt: null };

describe('AdminController', () => {
  it('runs JwtGuard before RolesGuard and is restricted to ADMIN', () => {
    const reflector = new Reflector();

    expect(reflector.get(GUARDS_METADATA, AdminController)).toEqual([JwtGuard, RolesGuard]);
    expect(reflector.get(ROLES_KEY, AdminController)).toEqual(['ADMIN']);
  });

  it('remove answers { ok: true } once the service has deleted the user', async () => {
    const remove = vi.fn(async () => undefined);
    const controller = new AdminController({ remove } as unknown as AdminService);

    await expect(controller.remove(ID, actor)).resolves.toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(actor, ID);
  });

  it('remove propagates a service rejection instead of answering ok', async () => {
    const remove = vi.fn(async () => {
      throw new ForbiddenException();
    });
    const controller = new AdminController({ remove } as unknown as AdminService);

    await expect(controller.remove(ID, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
