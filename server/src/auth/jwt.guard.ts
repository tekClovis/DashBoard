import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { readCookie } from '../core/http/cookies.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { JwtService } from './jwt.service.js';
import { SESSION_COOKIE } from './session.constants.js';
import { TokenRevocationService } from './token-revocation.service.js';
import './types.js';

/**
 * Verifies the session cookie's signature, then rejects a banned user, a
 * token superseded by logout-all (`tv !== user.tokenVersion`), or a token
 * individually revoked by plain logout (`jti` in the revoked set) — see
 * docs/Architecture.md §5.1.
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

    const payload = this.jwt.verify(token);
    if (!payload) throw new UnauthorizedException();

    if (await this.revocation.isRevoked(payload.jti)) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.bannedAt || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException();
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    };
    return true;
  }
}
