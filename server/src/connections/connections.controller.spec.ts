import type { ConfigService } from '@nestjs/config';
import type { ConnectionsResponse } from '@dashboard/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../auth/types.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';
import type { TokenCipherService } from './token-cipher.service.js';

const user = { id: 'user-1' } as RequestUser;

const env: Record<string, string> = { GITHUB_CLIENT_ID: 'login-id', GITHUB_CLIENT_SECRET: 'login-secret' };
const config = { get: (key: string) => env[key] } as unknown as ConfigService;

function makeService(existing: { accessToken: string | null; refreshToken: string | null } | null = null) {
  return {
    list: vi.fn(),
    findForRevoke: vi.fn().mockResolvedValue(existing),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function makeController(service: ReturnType<typeof makeService>): ConnectionsController {
  return new ConnectionsController(service as unknown as ConnectionsService, config);
}

describe('ConnectionsController', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** The access token sent to the provider by the single outbound revoke request. */
  function revokedToken(): unknown {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return (JSON.parse(init.body as string) as { access_token: unknown }).access_token;
  }

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('list', () => {
    it("returns the service's connections for the current user", async () => {
      const service = makeService();
      service.list.mockResolvedValue({ connections: [{ service: 'github', connected: true, status: 'OK' }] });

      const result: ConnectionsResponse = await makeController(service).list(user);

      expect(result).toEqual({ connections: [{ service: 'github', connected: true, status: 'OK', configured: true }] });
      expect(service.list).toHaveBeenCalledWith('user-1');
    });

    it('flags a service whose provider credentials are missing as not configured', async () => {
      const service = makeService();
      service.list.mockResolvedValue({
        connections: [
          { service: 'weather', connected: true, status: 'OK' },
          { service: 'github', connected: false, status: 'OK' },
          { service: 'youtube', connected: false, status: 'OK' },
          { service: 'steam', connected: false, status: 'OK' },
        ],
      });

      const { connections } = await makeController(service).list(user);

      expect(connections.map((c) => [c.service, c.configured])).toEqual([
        ['weather', true],
        ['github', true],
        ['youtube', false],
        ['steam', false],
      ]);
    });
  });

  describe('disconnect', () => {
    it("deletes the current user's connection and revokes its token at the provider", async () => {
      const service = makeService({ accessToken: 'gho_token', refreshToken: null });

      const result = await makeController(service).disconnect('github', user);

      expect(result).toEqual({ ok: true });
      expect(service.findForRevoke).toHaveBeenCalledWith('user-1', 'github');
      expect(service.disconnect).toHaveBeenCalledWith('user-1', 'github');
      expect(revokedToken()).toBe('gho_token');
    });

    it('is idempotent when nothing is connected: still ok, no provider call', async () => {
      const service = makeService(null);

      const result = await makeController(service).disconnect('github', user);

      expect(result).toEqual({ ok: true });
      expect(service.disconnect).toHaveBeenCalledWith('user-1', 'github');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still succeeds when the provider revoke request fails', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const service = makeService({ accessToken: 'ya29-token', refreshToken: '1//refresh' });

      const result = await makeController(service).disconnect('youtube', user);

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(service.disconnect).toHaveBeenCalledWith('user-1', 'youtube');
    });

    it('does not revoke at the provider when the local delete fails', async () => {
      const service = makeService({ accessToken: 'gho_token', refreshToken: null });
      service.disconnect.mockRejectedValue(new Error('db down'));

      await expect(makeController(service).disconnect('github', user)).rejects.toThrow('db down');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('with the real service over stored tokens', () => {
    // Real ConnectionsService over a stateful fake Prisma whose row carries tokens, so a leak
    // between the stored row and the response body, or a lookup after the delete, is caught.
    function makeRealController(): ConnectionsController {
      let row: Record<string, string> | null = {
        userId: 'user-1',
        service: 'github',
        status: 'OK',
        accessTokenEnc: 'enc(gho_secret_access)',
        refreshTokenEnc: 'enc(ghr_secret_refresh)',
      };
      const prisma = {
        serviceConnection: {
          findMany: async () => (row ? [row] : []),
          findUnique: async () => row,
          deleteMany: async () => {
            row = null;
            return { count: 1 };
          },
        },
      } as unknown as PrismaService;
      const cipher = {
        decrypt: (stored: string) => stored.replace(/^enc\(|\)$/g, ''),
      } as unknown as TokenCipherService;
      return new ConnectionsController(new ConnectionsService(prisma, cipher), config);
    }

    it('never returns raw or encrypted tokens from list', async () => {
      const result = await makeRealController().list(user);

      expect(result.connections).toContainEqual({ service: 'github', connected: true, status: 'OK', configured: true });
      expect(JSON.stringify(result)).not.toMatch(/secret_access|secret_refresh/);
    });

    it('revokes a youtube connection with the decrypted refresh token of the deleted row', async () => {
      const result = await makeRealController().disconnect('youtube', user);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://oauth2.googleapis.com/revoke?token=ghr_secret_refresh');
      expect(result).toEqual({ ok: true });
    });

    it('revokes the decrypted token of the deleted row without returning it', async () => {
      const controller = makeRealController();

      const result = await controller.disconnect('github', user);

      expect(revokedToken()).toBe('gho_secret_access');
      expect(result).toEqual({ ok: true });
      expect((await controller.list(user)).connections).toContainEqual({ service: 'github', connected: false, status: 'OK', configured: true });
    });
  });
});
