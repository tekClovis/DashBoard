import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { PasswordResetService } from './password-reset.service.js';

function makePrisma() {
  const tx = {
    passwordResetToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    passwordResetToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    tx,
  };
  return prisma;
}

const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');
const live = { id: 't1', userId: 'u1', expiresAt: new Date(Date.now() + 60_000), usedAt: null };

describe('PasswordResetService', () => {
  describe('issueToken', () => {
    it('invalidates prior live tokens, stores only the hash with a 1 h TTL, returns the raw token', async () => {
      const prisma = makePrisma();
      const service = new PasswordResetService(prisma as unknown as PrismaService);

      const raw = await service.issueToken('u1');

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      const data = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe('u1');
      expect(data.tokenHash).toBe(sha(raw));
      expect(JSON.stringify(data)).not.toContain(raw);
      const ttl = data.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(59 * 60_000);
      expect(ttl).toBeLessThanOrEqual(60 * 60_000);
      expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    });
  });

  describe('reset', () => {
    it('sets the hash, bumps tokenVersion, verifies the email, burns the token and the others', async () => {
      const prisma = makePrisma();
      prisma.passwordResetToken.findUnique.mockResolvedValue(live);
      const service = new PasswordResetService(prisma as unknown as PrismaService);

      await service.reset('raw', 'new-hash');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha('raw') } });
      expect(prisma.tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 } },
      });
      expect(prisma.tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', emailVerifiedAt: null },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(prisma.tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it.each([
      ['unknown token', null],
      ['expired token', { ...live, expiresAt: new Date(Date.now() - 1) }],
      ['used token', { ...live, usedAt: new Date() }],
    ])('rejects an %s with 400 and changes nothing', async (_n, row) => {
      const prisma = makePrisma();
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);
      const service = new PasswordResetService(prisma as unknown as PrismaService);

      await expect(service.reset('raw', 'h')).rejects.toMatchObject({ status: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when a concurrent request already consumed the token', async () => {
      const prisma = makePrisma();
      prisma.passwordResetToken.findUnique.mockResolvedValue(live);
      prisma.tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      const service = new PasswordResetService(prisma as unknown as PrismaService);

      await expect(service.reset('raw', 'h')).rejects.toMatchObject({ status: 400 });
    });
  });
});
