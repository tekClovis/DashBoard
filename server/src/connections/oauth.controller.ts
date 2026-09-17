// GET /api/oauth/{provider}/start, GET /api/oauth/{provider}/callback —
// the `connect` intent only. `oauth-login`'s login intent isn't merged into
// `main` yet (see features/queue.md's build-order note); this feature builds
// its own minimal start/callback scaffolding against that feature's spec
// contract rather than its unmerged branch, and only implements `intent`
// values it owns (`connect`). A future merge should reconcile this file with
// `oauth-login`'s real `oauth.controller.ts`/`oauth.guard.ts`.
//
// Security note (see features/oauth-login/verification/review.md — that
// branch's fixed account-takeover bug): the `start` leg reads the *session*
// user id and signs it into `state`; the `callback` leg only ever trusts
// that verified `state.userId`, never anything from the query/body.

import { BadRequestException, Controller, Get, HttpStatus, Param, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import passport from 'passport';
import { SessionService } from '../core/session/session.service.js';
import { ConnectionsService } from './connections.service.js';
import {
  type ConnectProvider,
  OAUTH_CSRF_COOKIE,
  OAUTH_STATE_COOKIE,
  generateCsrfToken,
  InvalidStateError,
  signConnectState,
  verifyConnectState,
} from './oauth-state.js';
import type { ConnectProfileResult } from './strategies/github-connect.strategy.js';
import { YOUTUBE_CONNECT_SCOPES } from './strategies/google-connect.strategy.js';
import type { SteamConnectResult } from './strategies/steam-connect.strategy.js';

const PROVIDER_TO_SERVICE: Record<ConnectProvider, 'github' | 'youtube' | 'steam'> = {
  github: 'github',
  google: 'youtube',
  steam: 'steam',
};

function assertProvider(provider: string): ConnectProvider {
  if (provider === 'github' || provider === 'google' || provider === 'steam') return provider;
  throw new BadRequestException({ error: 'UNKNOWN_PROVIDER' });
}

@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly session: SessionService,
    private readonly connections: ConnectionsService,
    private readonly config: ConfigService,
  ) {}

  @Get(':provider/start')
  async start(
    @Param('provider') providerParam: string,
    @Query('intent') intent: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = assertProvider(providerParam);

    if (intent !== 'connect') {
      // login intent belongs to oauth-login; not implemented on this branch.
      throw new BadRequestException({ error: 'UNSUPPORTED_INTENT' });
    }

    const userId = await this.session.requireUserId(req); // 401s with no state issued, no ServiceConnection touched.

    const csrfToken = generateCsrfToken();
    const state = signConnectState({ provider, userId, csrfToken }, this.stateSecret());

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.getOrThrow<string>('APP_URL').startsWith('https'),
      maxAge: 10 * 60 * 1000,
      path: '/api/oauth',
    };
    res.cookie(OAUTH_CSRF_COOKIE, csrfToken, cookieOptions);
    if (provider === 'steam') {
      // Steam's OpenID round trip can't carry our `state` query param — see oauth-state.ts.
      res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions);
    }

    const strategyName = `${provider}-connect`;
    const authenticateOptions: Record<string, unknown> = { session: false, state };
    if (provider === 'google') {
      authenticateOptions['accessType'] = 'offline';
      authenticateOptions['prompt'] = 'consent';
      authenticateOptions['scope'] = YOUTUBE_CONNECT_SCOPES;
    }

    passport.authenticate(strategyName, authenticateOptions, (err: unknown) => {
      if (err) res.status(HttpStatus.BAD_GATEWAY).json({ error: 'OAUTH_START_FAILED' });
    })(req, res, () => undefined);
  }

  @Get(':provider/callback')
  async callback(@Param('provider') providerParam: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const provider = assertProvider(providerParam);
    const rawState =
      provider === 'steam'
        ? (req.cookies?.[OAUTH_STATE_COOKIE] ?? '')
        : typeof req.query['state'] === 'string'
          ? req.query['state']
          : '';

    let statePayload;
    try {
      statePayload = verifyConnectState(rawState, provider, req.cookies?.[OAUTH_CSRF_COOKIE], this.stateSecret());
    } catch (err) {
      if (err instanceof InvalidStateError) {
        throw new UnauthorizedException({ error: 'INVALID_STATE' });
      }
      throw err;
    }
    res.clearCookie(OAUTH_CSRF_COOKIE, { path: '/api/oauth' });
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/oauth' });

    const service = PROVIDER_TO_SERVICE[provider];
    const strategyName = `${provider}-connect`;

    await new Promise<void>((resolve, reject) => {
      passport.authenticate(strategyName, { session: false }, (err: unknown, result: unknown) => {
        if (err || !result) {
          reject(err instanceof Error ? err : new Error('OAuth handshake failed.'));
          return;
        }

        void this.persist(statePayload.userId, provider, service, result)
          .then(() => {
            res.redirect(`${this.config.getOrThrow<string>('APP_URL')}/connections?connected=${service}`);
            resolve();
          })
          .catch(reject);
      })(req, res, () => resolve());
    }).catch(() => {
      res.redirect(`${this.config.getOrThrow<string>('APP_URL')}/connections?error=CONNECT_FAILED`);
    });
  }

  private async persist(
    userId: string,
    provider: ConnectProvider,
    service: 'github' | 'youtube' | 'steam',
    result: unknown,
  ): Promise<void> {
    if (provider === 'steam') {
      const steamResult = result as SteamConnectResult;
      await this.connections.upsertSteamConnection(userId, steamResult.steamId64);
      return;
    }

    const oauthResult = result as ConnectProfileResult;
    await this.connections.upsertOAuthConnection(userId, service as 'github' | 'youtube', {
      externalAccountId: oauthResult.externalAccountId,
      accessToken: oauthResult.accessToken,
      refreshToken: oauthResult.refreshToken,
      scopes: oauthResult.scopes,
    });
  }

  private stateSecret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }
}
