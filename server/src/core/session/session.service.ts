// Minimal standalone session-cookie reader/signer.
//
// `auth-session` (JWT cookie issuing) and `oauth-login` (its own temporary
// `session-cookie.ts`/`jwt.guard.ts` duplicate, per that branch's review) are
// both unmerged into `main` as of this feature. Rather than block on either,
// this reproduces just the read side (plus a signer test helpers can use to
// mint a valid cookie without a real login) — same cookie shape as
// docs/Architecture.md §5.1: one JWT (`sub`, `role`, `tv`), 7-day expiry,
// `JWT_SECRET`. Flagged for reconciliation: once `auth-session` merges, this
// file should be deleted in favor of its real `JwtGuard`/signer.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service.js';

/** Name of the httpOnly session cookie set by local/OAuth login. */
export const SESSION_COOKIE = 'session';

const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export interface SessionClaims {
  sub: string;
  role: 'USER' | 'ADMIN';
  tv: number;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Signs a session JWT with the same shape `auth-session` issues. Test helpers may call this directly. */
  sign(claims: SessionClaims): string {
    return jwt.sign(claims, this.config.getOrThrow<string>('JWT_SECRET'), { expiresIn: SESSION_TTL_SEC });
  }

  /** Verifies the session cookie and the user's current standing. Throws 401 on any failure. */
  async requireUserId(req: Request): Promise<string> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException({ error: 'NOT_AUTHENTICATED' });
    }

    let claims: SessionClaims;
    try {
      claims = jwt.verify(token, this.config.getOrThrow<string>('JWT_SECRET')) as unknown as SessionClaims;
    } catch {
      throw new UnauthorizedException({ error: 'NOT_AUTHENTICATED' });
    }

    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.bannedAt !== null || user.tokenVersion !== claims.tv) {
      throw new UnauthorizedException({ error: 'NOT_AUTHENTICATED' });
    }

    return user.id;
  }
}
