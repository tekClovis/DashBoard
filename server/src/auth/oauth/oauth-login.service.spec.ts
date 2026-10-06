import { describe, expect, it, vi } from 'vitest';
import { OAuthIdentityConflictError, OAuthLinkRefusedError, OAuthLoginService, OAuthNoAccountError } from './oauth-login.service.js';
import type { NormalizedOAuthProfile } from './normalized-profile.js';

function makePrisma() {
  const tx = makePrismaTxProxy();
  return {
    authIdentity: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    tx,
  };
}

function makePrismaTxProxy() {
  return {
    user: { create: vi.fn().mockResolvedValue({ id: 'new-user', email: 'new@x.com' }) },
    authIdentity: { create: vi.fn() },
    dashboard: { create: vi.fn() },
  };
}

function profile(overrides: Partial<NormalizedOAuthProfile> = {}): NormalizedOAuthProfile {
  return {
    provider: 'GITHUB',
    providerUserId: 'gh-1',
    email: 'user@example.com',
    emailVerified: true,
    ...overrides,
  };
}

describe('OAuthLoginService', () => {
  it('logs in the existing identity owner without creating anything', async () => {
    const prisma = makePrisma();
    const user = { id: 'u1', email: 'user@example.com' };
    prisma.authIdentity.findUnique.mockResolvedValue({ id: 'id1', user });

    const service = new OAuthLoginService(prisma as never);
    const result = await service.loginOrLink(profile());

    expect(result).toBe(user);
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('auto-links when the provider email is verified and the local user is confirmed', async () => {
    const prisma = makePrisma();
    prisma.authIdentity.findUnique.mockResolvedValue(null);
    const existingUser = { id: 'u2', email: 'user@example.com', emailVerifiedAt: new Date() };
    prisma.user.findUnique.mockResolvedValue(existingUser);

    const service = new OAuthLoginService(prisma as never);
    const result = await service.loginOrLink(profile({ emailVerified: true }));

    expect(result).toBe(existingUser);
    expect(prisma.authIdentity.create).toHaveBeenCalledWith({
      data: { userId: 'u2', provider: 'GITHUB', providerUserId: 'gh-1' },
    });
  });

  it('refuses when the local user is unconfirmed, without creating an identity', async () => {
    const prisma = makePrisma();
    prisma.authIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'u3', email: 'user@example.com', emailVerifiedAt: null });

    const service = new OAuthLoginService(prisma as never);

    await expect(service.loginOrLink(profile({ emailVerified: true }))).rejects.toBeInstanceOf(
      OAuthLinkRefusedError,
    );
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
  });

  it('refuses when the provider reports the email unverified, even if the local user is confirmed', async () => {
    const prisma = makePrisma();
    prisma.authIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'u4', email: 'user@example.com', emailVerifiedAt: new Date() });

    const service = new OAuthLoginService(prisma as never);

    await expect(service.loginOrLink(profile({ emailVerified: false }))).rejects.toBeInstanceOf(
      OAuthLinkRefusedError,
    );
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
  });

  it.each([
    ['no local user has the email', 'brandnew@example.com'],
    ['the provider shares no email', null],
  ])('refuses without creating anything when %s', async (_label, email) => {
    const prisma = makePrisma();
    prisma.authIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    const service = new OAuthLoginService(prisma as never);

    await expect(service.loginOrLink(profile({ email }))).rejects.toBeInstanceOf(OAuthNoAccountError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.authIdentity.create).not.toHaveBeenCalled();
  });

  describe('linkIdentity', () => {
    it('creates the identity for the authenticated user when unclaimed', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      const service = new OAuthLoginService(prisma as never);

      await service.linkIdentity('u1', profile());

      expect(prisma.authIdentity.create).toHaveBeenCalledWith({
        data: { userId: 'u1', provider: 'GITHUB', providerUserId: 'gh-1' },
      });
    });

    it('is idempotent when already linked to the same user', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findUnique.mockResolvedValue({ id: 'id1', userId: 'u1' });
      const service = new OAuthLoginService(prisma as never);

      await service.linkIdentity('u1', profile());

      expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    });

    it('rejects when the provider identity is already linked to a different user', async () => {
      const prisma = makePrisma();
      prisma.authIdentity.findUnique.mockResolvedValue({ id: 'id1', userId: 'someone-else' });
      const service = new OAuthLoginService(prisma as never);

      await expect(service.linkIdentity('u1', profile())).rejects.toBeInstanceOf(OAuthIdentityConflictError);
      expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    });
  });
});
