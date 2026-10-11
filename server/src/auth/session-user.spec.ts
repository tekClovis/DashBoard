import { describe, expect, it, vi } from 'vitest';
import { JwtService } from './jwt.service.js';
import { resolveSessionUser } from './session-user.js';

const EMAIL_VERIFIED_AT = new Date('2026-01-01T00:00:00Z');
const USER_ROW = {
  id: 'u1',
  email: 'a@b.com',
  role: 'USER',
  tokenVersion: 2,
  bannedAt: null,
  emailVerifiedAt: EMAIL_VERIFIED_AT,
  passwordHash: 'hash',
};

function setup(userRow: unknown = USER_ROW, revoked = false) {
  const jwt = new JwtService({ getOrThrow: () => 'test-secret' } as never);
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(userRow) } };
  const revocation = { isRevoked: vi.fn().mockResolvedValue(revoked) };
  const token = jwt.sign({ sub: 'u1', role: 'USER', tv: 2 });
  const resolve = (candidate = token) => resolveSessionUser(candidate, jwt, prisma as never, revocation as never);
  return { jwt, prisma, revocation, token, resolve };
}

describe('resolveSessionUser', () => {
  it('returns only the request-facing fields of the token owner', async () => {
    const { resolve, prisma, revocation, jwt, token } = setup();

    await expect(resolve()).resolves.toEqual({
      id: 'u1',
      email: 'a@b.com',
      role: 'USER',
      emailVerifiedAt: EMAIL_VERIFIED_AT,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(revocation.isRevoked).toHaveBeenCalledWith(jwt.verify(token)?.jti);
  });

  it('returns null for a token that does not verify, without touching the database', async () => {
    const { resolve, prisma, revocation, token } = setup();

    await expect(resolve(`${token}x`)).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(revocation.isRevoked).not.toHaveBeenCalled();
  });

  it('returns null for a revoked token', async () => {
    const { resolve } = setup(USER_ROW, true);

    await expect(resolve()).resolves.toBeNull();
  });

  it('returns null when the user no longer exists', async () => {
    const { resolve } = setup(null);

    await expect(resolve()).resolves.toBeNull();
  });

  it('returns null for a banned user', async () => {
    const { resolve } = setup({ ...USER_ROW, bannedAt: new Date() });

    await expect(resolve()).resolves.toBeNull();
  });

  it('returns null for an unverified user', async () => {
    const { resolve } = setup({ ...USER_ROW, emailVerifiedAt: null });

    await expect(resolve()).resolves.toBeNull();
  });

  it('returns null for a token superseded by logout-all (tokenVersion mismatch)', async () => {
    const { resolve } = setup({ ...USER_ROW, tokenVersion: 3 });

    await expect(resolve()).resolves.toBeNull();
  });
});
