import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../auth/types.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { AdminService, escapeLike, normalizeId } from './admin.service.js';

const ID = '3f2a9c1e-5b7d-4e8f-9a1b-0c2d3e4f5a6b';
const actor: RequestUser = { id: ID, email: 'a@b.c', role: 'ADMIN', emailVerifiedAt: null };

function setup() {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown, _options?: unknown) => fn(prisma)),
  };
  const disconnectUser = vi.fn();
  const service = new AdminService(prisma as unknown as PrismaService, { disconnectUser });
  return { prisma, service, disconnectUser };
}

describe('normalizeId', () => {
  it('lowercases so an uppercase UUID equals the canonical one', () => {
    expect(normalizeId(ID.toUpperCase())).toBe(ID);
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});

describe('AdminService self-guard', () => {
  it('rejects an uppercase own id on ban, demote and delete without touching the DB', async () => {
    const { prisma, service, disconnectUser } = setup();
    const upper = ID.toUpperCase();

    await expect(service.update(actor, upper, { bannedAt: new Date().toISOString() })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(actor, upper, { role: 'USER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(actor, upper)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(disconnectUser).not.toHaveBeenCalled();
  });

  it('queries and disconnects with the normalised id', async () => {
    const { prisma, service, disconnectUser } = setup();
    const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    prisma.user.delete.mockResolvedValue({});

    await service.remove(actor, other.toUpperCase());

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: other } });
    expect(disconnectUser).toHaveBeenCalledWith(other);
  });
});

describe('AdminService last-admin guard', () => {
  const target = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const updatedRow = { id: target, email: 'x@y.z', role: 'USER', bannedAt: null, createdAt: new Date() };

  it.each([
    ['demoting', { role: 'USER' as const }],
    ['banning', { bannedAt: '2026-01-01T00:00:00.000Z' }],
  ])('refuses %s the last active admin with 409 and writes nothing', async (_label, dto) => {
    const { prisma, service, disconnectUser } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', bannedAt: null });
    prisma.user.count.mockResolvedValue(0);

    await expect(service.update(actor, target, dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'LAST_ADMIN' },
    });

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: 'ADMIN', bannedAt: null, id: { not: target } },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(disconnectUser).not.toHaveBeenCalled();
  });

  it('runs the check and the write in one serializable transaction', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', bannedAt: null });
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue(updatedRow);

    await service.update(actor, target, { role: 'USER' });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('allows demoting an admin while another active admin remains', async () => {
    const { prisma, service, disconnectUser } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', bannedAt: null });
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue(updatedRow);

    await expect(service.update(actor, target, { role: 'USER' })).resolves.toMatchObject({ id: target });
    expect(disconnectUser).toHaveBeenCalledWith(target);
  });

  it('does not count admins when the target is not an active admin', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'USER', bannedAt: null });
    prisma.user.update.mockResolvedValue(updatedRow);

    await service.update(actor, target, { bannedAt: '2026-01-01T00:00:00.000Z' });

    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('maps a serialization failure of a concurrent demote to 409', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', bannedAt: null });
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockRejectedValue(Object.assign(new Error('write conflict'), { code: 'P2034' }));

    await expect(service.update(actor, target, { role: 'USER' })).rejects.toMatchObject({ status: 409 });
  });
});
