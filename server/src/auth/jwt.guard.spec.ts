import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { JwtGuard } from './jwt.guard.js';

function makeContext(req: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(userRow: unknown, verifyResult: unknown) {
  const jwt = { verify: vi.fn().mockReturnValue(verifyResult) };
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(userRow) } };
  const guard = new JwtGuard(jwt as never, prisma as never);
  return { guard, jwt, prisma };
}

describe('JwtGuard', () => {
  it('rejects when there is no cookie', async () => {
    const { guard } = makeGuard(null, null);
    const req = { headers: {} } as Request;

    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a garbage cookie', async () => {
    const { guard } = makeGuard(null, null);
    const req = { headers: { cookie: 'session=garbage' } } as Request;

    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when the user no longer exists', async () => {
    const { guard } = makeGuard(null, { sub: 'u1', role: 'USER', tv: 0, exp: 9999999999 });
    const req = { headers: { cookie: 'session=valid' } } as Request;

    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a banned user', async () => {
    const { guard } = makeGuard(
      { id: 'u1', email: 'a@b.com', role: 'USER', tokenVersion: 0, bannedAt: new Date(), emailVerifiedAt: new Date() },
      { sub: 'u1', role: 'USER', tv: 0, exp: 9999999999 },
    );
    const req = { headers: { cookie: 'session=valid' } } as Request;

    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token superseded by logout-all (tokenVersion mismatch)', async () => {
    const { guard } = makeGuard(
      { id: 'u1', email: 'a@b.com', role: 'USER', tokenVersion: 1, bannedAt: null, emailVerifiedAt: new Date() },
      { sub: 'u1', role: 'USER', tv: 0, exp: 9999999999 },
    );
    const req = { headers: { cookie: 'session=valid' } } as Request;

    await expect(guard.canActivate(makeContext(req))).rejects.toMatchObject({ status: 401 });
  });

  it('attaches req.user and allows the request through on a valid session', async () => {
    const emailVerifiedAt = new Date();
    const { guard } = makeGuard(
      { id: 'u1', email: 'a@b.com', role: 'USER', tokenVersion: 0, bannedAt: null, emailVerifiedAt },
      { sub: 'u1', role: 'USER', tv: 0, exp: 9999999999 },
    );
    const req = { headers: { cookie: 'session=valid' } } as Request;

    const allowed = await guard.canActivate(makeContext(req));

    expect(allowed).toBe(true);
    expect(req.user).toEqual({ id: 'u1', email: 'a@b.com', role: 'USER', emailVerifiedAt });
  });
});
