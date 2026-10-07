// DELETE /api/auth/identities/{provider} (unlink)
// docs/Architecture.md §5.1: "A logged-in user can also link or unlink identities from
// Profile. The last remaining login method cannot be unlinked."
//
// Linking is NOT done here: it requires a completed OAuth handshake (GET
// /api/oauth/{provider}/start?intent=link -> callback), which proves the caller actually
// owns the provider account. There used to be a POST here that accepted a raw client-supplied
// providerUserId with no such proof — an account-takeover vector (a client could pre-link a
// victim's real provider id to their own account) — removed for that reason.

import { BadRequestException, Controller, Delete, NotFoundException, Param, UseGuards } from '@nestjs/common';
import type { OkResponse } from '@dashboard/shared';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtGuard } from './jwt.guard.js';
import { parseProviderSlug } from './oauth/provider.util.js';
import type { RequestUser } from './types.js';

@Controller('auth/identities')
@UseGuards(JwtGuard)
export class IdentitiesController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unlinks the caller's identity for the given provider slug.
   * @throws {@link NotFoundException} with `NOT_LINKED`; {@link BadRequestException} with `LAST_LOGIN_METHOD` when it is the only login method left.
   */
  @Delete(':provider')
  async unlink(@Param('provider') providerParam: string, @CurrentUser() currentUser: RequestUser): Promise<OkResponse> {
    const provider = parseProviderSlug(providerParam);

    const [user, identities] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: currentUser.id } }),
      this.prisma.authIdentity.findMany({ where: { userId: currentUser.id } }),
    ]);
    const target = identities.find((identity) => identity.provider === provider);
    if (!target) throw new NotFoundException({ error: 'NOT_LINKED' });

    const loginMethodCount = identities.length + (user.passwordHash ? 1 : 0);
    if (loginMethodCount <= 1) {
      throw new BadRequestException({ error: 'LAST_LOGIN_METHOD' });
    }

    await this.prisma.authIdentity.delete({ where: { id: target.id } });
    return { ok: true };
  }
}
