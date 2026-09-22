import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class AdminOnly {
  @Roles('ADMIN')
  handler() {}

  unmarked() {}
}

function ctx(handler: () => void, user: { role: string } | undefined): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AdminOnly,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const target = new AdminOnly();

  it('allows a user whose role is listed', () => {
    expect(guard.canActivate(ctx(target.handler, { role: 'ADMIN' }))).toBe(true);
  });

  it('rejects a user whose role is not listed, and a missing user', () => {
    expect(() => guard.canActivate(ctx(target.handler, { role: 'USER' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(target.handler, undefined))).toThrow(ForbiddenException);
  });

  it('fails closed when no @Roles metadata is present', () => {
    expect(() => guard.canActivate(ctx(target.unmarked, { role: 'ADMIN' }))).toThrow(ForbiddenException);
  });
});
