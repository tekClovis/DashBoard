import { describe, expect, it, vi } from 'vitest';
import { IdentitiesController } from './identities.controller.js';
import type { RequestUser } from './types.js';

function makePrisma() {
  return {
    user: {
      findUniqueOrThrow: vi.fn(),
    },
    authIdentity: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function makeCurrentUser(id: string): RequestUser {
  return { id, email: 'user@example.com', role: 'USER', emailVerifiedAt: new Date() } as RequestUser;
}

describe('IdentitiesController', () => {
  describe('unlink', () => {
    it('unlinks a provider when another login method remains (password)', async () => {
      const prisma = makePrisma();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: 'hash' });
      prisma.authIdentity.findMany.mockResolvedValue([{ id: 'id1', provider: 'GITHUB', userId: 'u1' }]);
      const controller = new IdentitiesController(prisma as never);

      const res = await controller.unlink('github', makeCurrentUser('u1'));

      expect(res).toEqual({ ok: true });
      expect(prisma.authIdentity.delete).toHaveBeenCalledWith({ where: { id: 'id1' } });
    });

    it('unlinks a provider when another identity remains', async () => {
      const prisma = makePrisma();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: null });
      prisma.authIdentity.findMany.mockResolvedValue([
        { id: 'id1', provider: 'GITHUB', userId: 'u1' },
        { id: 'id2', provider: 'GOOGLE', userId: 'u1' },
      ]);
      const controller = new IdentitiesController(prisma as never);

      const res = await controller.unlink('github', makeCurrentUser('u1'));

      expect(res).toEqual({ ok: true });
      expect(prisma.authIdentity.delete).toHaveBeenCalledWith({ where: { id: 'id1' } });
    });

    it('rejects unlinking the sole remaining login method', async () => {
      const prisma = makePrisma();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: null });
      prisma.authIdentity.findMany.mockResolvedValue([{ id: 'id1', provider: 'GITHUB', userId: 'u1' }]);
      const controller = new IdentitiesController(prisma as never);

      await expect(controller.unlink('github', makeCurrentUser('u1'))).rejects.toMatchObject({
        response: { error: 'LAST_LOGIN_METHOD' },
      });
      expect(prisma.authIdentity.delete).not.toHaveBeenCalled();
    });

    it('404s when the provider is not linked to this user', async () => {
      const prisma = makePrisma();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: 'hash' });
      prisma.authIdentity.findMany.mockResolvedValue([]);
      const controller = new IdentitiesController(prisma as never);

      await expect(controller.unlink('github', makeCurrentUser('u1'))).rejects.toMatchObject({
        response: { error: 'NOT_LINKED' },
      });
    });
  });
});
