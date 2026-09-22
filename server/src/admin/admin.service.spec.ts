import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../auth/types.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { AdminService, escapeLike, normalizeId } from './admin.service.js';

const ID = '3f2a9c1e-5b7d-4e8f-9a1b-0c2d3e4f5a6b';
const actor: RequestUser = { id: ID, email: 'a@b.c', role: 'ADMIN', emailVerifiedAt: null };

function setup() {
  const prisma = { user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } };
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
