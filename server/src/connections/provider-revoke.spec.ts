import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revokeAtProvider } from './provider-revoke.js';

function makeConfig(values: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const GITHUB_ENV = { GITHUB_CLIENT_ID: 'login-id', GITHUB_CLIENT_SECRET: 'login-secret' };

/** Decodes the `id:secret` pair carried by a request's Basic Authorization header. */
function basicCredentials(init: RequestInit): string {
  const { Authorization } = init.headers as Record<string, string>;
  expect(Authorization).toMatch(/^Basic /);
  return Buffer.from(Authorization.slice('Basic '.length), 'base64').toString();
}

describe('revokeAtProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deletes the GitHub grant with the login app credentials as basic auth when no connect app is configured and the token in the body', async () => {
    await revokeAtProvider('github', { accessToken: 'gho_token', refreshToken: null }, makeConfig(GITHUB_ENV));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/applications/login-id/grant');
    expect(init.method).toBe('DELETE');
    expect(basicCredentials(init)).toBe('login-id:login-secret');
    expect(JSON.parse(init.body as string)).toEqual({ access_token: 'gho_token' });
  });

  it.each([
    ['client id', { GITHUB_CLIENT_SECRET: 'login-secret' }],
    ['client secret', { GITHUB_CLIENT_ID: 'login-id' }],
  ])('skips the GitHub call when the %s is not configured', async (_missing, env) => {
    await revokeAtProvider('github', { accessToken: 'gho_token', refreshToken: null }, makeConfig(env));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Connect tokens are granted to the connect OAuth app (github-connect.strategy.ts prefers
  // GITHUB_CONNECT_CLIENT_ID/SECRET), so the grant must be deleted with that app's credentials.
  it('revokes the GitHub grant with the connect app credentials when they are configured', async () => {
    await revokeAtProvider(
      'github',
      { accessToken: 'gho_token', refreshToken: null },
      makeConfig({ ...GITHUB_ENV, GITHUB_CONNECT_CLIENT_ID: 'connect-id', GITHUB_CONNECT_CLIENT_SECRET: 'connect-secret' }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/applications/connect-id/grant');
    expect(basicCredentials(init)).toBe('connect-id:connect-secret');
  });

  it('posts the URL-encoded refresh token, not the access token, to the Google revoke endpoint for youtube', async () => {
    await revokeAtProvider('youtube', { accessToken: 'ya29.access', refreshToken: '1//a+b&c=d' }, makeConfig());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/revoke?token=1%2F%2Fa%2Bb%26c%3Dd');
    expect(init.method).toBe('POST');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('falls back to the access token for youtube when no refresh token was stored', async () => {
    await revokeAtProvider('youtube', { accessToken: 'ya29.access', refreshToken: null }, makeConfig());

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/revoke?token=ya29.access');
  });

  it.each(['steam', 'weather', 'unknown'])('makes no request for %s, which has no revoke endpoint', async (service) => {
    await revokeAtProvider(service, { accessToken: 'some-token', refreshToken: 'r' }, makeConfig(GITHUB_ENV));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['github', 'youtube'])('makes no request for %s when there is no access token', async (service) => {
    await revokeAtProvider(service, { accessToken: null, refreshToken: null }, makeConfig(GITHUB_ENV));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['github', 'youtube'])('resolves when the %s request itself fails', async (service) => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(revokeAtProvider(service, { accessToken: 'token', refreshToken: 'r' }, makeConfig(GITHUB_ENV))).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
