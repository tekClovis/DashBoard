// POST /api/auth/identities/{provider} (link), DELETE /api/auth/identities/{provider} (unlink)
// docs/Architecture.md §5.1: "A logged-in user can also link or unlink identities from
// Profile. The last remaining login method cannot be unlinked."

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { OkResponse } from '@dashboard/shared';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { LinkIdentityDto } from './dto/link-identity.dto.js';
import { JwtGuard, type RequestWithUser } from './jwt.guard.js';
import { parseProviderSlug } from './oauth/provider.util.js';

@Controller('auth/identities')
@UseGuards(JwtGuard)
export class IdentitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':provider')
  async link(
    @Param('provider') providerParam: string,
    @Body() dto: LinkIdentityDto,
    @Req() req: RequestWithUser,
  ): Promise<OkResponse> {
    const provider = parseProviderSlug(providerParam);

    const existing = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: dto.providerUserId } },
    });
    if (existing) {
      if (existing.userId === req.user.id) return { ok: true };
      throw new BadRequestException({ error: 'IDENTITY_ALREADY_LINKED' });
    }

    await this.prisma.authIdentity.create({
      data: { userId: req.user.id, provider, providerUserId: dto.providerUserId },
    });
    return { ok: true };
  }

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
