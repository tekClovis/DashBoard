import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { connectServiceConfigured, loginProviderConfigured } from './provider-config.js';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('loginProviderConfigured', () => {
  it.each(['github', 'google'] as const)('is true for %s only when both id and secret are set', (provider) => {
    const P = provider.toUpperCase();

    expect(loginProviderConfigured(makeConfig({ [`${P}_CLIENT_ID`]: 'id', [`${P}_CLIENT_SECRET`]: 's' }), provider)).toBe(true);
    expect(loginProviderConfigured(makeConfig({ [`${P}_CLIENT_ID`]: 'id' }), provider)).toBe(false);
    expect(loginProviderConfigured(makeConfig({ [`${P}_CLIENT_ID`]: '', [`${P}_CLIENT_SECRET`]: '' }), provider)).toBe(false);
    expect(loginProviderConfigured(makeConfig({}), provider)).toBe(false);
  });
});

describe('connectServiceConfigured', () => {
  it('follows the connect client, falling back to the login client, for github and youtube', () => {
    expect(connectServiceConfigured(makeConfig({ GITHUB_CLIENT_ID: 'i', GITHUB_CLIENT_SECRET: 's' }), 'github')).toBe(true);
    expect(connectServiceConfigured(makeConfig({ GITHUB_CONNECT_CLIENT_ID: 'i', GITHUB_CONNECT_CLIENT_SECRET: 's' }), 'github')).toBe(true);
    expect(connectServiceConfigured(makeConfig({ GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '' }), 'github')).toBe(false);
    expect(connectServiceConfigured(makeConfig({ GOOGLE_CLIENT_ID: 'i', GOOGLE_CLIENT_SECRET: 's' }), 'youtube')).toBe(true);
    expect(connectServiceConfigured(makeConfig({}), 'youtube')).toBe(false);
  });

  it('uses the Steam API key for steam', () => {
    expect(connectServiceConfigured(makeConfig({ STEAM_API_KEY: 'k' }), 'steam')).toBe(true);
    expect(connectServiceConfigured(makeConfig({ STEAM_API_KEY: '' }), 'steam')).toBe(false);
  });

  it('treats weather (no connect flow) as always configured', () => {
    expect(connectServiceConfigured(makeConfig({}), 'weather')).toBe(true);
  });
});
