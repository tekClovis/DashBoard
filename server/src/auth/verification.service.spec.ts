import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { VerificationService } from './verification.service.js';

function makePrisma() {
  return {
    emailToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService & {
    emailToken: {
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    user: { update: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

describe('VerificationService', () => {
  describe('issueToken', () => {
    it('invalidates prior live tokens, then creates a new one', async () => {
      const prisma = makePrisma();
      const service = new VerificationService(prisma);

      const raw = await service.issueToken('user-1');

      expect(prisma.emailToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.emailToken.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
      expect(typeof raw).toBe('string');
      expect(raw.length).toBeGreaterThan(0);
    });
  });

  describe('confirm', () => {
    it('throws INVALID_TOKEN when no matching token exists', async () => {
      const prisma = makePrisma();
      prisma.emailToken.findUnique.mockResolvedValue(null);
      const service = new VerificationService(prisma);

      await expect(service.confirm('bogus')).rejects.toMatchObject({
        response: { error: 'INVALID_TOKEN' },
      });
    });

    it('throws TOKEN_EXPIRED when the token has expired', async () => {
      const prisma = makePrisma();
      prisma.emailToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      });
      const service = new VerificationService(prisma);

      await expect(service.confirm('raw')).rejects.toMatchObject({
        response: { error: 'TOKEN_EXPIRED' },
      });
    });

    it('throws TOKEN_EXPIRED (not a distinct code) when the token was already used', async () => {
      const prisma = makePrisma();
      prisma.emailToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 1000 * 60),
        usedAt: new Date(),
      });
      const service = new VerificationService(prisma);

      await expect(service.confirm('raw')).rejects.toMatchObject({
        response: { error: 'TOKEN_EXPIRED' },
      });
    });

    it('marks the user verified and the token used on a valid token', async () => {
      const prisma = makePrisma();
      prisma.emailToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 1000 * 60),
        usedAt: null,
      });
      const service = new VerificationService(prisma);

      await service.confirm('raw');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(prisma.emailToken.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { usedAt: expect.any(Date) },
      });
    });
  });
});
