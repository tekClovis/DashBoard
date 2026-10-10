import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { readCookie } from '../core/http/cookies.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { JwtService } from './jwt.service.js';
import { resolveSessionUser } from './session-user.js';
import { SESSION_COOKIE } from './session.constants.js';
import { TokenRevocationService } from './token-revocation.service.js';
import './types.js';

/**
 * Verifies the session cookie's signature, then rejects a banned user, a
 * token superseded by logout-all (`tv !== user.tokenVersion`), or a token
 * individually revoked by plain logout (`jti` in the revoked set) — see
 * docs/Architecture.md §8.3.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly revocation: TokenRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException();

    const user = await resolveSessionUser(token, this.jwt, this.prisma, this.revocation);
    if (!user) throw new UnauthorizedException();

    req.user = user;
    return true;
  }
}
