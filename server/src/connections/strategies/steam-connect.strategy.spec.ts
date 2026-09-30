import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { SteamConnectStrategy } from './steam-connect.strategy.js';

function makeStrategy(): SteamConnectStrategy {
  const values: Record<string, string> = { APP_URL: 'http://localhost:8080' };
  const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
  return new SteamConnectStrategy(config as unknown as ConfigService);
}

describe('SteamConnectStrategy', () => {
  describe('validate', () => {
    it('extracts the SteamID64 from the OpenID claimed id and returns no tokens', () => {
      const result = makeStrategy().validate('https://steamcommunity.com/openid/id/76561197960435530', undefined);

      expect(result).toEqual({ steamId64: '76561197960435530' });
    });

    it.each([
      ['has no id segment', 'https://steamcommunity.com/openid/'],
      ['has a non-numeric id', 'https://steamcommunity.com/openid/id/gabe'],
      ['has trailing content after the id', 'https://steamcommunity.com/openid/id/76561197960435530/extra'],
      ['is empty', ''],
    ])('throws when the identifier %s', (_label, identifier) => {
      expect(() => makeStrategy().validate(identifier, undefined)).toThrow('Could not determine SteamID64');
    });
  });
});
