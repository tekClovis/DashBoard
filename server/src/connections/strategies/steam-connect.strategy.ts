// Steam OpenID 2.0 connect strategy — connect-only, no login. Stores
// `externalAccountId` = SteamID64; no tokens (the Steam Web API key is
// server-side `STEAM_API_KEY`).

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type SteamStrategyOptions } from 'passport-steam';

export interface SteamConnectResult {
  steamId64: string;
}

// @types/passport-steam doesn't declare `profile`, though the underlying
// strategy (passport-steam's lib/passport-steam/strategy.js) reads it directly.
interface SteamStrategyOptionsWithProfile extends SteamStrategyOptions {
  profile?: boolean;
}

@Injectable()
export class SteamConnectStrategy extends PassportStrategy(Strategy, 'steam-connect') {
  constructor(config: ConfigService) {
    const options: SteamStrategyOptionsWithProfile = {
      returnURL: `${config.getOrThrow<string>('APP_URL')}/api/oauth/steam/callback`,
      realm: config.getOrThrow<string>('APP_URL'),
      apiKey: config.get<string>('STEAM_API_KEY') ?? '',
      // We only need the SteamID64 (ServiceConnection has no profile fields),
      // which the OpenID identifier already carries — skip passport-steam's
      // extra Steam Web API profile round trip.
      profile: false,
    };
    super(options);
  }

  validate(identifier: string, _profile: unknown): SteamConnectResult {
    const steamId64 = extractSteamId64(identifier);
    if (!steamId64) {
      throw new Error('Could not determine SteamID64 from OpenID response.');
    }
    return { steamId64 };
  }
}

/** Parse the SteamID64 from the OpenID claimed_id URL; `undefined` if it doesn't match. */
function extractSteamId64(identifier: string): string | undefined {
  const match = /\/openid\/id\/(\d+)$/.exec(identifier);
  return match?.[1];
}
