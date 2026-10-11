// Google (YouTube) connect strategy — widget scopes (`youtube.readonly`,
// offline access for a refresh token), separate OAuth app/registration from
// oauth-login's login-only `openid email profile` scope.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import type { ConnectProfileResult } from './github-connect.strategy.js';

// `openid` is required alongside the widget scope: passport-google-oauth20 always calls
// Google's userinfo endpoint after token exchange to build `profile`, and that call is
// rejected with `invalid_request` if the granted token carries no openid scope.
export const YOUTUBE_CONNECT_SCOPES = ['openid', 'https://www.googleapis.com/auth/youtube.readonly'];

/** The OAuth client the connect flow grants tokens to. Refreshing those tokens must use the same client. */
export function googleConnectClient(config: ConfigService): { clientID: string; clientSecret: string } {
  return {
    clientID: config.get<string>('GOOGLE_CONNECT_CLIENT_ID') || config.get<string>('GOOGLE_CLIENT_ID') || '',
    clientSecret: config.get<string>('GOOGLE_CONNECT_CLIENT_SECRET') || config.get<string>('GOOGLE_CLIENT_SECRET') || '',
  };
}

@Injectable()
export class GoogleConnectStrategy extends PassportStrategy(Strategy, 'google-connect') {
  constructor(config: ConfigService) {
    const { clientID, clientSecret } = googleConnectClient(config);
    super({
      // passport-oauth2 throws on an empty client id; the placeholder keeps boot alive when
      // Google is not configured (the web disables the button — see provider-config.ts).
      clientID: clientID || 'unset-google-connect-client-id',
      clientSecret: clientSecret || 'unset-google-connect-client-secret',
      callbackURL: `${config.getOrThrow<string>('APP_URL')}/api/oauth/google/callback`,
      scope: YOUTUBE_CONNECT_SCOPES,
    });
    // passport-oauth2 hands the token response (`expires_in`) to a verify callback of arity 5 only,
    // and Nest's wrapper is variadic (arity 0), so re-expose it through a 5-argument callback.
    const self = this as unknown as { _verify: (...args: unknown[]) => unknown };
    const verify = self._verify;
    self._verify = (accessToken: unknown, refreshToken: unknown, tokenParams: unknown, profile: unknown, done: unknown) =>
      verify(accessToken, refreshToken, tokenParams, profile, done);
    // `accessType`/`prompt` are read from the per-request `authenticate()`
    // options by passport-google-oauth20's `authorizationParams`, not from
    // this constructor — passed at the `start` leg in oauth.controller.ts.
  }

  validate(
    accessToken: string,
    refreshToken: string,
    params: { expires_in?: number },
    profile: Profile,
  ): ConnectProfileResult {
    const expiresAt =
      typeof params.expires_in === 'number' ? new Date(Date.now() + params.expires_in * 1000) : undefined;
    return {
      externalAccountId: String(profile.id),
      accessToken,
      refreshToken: refreshToken || undefined,
      scopes: YOUTUBE_CONNECT_SCOPES,
      expiresAt,
    };
  }
}
