// GitHub connect strategy — widget scopes, separate OAuth app/registration
// from oauth-login's login-only `read:user user:email` scope (Architecture
// §5.1 "one callback per provider" note: same callback route, different
// scope/app per intent).

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';

export const GITHUB_CONNECT_SCOPES = ['repo', 'security_events'];

/** Value returned by the GitHub and Google connect strategies' `validate`. */
export interface ConnectProfileResult {
  externalAccountId: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
}

/** The OAuth app the connect flow grants tokens to. Revoking those tokens must use the same app. */
export function githubConnectClient(config: ConfigService): { clientID: string; clientSecret: string } {
  return {
    clientID: config.get<string>('GITHUB_CONNECT_CLIENT_ID') ?? config.get<string>('GITHUB_CLIENT_ID') ?? '',
    clientSecret: config.get<string>('GITHUB_CONNECT_CLIENT_SECRET') ?? config.get<string>('GITHUB_CLIENT_SECRET') ?? '',
  };
}

@Injectable()
export class GithubConnectStrategy extends PassportStrategy(Strategy, 'github-connect') {
  constructor(config: ConfigService) {
    super({
      ...githubConnectClient(config),
      callbackURL: `${config.getOrThrow<string>('APP_URL')}/api/oauth/github/callback`,
      scope: GITHUB_CONNECT_SCOPES,
    });
  }

  // NestJS's PassportStrategy mixin calls `validate(...)` and uses its
  // *return value* as the result passed to passport's `done` itself — it
  // does not forward a working `done` for us to call. Return (don't call
  // back), or throw on failure.
  validate(accessToken: string, _refreshToken: string, profile: Profile): ConnectProfileResult {
    return { externalAccountId: String(profile.id), accessToken, scopes: GITHUB_CONNECT_SCOPES };
  }
}
