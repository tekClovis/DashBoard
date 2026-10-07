import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../auth/types.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const actor = (role: RequestUser['role']): RequestUser => ({ id: 'u1', email: 'a@b.c', role, emailVerifiedAt: null });

function setup(otherAdmins = 0) {
  const tx = { user: { count: vi.fn().mockResolvedValue(otherAdmins), delete: vi.fn().mockResolvedValue({}) } };
  const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)) };
  const disconnectUser = vi.fn();
  const service = new UsersService(prisma as unknown as PrismaService, { disconnectUser });
  return { tx, service, disconnectUser };
}

describe('UsersService.deleteSelf', () => {
  it('deletes the caller and disconnects their sockets', async () => {
    const { tx, service, disconnectUser } = setup();
    await service.deleteSelf(actor('USER'));
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(disconnectUser).toHaveBeenCalledWith('u1');
  });

  it('lets an admin delete themself when another admin remains', async () => {
    const { tx, service } = setup(1);
    await service.deleteSelf(actor('ADMIN'));
    expect(tx.user.delete).toHaveBeenCalled();
  });

  it('refuses with 409 LAST_ADMIN when the caller is the only admin', async () => {
    const { tx, service, disconnectUser } = setup(0);
    const err = await service.deleteSelf(actor('ADMIN')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toEqual({ error: 'LAST_ADMIN' });
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(disconnectUser).not.toHaveBeenCalled();
  });
});
