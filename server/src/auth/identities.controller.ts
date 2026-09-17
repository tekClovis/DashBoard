// DELETE /api/auth/identities/{provider} (unlink)
// docs/Architecture.md §5.1: "A logged-in user can also link or unlink identities from
// Profile. The last remaining login method cannot be unlinked."
//
// Linking is NOT done here: it requires a completed OAuth handshake (GET
// /api/oauth/{provider}/start?intent=link -> callback), which proves the caller actually
// owns the provider account. There used to be a POST here that accepted a raw client-supplied
// providerUserId with no such proof — an account-takeover vector (a client could pre-link a
// victim's real provider id to their own account) — removed for that reason.

import { BadRequestException, Controller, Delete, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import type { OkResponse } from '@dashboard/shared';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { JwtGuard, type RequestWithUser } from './jwt.guard.js';
import { parseProviderSlug } from './oauth/provider.util.js';

@Controller('auth/identities')
@UseGuards(JwtGuard)
export class IdentitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Delete(':provider')
  async unlink(@Param('provider') providerParam: string, @Req() req: RequestWithUser): Promise<OkResponse> {
    const provider = parseProviderSlug(providerParam);

    const identities = await this.prisma.authIdentity.findMany({ where: { userId: req.user.id } });
    const target = identities.find((identity) => identity.provider === provider);
    if (!target) throw new NotFoundException({ error: 'NOT_LINKED' });

    const loginMethodCount = identities.length + (req.user.passwordHash ? 1 : 0);
    if (loginMethodCount <= 1) {
      throw new BadRequestException({ error: 'LAST_LOGIN_METHOD' });
    }

    await this.prisma.authIdentity.delete({ where: { id: target.id } });
    return { ok: true };
  }
}
