import { describe, expect, it, vi } from 'vitest';
import { IdentitiesController } from './identities.controller.js';
import type { RequestWithUser } from './jwt.guard.js';

function makePrisma() {
  return {
    authIdentity: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function makeReq(user: Partial<RequestWithUser['user']>): RequestWithUser {
  return { user } as unknown as RequestWithUser;
}

describe('IdentitiesController', () => {
  describe('link', () => {
    it('links a new provider identity to the current user', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      const controller = new IdentitiesController(prisma as never);

      const res = await controller.link('github', { providerUserId: 'gh-9' }, makeReq({ id: 'u1' }));

      expect(res).toEqual({ ok: true });
      expect(prisma.authIdentity.create).toHaveBeenCalledWith({
        data: { userId: 'u1', provider: 'GITHUB', providerUserId: 'gh-9' },
      });
    });

    it('rejects an unknown provider', async () => {
      const prisma = makePrisma();
      const controller = new IdentitiesController(prisma as never);

      await expect(
        controller.link('bitbucket', { providerUserId: 'x' }, makeReq({ id: 'u1' })),
      ).rejects.toMatchObject({ response: { error: 'UNKNOWN_PROVIDER' } });
    });

    it('rejects linking an identity already claimed by another user', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findUnique.mockResolvedValue({ id: 'id1', userId: 'other-user' });
      const controller = new IdentitiesController(prisma as never);

      await expect(
        controller.link('github', { providerUserId: 'gh-9' }, makeReq({ id: 'u1' })),
      ).rejects.toMatchObject({ response: { error: 'IDENTITY_ALREADY_LINKED' } });
      expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    });

    it('is idempotent when the identity is already linked to the same user', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findUnique.mockResolvedValue({ id: 'id1', userId: 'u1' });
      const controller = new IdentitiesController(prisma as never);

      const res = await controller.link('github', { providerUserId: 'gh-9' }, makeReq({ id: 'u1' }));

      expect(res).toEqual({ ok: true });
      expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('unlinks a provider when another login method remains (password)', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findMany.mockResolvedValue([{ id: 'id1', provider: 'GITHUB', userId: 'u1' }]);
      const controller = new IdentitiesController(prisma as never);

      const res = await controller.unlink('github', makeReq({ id: 'u1', passwordHash: 'hash' }));

      expect(res).toEqual({ ok: true });
      expect(prisma.authIdentity.delete).toHaveBeenCalledWith({ where: { id: 'id1' } });
    });

    it('unlinks a provider when another identity remains', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findMany.mockResolvedValue([
        { id: 'id1', provider: 'GITHUB', userId: 'u1' },
        { id: 'id2', provider: 'GOOGLE', userId: 'u1' },
      ]);
      const controller = new IdentitiesController(prisma as never);

      const res = await controller.unlink('github', makeReq({ id: 'u1', passwordHash: null }));

      expect(res).toEqual({ ok: true });
      expect(prisma.authIdentity.delete).toHaveBeenCalledWith({ where: { id: 'id1' } });
    });

    it('rejects unlinking the sole remaining login method', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findMany.mockResolvedValue([{ id: 'id1', provider: 'GITHUB', userId: 'u1' }]);
      const controller = new IdentitiesController(prisma as never);

      await expect(
        controller.unlink('github', makeReq({ id: 'u1', passwordHash: null })),
      ).rejects.toMatchObject({ response: { error: 'LAST_LOGIN_METHOD' } });
      expect(prisma.authIdentity.delete).not.toHaveBeenCalled();
    });

    it('404s when the provider is not linked to this user', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findMany.mockResolvedValue([]);
      const controller = new IdentitiesController(prisma as never);

      await expect(
        controller.unlink('github', makeReq({ id: 'u1', passwordHash: 'hash' })),
      ).rejects.toMatchObject({ response: { error: 'NOT_LINKED' } });
    });
  });
});
