import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenCipherService } from '../../connections/token-cipher.service.js';
import type { PrismaService } from '../../core/prisma/prisma.service.js';
import { GoogleTokenRefresher } from './google-token-refresher.js';

const env: Record<string, string> = {
  TOKEN_ENC_KEY: randomBytes(32).toString('base64'),
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csecret',
};
const config = { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] } as unknown as ConfigService;
const cipher = new TokenCipherService(config);

function setup(refreshTokenEnc: string | null = cipher.encrypt('refresh-1')) {
  const serviceConnection = {
    findUnique: vi.fn().mockResolvedValue({ id: 'conn-1', refreshTokenEnc }),
    update: vi.fn().mockResolvedValue({}),
  };
  const refresher = new GoogleTokenRefresher(config, { serviceConnection } as unknown as PrismaService, cipher);
  return { refresher, serviceConnection };
}

function stubTokenEndpoint(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GoogleTokenRefresher', () => {
  it('exchanges the decrypted refresh token and persists the new access token encrypted, with its expiry', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-23T10:00:00Z'), toFake: ['Date'] });
    const { refresher, serviceConnection } = setup();
    const fetchMock = stubTokenEndpoint(Response.json({ access_token: 'access-2', expires_in: 3600 }));

    await expect(refresher.refresh('u1')).resolves.toBe('access-2');

    expect(serviceConnection.findUnique).toHaveBeenCalledWith({ where: { userId_service: { userId: 'u1', service: 'youtube' } } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      client_id: 'cid',
      client_secret: 'csecret',
      refresh_token: 'refresh-1',
      grant_type: 'refresh_token',
    });
    const { where, data } = serviceConnection.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'conn-1' });
    expect(cipher.decrypt(data.accessTokenEnc)).toBe('access-2');
    expect(data.expiresAt).toEqual(new Date('2026-09-23T11:00:00Z'));
    expect(data).not.toHaveProperty('refreshTokenEnc');
  });

  it('stores a rotated refresh token when Google returns one', async () => {
    const { refresher, serviceConnection } = setup();
    stubTokenEndpoint(Response.json({ access_token: 'a', expires_in: 60, refresh_token: 'refresh-2' }));

    await refresher.refresh('u1');

    expect(cipher.decrypt(serviceConnection.update.mock.calls[0][0].data.refreshTokenEnc)).toBe('refresh-2');
  });

  it.each([400, 401])('a %i from the token endpoint (revoked grant) is REAUTH_REQUIRED and persists nothing', async (status) => {
    const { refresher, serviceConnection } = setup();
    stubTokenEndpoint(Response.json({ error: 'invalid_grant' }, { status }));

    await expect(refresher.refresh('u1')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(serviceConnection.update).not.toHaveBeenCalled();
  });

  it('a 5xx from the token endpoint is UPSTREAM_ERROR', async () => {
    const { refresher } = setup();
    stubTokenEndpoint(new Response('down', { status: 503 }));

    await expect(refresher.refresh('u1')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('shares one in-flight refresh between concurrent callers for the same user', async () => {
    const { refresher, serviceConnection } = setup();
    const fetchMock = stubTokenEndpoint(Response.json({ access_token: 'shared', expires_in: 60 }));

    await expect(Promise.all([refresher.refresh('u1'), refresher.refresh('u1')])).resolves.toEqual(['shared', 'shared']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serviceConnection.update).toHaveBeenCalledTimes(1);
  });

  it('without a stored refresh token it is REAUTH_REQUIRED, without calling Google', async () => {
    const { refresher } = setup(null);
    const fetchMock = stubTokenEndpoint(Response.json({}));

    await expect(refresher.refresh('u1')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
