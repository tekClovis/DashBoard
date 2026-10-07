import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service.js';

const TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) {}

  /** Invalidates any unused token for the user, then issues and stores a new one. Returns the raw token. */
  async issueToken(userId: string): Promise<string> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    });
    return raw;
  }

  /**
   * Consumes the token and applies the new password hash; bumps tokenVersion (logs out every session)
   * and burns the user's other unused tokens. Throws 400 INVALID_TOKEN for an unknown, used or expired token.
   */
  async reset(rawToken: string, passwordHash: string): Promise<void> {
    const token = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.usedAt !== null || token.expiresAt < new Date()) {
      throw new BadRequestException({ error: 'INVALID_TOKEN' });
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional claim: of two concurrent requests with the same token only one gets count 1.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new BadRequestException({ error: 'INVALID_TOKEN' });
      }
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
