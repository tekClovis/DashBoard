// docs/Architecture.md §8.3: Google login, `passport-google-oauth20`, scopes `openid email profile`.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import type { NormalizedOAuthProfile } from './normalized-profile.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'unset-google-client-id',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'unset-google-client-secret',
      callbackURL: `${config.getOrThrow<string>('APP_URL')}/api/oauth/google/callback`,
      scope: ['openid', 'email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: unknown, profile?: NormalizedOAuthProfile) => void,
  ): void {
    const email = profile.emails?.[0]?.value ?? null;
    const rawJson = profile._json as { email_verified?: boolean } | undefined;

    done(null, {
      provider: 'GOOGLE',
      providerUserId: profile.id,
      email,
      emailVerified: Boolean(rawJson?.email_verified),
    });
  }
}
