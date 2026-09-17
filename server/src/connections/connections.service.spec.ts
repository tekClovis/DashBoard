import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { ConnectionsService } from './connections.service.js';
import type { TokenCipherService } from './token-cipher.service.js';

function makePrisma() {
  return {
    serviceConnection: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService & {
    serviceConnection: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
}

function makeCipher() {
  return {
    encrypt: vi.fn((plain: string) => `enc(${plain})`),
    decrypt: vi.fn((stored: string) => stored.replace(/^enc\(|\)$/g, '')),
  } as unknown as TokenCipherService & {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };
}

describe('ConnectionsService', () => {
  describe('list', () => {
    it('always reports weather as connected, and connected:false for services with no row', async () => {
      const prisma = makePrisma();
      const service = new ConnectionsService(prisma, makeCipher());

      const result = await service.list('user-1');

      expect(result.connections).toEqual([
        { service: 'weather', connected: true, status: 'OK' },
        { service: 'github', connected: false, status: 'OK' },
        { service: 'steam', connected: false, status: 'OK' },
        { service: 'youtube', connected: false, status: 'OK' },
      ]);
    });

    it('reports connected:true and the stored status for a service with a row', async () => {
      const prisma = makePrisma();
      prisma.serviceConnection.findMany.mockResolvedValue([{ service: 'github', status: 'REAUTH' }]);
      const service = new ConnectionsService(prisma, makeCipher());

      const result = await service.list('user-1');

      expect(result.connections).toContainEqual({ service: 'github', connected: true, status: 'REAUTH' });
    });
  });

  describe('disconnect', () => {
    it('deletes the row scoped to the user and service', async () => {
      const prisma = makePrisma();
      const service = new ConnectionsService(prisma, makeCipher());

      await service.disconnect('user-1', 'github');

      expect(prisma.serviceConnection.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', service: 'github' },
      });
    });
  });

  describe('upsertOAuthConnection', () => {
    it('encrypts both tokens before persisting, and upserts on (userId, service)', async () => {
      const prisma = makePrisma();
      const cipher = makeCipher();
      const service = new ConnectionsService(prisma, cipher);

      await service.upsertOAuthConnection('user-1', 'github', {
        externalAccountId: 'gh-123',
        accessToken: 'raw-access-token',
        refreshToken: 'raw-refresh-token',
        scopes: ['repo', 'security_events'],
      });

      expect(cipher.encrypt).toHaveBeenCalledWith('raw-access-token');
      expect(cipher.encrypt).toHaveBeenCalledWith('raw-refresh-token');
      expect(prisma.serviceConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_service: { userId: 'user-1', service: 'github' } },
          create: expect.objectContaining({
            userId: 'user-1',
            service: 'github',
            externalAccountId: 'gh-123',
            accessTokenEnc: 'enc(raw-access-token)',
            refreshTokenEnc: 'enc(raw-refresh-token)',
            status: 'OK',
          }),
        }),
      );
    });

    it('always routes the raw token through the cipher before building the persisted row', async () => {
      const prisma = makePrisma();
      const cipher = makeCipher();
      const service = new ConnectionsService(prisma, cipher);

      await service.upsertOAuthConnection('user-1', 'github', {
        externalAccountId: 'gh-123',
        accessToken: 'raw-access-token',
        scopes: [],
      });

      // The real encryption guarantee (ciphertext != plaintext) is covered by
      // token-cipher.service.spec.ts against the actual AES-256-GCM cipher;
      // here we just confirm the service never bypasses it.
      const call = prisma.serviceConnection.upsert.mock.calls[0][0];
      expect(call.create.accessTokenEnc).toBe(cipher.encrypt('raw-access-token'));
      expect(cipher.encrypt).toHaveBeenCalledWith('raw-access-token');
    });
  });

  describe('upsertSteamConnection', () => {
    it('stores the SteamID64 as externalAccountId with no token fields', async () => {
      const prisma = makePrisma();
      const service = new ConnectionsService(prisma, makeCipher());

      await service.upsertSteamConnection('user-1', '76561198000000000');

      expect(prisma.serviceConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_service: { userId: 'user-1', service: 'steam' } },
          create: expect.objectContaining({
            userId: 'user-1',
            service: 'steam',
            externalAccountId: '76561198000000000',
            accessTokenEnc: null,
            refreshTokenEnc: null,
          }),
        }),
      );
    });
  });
});
