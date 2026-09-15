import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Invalidates any live token for the user, then issues and stores a new one. Returns the raw token. */
  async issueToken(userId: string): Promise<string> {
    await this.invalidatePriorTokens(userId);

    const raw = randomBytes(32).toString('base64url');
    await this.prisma.emailToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    return raw;
  }

  /** Sets usedAt=now() on any still-live token for the user, per docs/auth/specs.md §Token invalidation. */
  async invalidatePriorTokens(userId: string): Promise<void> {
    await this.prisma.emailToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
  }

  /** Validates the raw token and marks the user verified. Throws 400 INVALID_TOKEN/TOKEN_EXPIRED. */
  async confirm(rawToken: string): Promise<void> {
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!token) {
      throw new BadRequestException({ error: 'INVALID_TOKEN' });
    }
    if (token.expiresAt < new Date() || token.usedAt !== null) {
      throw new BadRequestException({ error: 'TOKEN_EXPIRED' });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
