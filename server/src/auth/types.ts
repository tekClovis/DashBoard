import type { Role } from '../generated/prisma/enums.js';

/** Set on `req.user` by {@link JwtGuard}. */
export interface RequestUser {
  id: string;
  email: string;
  role: Role;
  emailVerifiedAt: Date | null;
}

declare module 'express' {
  interface Request {
    user?: RequestUser;
  }
}
