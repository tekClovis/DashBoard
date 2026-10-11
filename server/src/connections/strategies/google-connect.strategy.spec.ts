import type { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-google-oauth20';
import { describe, expect, it, vi } from 'vitest';
import { GoogleConnectStrategy, googleConnectClient } from './google-connect.strategy.js';

const LOGIN_ENV = { GOOGLE_CLIENT_ID: 'login-id', GOOGLE_CLIENT_SECRET: 'login-secret' };

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}

function makeStrategy(): GoogleConnectStrategy {
  return new GoogleConnectStrategy(makeConfig({ APP_URL: 'http://localhost:8080', ...LOGIN_ENV }));
}

const profile = { id: '108204268033311374519' } as Profile;
const params = { expires_in: 3600 };

describe('GoogleConnectStrategy', () => {
  describe('validate', () => {
    it('returns the profile id, both tokens and the youtube scopes', () => {
      const result = makeStrategy().validate('ya29.access', '1//refresh', params, profile);

      expect(result).toEqual({
        externalAccountId: '108204268033311374519',
        accessToken: 'ya29.access',
        refreshToken: '1//refresh',
        scopes: ['openid', 'https://www.googleapis.com/auth/youtube.readonly'],
        expiresAt: expect.any(Date),
      });
    });

    it('derives expiresAt from the token response expires_in', () => {
      vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
      try {
        const result = makeStrategy().validate('ya29.access', '1//refresh', { expires_in: 3600 }, profile);

        expect(result.expiresAt).toEqual(new Date('2026-01-01T01:00:00Z'));
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves expiresAt unset when Google sends no expires_in', () => {
      const result = makeStrategy().validate('ya29.access', '1//refresh', {}, profile);

      expect(result.expiresAt).toBeUndefined();
    });

    // passport-oauth2 only hands the token response params to a verify callback of arity 5.
    it('exposes a 5-argument verify callback that forwards the token response params to validate', async () => {
      const strategy = makeStrategy();
      const verify = (strategy as unknown as { _verify: (...args: unknown[]) => unknown })._verify;
      const done = vi.fn();

      expect(verify.length).toBe(5);
      verify('ya29.access', '1//refresh', params, profile, done);
      await vi.waitFor(() => expect(done).toHaveBeenCalled());

      expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ accessToken: 'ya29.access', expiresAt: expect.any(Date) }));
    });

    it.each([
      ['an empty string', ''],
      ['undefined', undefined as unknown as string],
    ])('reports no refresh token when Google sends %s (re-consent without a new one)', (_label, refreshToken) => {
      const result = makeStrategy().validate('ya29.access', refreshToken, params, profile);

      expect(result.refreshToken).toBeUndefined();
    });
  });
});

describe('googleConnectClient', () => {
  it('prefers the dedicated connect client over the login client', () => {
    const client = googleConnectClient(
      makeConfig({ ...LOGIN_ENV, GOOGLE_CONNECT_CLIENT_ID: 'connect-id', GOOGLE_CONNECT_CLIENT_SECRET: 'connect-secret' }),
    );

    expect(client).toEqual({ clientID: 'connect-id', clientSecret: 'connect-secret' });
  });

  it('falls back to the login client when no connect client is configured', () => {
    expect(googleConnectClient(makeConfig(LOGIN_ENV))).toEqual({ clientID: 'login-id', clientSecret: 'login-secret' });
  });

  it('falls back to empty strings when nothing is configured', () => {
    expect(googleConnectClient(makeConfig({}))).toEqual({ clientID: '', clientSecret: '' });
  });
});

describe('GoogleConnectStrategy construction', () => {
  it('does not throw when no client id or secret is configured', () => {
    expect(() => new GoogleConnectStrategy(makeConfig({ APP_URL: 'http://localhost:8080', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }))).not.toThrow();
  });

  it('falls back to the login client when the connect client is an empty string', () => {
    expect(
      googleConnectClient(makeConfig({ ...LOGIN_ENV, GOOGLE_CONNECT_CLIENT_ID: '', GOOGLE_CONNECT_CLIENT_SECRET: '' })),
    ).toEqual({ clientID: 'login-id', clientSecret: 'login-secret' });
  });
});
