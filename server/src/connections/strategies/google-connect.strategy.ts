// Google (YouTube) connect strategy — widget scopes (`youtube.readonly`,
// offline access for a refresh token), separate OAuth app/registration from
// oauth-login's login-only `openid email profile` scope.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import type { ConnectProfileResult } from './github-connect.strategy.js';

export const YOUTUBE_CONNECT_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

@Injectable()
export class GoogleConnectStrategy extends PassportStrategy(Strategy, 'google-connect') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CONNECT_CLIENT_ID') ?? config.get<string>('GOOGLE_CLIENT_ID') ?? '',
      clientSecret:
        config.get<string>('GOOGLE_CONNECT_CLIENT_SECRET') ?? config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
      callbackURL: `${config.getOrThrow<string>('APP_URL')}/api/oauth/google/callback`,
      scope: YOUTUBE_CONNECT_SCOPES,
    });
    // `accessType`/`prompt` are read from the per-request `authenticate()`
    // options by passport-google-oauth20's `authorizationParams`, not from
    // this constructor — passed at the `start` leg in oauth.controller.ts.
  }

  validate(accessToken: string, refreshToken: string, profile: Profile): ConnectProfileResult {
    return {
      externalAccountId: String(profile.id),
      accessToken,
      refreshToken: refreshToken || undefined,
      scopes: YOUTUBE_CONNECT_SCOPES,
    };
  }
}
