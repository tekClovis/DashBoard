import type { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-github2';
import { describe, expect, it } from 'vitest';
import { GithubConnectStrategy, githubConnectClient } from './github-connect.strategy.js';

function makeStrategy(): GithubConnectStrategy {
  const values: Record<string, string> = {
    APP_URL: 'http://localhost:8080',
    GITHUB_CLIENT_ID: 'login-id',
    GITHUB_CLIENT_SECRET: 'login-secret',
  };
  const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
  return new GithubConnectStrategy(config as unknown as ConfigService);
}

describe('GithubConnectStrategy', () => {
  describe('validate', () => {
    it('returns the profile id, access token and widget scopes, and no refresh token', () => {
      const result = makeStrategy().validate('gho_access', 'ghr_refresh', { id: '583231' } as Profile);

      expect(result).toEqual({
        externalAccountId: '583231',
        accessToken: 'gho_access',
        scopes: ['repo', 'security_events'],
      });
    });

    it('stringifies a numeric profile id', () => {
      const result = makeStrategy().validate('gho_access', '', { id: 583231 } as unknown as Profile);

      expect(result.externalAccountId).toBe('583231');
    });
  });
});

describe('githubConnectClient', () => {
  const LOGIN_ENV = { GITHUB_CLIENT_ID: 'login-id', GITHUB_CLIENT_SECRET: 'login-secret' };
  const makeConfig = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  it('prefers the dedicated connect app over the login app', () => {
    const client = githubConnectClient(
      makeConfig({ ...LOGIN_ENV, GITHUB_CONNECT_CLIENT_ID: 'connect-id', GITHUB_CONNECT_CLIENT_SECRET: 'connect-secret' }),
    );

    expect(client).toEqual({ clientID: 'connect-id', clientSecret: 'connect-secret' });
  });

  it('falls back to the login app when no connect app is configured', () => {
    expect(githubConnectClient(makeConfig(LOGIN_ENV))).toEqual({ clientID: 'login-id', clientSecret: 'login-secret' });
  });

  it('falls back to empty strings when nothing is configured', () => {
    expect(githubConnectClient(makeConfig({}))).toEqual({ clientID: '', clientSecret: '' });
  });
});
