import { SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/** Restricts a route/controller to the given roles. Must be paired with JwtGuard then RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
