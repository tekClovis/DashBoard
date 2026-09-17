// Minimal JwtGuard matching the contract documented by `auth-session`
// (docs/Architecture.md §5.1): verifies the session cookie's signature, loads the user,
// and rejects (401) if `bannedAt` is set or `tv !== user.tokenVersion`.
//
// Built here (rather than depending on `auth-session`'s unmerged branch) so the
// identities link/unlink endpoints have something to authenticate against. Reconcile
// with `auth-session`'s own JwtGuard when both PRs merge.

import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { readSessionCookie, verifySessionToken } from './session-cookie.js';
import type { User } from '../generated/prisma/client.js';

export interface RequestWithUser extends Request {
  user: User;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = readSessionCookie(req.cookies as Record<string, string | undefined> | undefined);
    if (!token) throw new UnauthorizedException();

    let payload: { sub: string; role: string; tv: number };
    try {
      payload = verifySessionToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.bannedAt || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException();
    }

    (req as RequestWithUser).user = user;
    return true;
  }
}
