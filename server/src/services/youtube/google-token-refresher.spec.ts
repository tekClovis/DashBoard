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
  const row = { id: 'conn-1', refreshTokenEnc };
  const serviceConnection = {
    findUnique: vi.fn().mockResolvedValue(row),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const refresher = new GoogleTokenRefresher(config, { serviceConnection } as unknown as PrismaService, cipher);
  // A disconnect/reconnect during the exchange: the compare-and-set misses, and a re-read finds `after`.
  const rowAfterExchange = (after: object | null) => {
    serviceConnection.updateMany.mockResolvedValue({ count: 0 });
    serviceConnection.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce(after);
  };
  return { refresher, serviceConnection, row, rowAfterExchange };
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
    const { refresher, serviceConnection, row } = setup();
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
    const { where, data } = serviceConnection.updateMany.mock.calls[0][0];
    // Compare-and-set against the refresh token that was exchanged.
    expect(where).toEqual({ id: 'conn-1', refreshTokenEnc: row.refreshTokenEnc });
    expect(cipher.decrypt(data.accessTokenEnc)).toBe('access-2');
    expect(data.expiresAt).toEqual(new Date('2026-09-23T11:00:00Z'));
    expect(data).not.toHaveProperty('refreshTokenEnc');
  });

  it('stores a rotated refresh token when Google returns one', async () => {
    const { refresher, serviceConnection } = setup();
    stubTokenEndpoint(Response.json({ access_token: 'a', expires_in: 60, refresh_token: 'refresh-2' }));

    await refresher.refresh('u1');

    expect(cipher.decrypt(serviceConnection.updateMany.mock.calls[0][0].data.refreshTokenEnc)).toBe('refresh-2');
  });

  it.each([400, 401])('a %i from the token endpoint (revoked grant) is REAUTH_REQUIRED and marks the unchanged row REAUTH', async (status) => {
    const { refresher, serviceConnection, row } = setup();
    stubTokenEndpoint(Response.json({ error: 'invalid_grant' }, { status }));

    await expect(refresher.refresh('u1')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(serviceConnection.updateMany).toHaveBeenCalledWith({
      where: { id: 'conn-1', refreshTokenEnc: row.refreshTokenEnc },
      data: { status: 'REAUTH' },
    });
  });

  const reconnected = { id: 'conn-1', refreshTokenEnc: cipher.encrypt('refresh-new'), accessTokenEnc: cipher.encrypt('access-new') };
  const granted = () => Response.json({ access_token: 'stale', expires_in: 60, refresh_token: 'stale-refresh' });
  const refused = () => Response.json({ error: 'invalid_grant' }, { status: 400 });

  it.each([
    ['granted', granted],
    ['refused', refused],
  ])('a disconnect during a %s refresh is NOT_CONNECTED, not a raw database error', async (_, tokenResponse) => {
    const { refresher, rowAfterExchange } = setup();
    rowAfterExchange(null);
    stubTokenEndpoint(tokenResponse());

    await expect(refresher.refresh('u1')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
  });

  it.each([
    ['granted', granted],
    ['refused', refused],
  ])('a reconnect during a %s refresh keeps the new connection and uses its access token', async (_, tokenResponse) => {
    const { refresher, rowAfterExchange } = setup();
    rowAfterExchange(reconnected);
    stubTokenEndpoint(tokenResponse());

    await expect(refresher.refresh('u1')).resolves.toBe('access-new');
  });

  it('a 5xx from the token endpoint is UPSTREAM_ERROR', async () => {
    const { refresher } = setup();
    stubTokenEndpoint(new Response('down', { status: 503 }));

    await expect(refresher.refresh('u1')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it.each([
    ['no expires_in', () => Response.json({ access_token: 'T1' })],
    ['no access_token', () => Response.json({ expires_in: 3600 })],
    ['an empty access_token', () => Response.json({ access_token: '', expires_in: 3600 })],
    ['a non-positive expires_in', () => Response.json({ access_token: 'T1', expires_in: 0 })],
    ['a string expires_in', () => Response.json({ access_token: 'T1', expires_in: '3600' })],
    ['a non-string refresh_token', () => Response.json({ access_token: 'T1', expires_in: 3600, refresh_token: 42 })],
    ['a non-JSON body', () => new Response('<html>proxy</html>', { status: 200 })],
    // Past the Date range (8.64e15 ms): an Invalid Date the DB write would reject with its own text.
    ['expires_in 9e12', () => Response.json({ access_token: 'T1', expires_in: 9e12 })],
    ['expires_in 1e13', () => Response.json({ access_token: 'T1', expires_in: 1e13 })],
    ['expires_in 1e300', () => Response.json({ access_token: 'T1', expires_in: 1e300 })],
    ['an infinite expires_in', () => new Response('{"access_token":"T1","expires_in":1e400}', { status: 200 })],
  ])('a 200 with %s is UPSTREAM_ERROR with a fixed message, and nothing is written', async (_, tokenResponse) => {
    const { refresher, serviceConnection } = setup();
    stubTokenEndpoint(tokenResponse());

    const err = await refresher.refresh('u1').catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'FetchError', code: 'UPSTREAM_ERROR', message: 'Google token endpoint returned an invalid response.' });
    expect(serviceConnection.updateMany).not.toHaveBeenCalled();
  });

  it('an unexpected error (e.g. the DB write failing) is UPSTREAM_ERROR with a fixed message, never its own text', async () => {
    const { refresher, serviceConnection, row } = setup();
    serviceConnection.updateMany.mockRejectedValue(new Error(`Invalid updateMany() invocation: where: { id: "conn-1", refreshTokenEnc: "${row.refreshTokenEnc}" }`));
    stubTokenEndpoint(Response.json({ access_token: 'T1', expires_in: 3600 }));

    const err = await refresher.refresh('u1').catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'FetchError', code: 'UPSTREAM_ERROR', message: 'Google token refresh failed.' });
    expect(serviceConnection.updateMany).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight refresh between concurrent callers for the same user', async () => {
    const { refresher, serviceConnection } = setup();
    const fetchMock = stubTokenEndpoint(Response.json({ access_token: 'shared', expires_in: 60 }));

    await expect(Promise.all([refresher.refresh('u1'), refresher.refresh('u1')])).resolves.toEqual(['shared', 'shared']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serviceConnection.updateMany).toHaveBeenCalledTimes(1);
  });

  it('without a stored refresh token it is REAUTH_REQUIRED, without calling Google', async () => {
    const { refresher } = setup(null);
    const fetchMock = stubTokenEndpoint(Response.json({}));

    await expect(refresher.refresh('u1')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
