// Shared session verification: signature + expiry (JwtService.verify), per-token revocation,
// and per-user ban/tokenVersion checks — see docs/Architecture.md §8.3. Used by both
// JwtGuard (HTTP, Nest CanActivate) and RealtimeGateway (Socket.IO handshake), which can't
// share a CanActivate since one runs against an ExecutionContext and the other against a
// bare token string.

import { PrismaService } from '../core/prisma/prisma.service.js';
import { JwtService } from './jwt.service.js';
import type { RequestUser } from './types.js';
import { TokenRevocationService } from './token-revocation.service.js';

/** Returns the verified user for a session token, or null if invalid, revoked, banned, unverified, or stale. */
export async function resolveSessionUser(
  token: string,
  jwt: JwtService,
  prisma: PrismaService,
  revocation: TokenRevocationService,
): Promise<RequestUser | null> {
  const payload = jwt.verify(token);
  if (!payload) return null;

  const [revoked, user] = await Promise.all([
    revocation.isRevoked(payload.jti),
    prisma.user.findUnique({ where: { id: payload.sub } }),
  ]);
  if (revoked || !user || user.bannedAt || !user.emailVerifiedAt || user.tokenVersion !== payload.tv) return null;

  return { id: user.id, email: user.email, role: user.role, emailVerifiedAt: user.emailVerifiedAt };
}
