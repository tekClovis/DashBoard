import { describe, expect, it, vi } from 'vitest';
import { AdminSeedService } from './admin-seed.service.js';

function makeService(env: Record<string, string | undefined>) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const config = { get: vi.fn((key: string) => env[key]) };
  const service = new AdminSeedService(prisma as never, config as never);
  return { service, prisma, config };
}

describe('AdminSeedService', () => {
  it('does nothing when ADMIN_EMAIL/ADMIN_PASSWORD are not both set', async () => {
    const { service, prisma } = makeService({ ADMIN_EMAIL: 'admin@b.com' });

    await service.onApplicationBootstrap();

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does nothing when an admin already exists', async () => {
    const { service, prisma } = makeService({ ADMIN_EMAIL: 'admin@b.com', ADMIN_PASSWORD: 'x' });
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-admin' });

    await service.onApplicationBootstrap();

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing user that happens to match ADMIN_EMAIL', async () => {
    const { service, prisma } = makeService({ ADMIN_EMAIL: 'admin@b.com', ADMIN_PASSWORD: 'x' });
    prisma.user.findUnique.mockResolvedValue({ id: 'some-existing-user', role: 'USER' });

    await service.onApplicationBootstrap();

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'admin@b.com' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a pre-confirmed admin when none exists', async () => {
    const { service, prisma } = makeService({ ADMIN_EMAIL: ' Admin@B.com ', ADMIN_PASSWORD: 'super-secret' });

    await service.onApplicationBootstrap();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { role: 'ADMIN' } });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'admin@b.com' } });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'admin@b.com',
        role: 'ADMIN',
        emailVerifiedAt: expect.any(Date),
        passwordHash: expect.any(String),
      }),
    });
  });
});
