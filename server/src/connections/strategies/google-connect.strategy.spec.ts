import type { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-google-oauth20';
import { describe, expect, it } from 'vitest';
import { GoogleConnectStrategy, googleConnectClient } from './google-connect.strategy.js';

const LOGIN_ENV = { GOOGLE_CLIENT_ID: 'login-id', GOOGLE_CLIENT_SECRET: 'login-secret' };

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}

function makeStrategy(): GoogleConnectStrategy {
  return new GoogleConnectStrategy(makeConfig({ APP_URL: 'http://localhost:8080', ...LOGIN_ENV }));
}

const profile = { id: '108204268033311374519' } as Profile;

describe('GoogleConnectStrategy', () => {
  describe('validate', () => {
    it('returns the profile id, both tokens and the youtube scopes', () => {
      const result = makeStrategy().validate('ya29.access', '1//refresh', profile);

      expect(result).toEqual({
        externalAccountId: '108204268033311374519',
        accessToken: 'ya29.access',
        refreshToken: '1//refresh',
        scopes: ['openid', 'https://www.googleapis.com/auth/youtube.readonly'],
      });
    });

    it.each([
      ['an empty string', ''],
      ['undefined', undefined as unknown as string],
    ])('reports no refresh token when Google sends %s (re-consent without a new one)', (_label, refreshToken) => {
      const result = makeStrategy().validate('ya29.access', refreshToken, profile);

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
