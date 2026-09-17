import type { ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { JwtGuard } from './jwt.guard.js';

const SECRET = 'test-secret';

function makeContext(cookies: Record<string, string | undefined>): ExecutionContext {
  const req = { cookies };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

function makeConfig() {
  return { getOrThrow: vi.fn().mockReturnValue(SECRET) };
}

describe('JwtGuard', () => {
  it('rejects when there is no session cookie', async () => {
    const prisma = { user: { findUnique: vi.fn() } };
    const guard = new JwtGuard(makeConfig() as never, prisma as never);

    await expect(guard.canActivate(makeContext({}))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a garbage cookie', async () => {
    const prisma = { user: { findUnique: vi.fn() } };
    const guard = new JwtGuard(makeConfig() as never, prisma as never);

    await expect(guard.canActivate(makeContext({ session: 'garbage' }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when the user is banned', async () => {
    const token = jwt.sign({ sub: 'u1', role: 'USER', tv: 0 }, SECRET);
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', bannedAt: new Date(), tokenVersion: 0 }) } };
    const guard = new JwtGuard(makeConfig() as never, prisma as never);

    await expect(guard.canActivate(makeContext({ session: token }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when tokenVersion no longer matches (logout-all)', async () => {
    const token = jwt.sign({ sub: 'u1', role: 'USER', tv: 0 }, SECRET);
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', bannedAt: null, tokenVersion: 1 }) } };
    const guard = new JwtGuard(makeConfig() as never, prisma as never);

    await expect(guard.canActivate(makeContext({ session: token }))).rejects.toMatchObject({ status: 401 });
  });

  it('attaches req.user and allows the request through for a valid cookie', async () => {
    const token = jwt.sign({ sub: 'u1', role: 'USER', tv: 0 }, SECRET);
    const user = { id: 'u1', bannedAt: null, tokenVersion: 0 };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
    const guard = new JwtGuard(makeConfig() as never, prisma as never);
    const req = { cookies: { session: token } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((req as { user?: unknown }).user).toEqual(user);
  });
});
