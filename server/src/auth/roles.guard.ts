import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { ROLES_KEY } from './roles.decorator.js';
import './types.js';

/** Checks `req.user.role` (set by JwtGuard, which must run first) against `@Roles(...)`. Fails closed. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!required?.length || !user || !required.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
