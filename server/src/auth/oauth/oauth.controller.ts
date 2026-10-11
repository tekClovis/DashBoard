// GET /api/oauth/{provider}/start?intent=login|link|connect, GET /api/oauth/{provider}/callback
// See docs/Architecture.md §8.3: "One callback per provider... serves both login and connect."
//
// `steam` is connect-only (no login/link — see docs/Architecture.md §8.3's login table,
// which doesn't list it) via its own OpenID strategy and guard.

import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProvidersResponse } from '@dashboard/shared';
import type { Response } from 'express';
import { ConnectionsService } from '../../connections/connections.service.js';
import { DashboardsService } from '../../dashboards/dashboards.service.js';
import { OAUTH_CSRF_COOKIE } from '../../connections/oauth-state.js';
import { loginProviderConfigured } from '../../connections/provider-config.js';
import type { ConnectProfileResult } from '../../connections/strategies/github-connect.strategy.js';
import type { SteamConnectResult } from '../../connections/strategies/steam-connect.strategy.js';
import { JwtService } from '../jwt.service.js';
import { setSessionCookie } from '../session-cookie.js';
import { OAUTH_STATE_COOKIE } from './oauth-state.js';
import { GithubOAuthGuard, GoogleOAuthGuard, SteamOAuthGuard, type OAuthCallbackRequest } from './oauth.guard.js';
import { OAuthIdentityConflictError, OAuthLinkRefusedError, OAuthLoginService, OAuthNoAccountError } from './oauth-login.service.js';
import type { NormalizedOAuthProfile } from './normalized-profile.js';

const CONNECT_PROVIDER_TO_SERVICE = { github: 'github', google: 'youtube', steam: 'steam' } as const;
type ConnectServiceProvider = keyof typeof CONNECT_PROVIDER_TO_SERVICE;

/** Start and callback routes for GitHub, Google and Steam; the callback dispatches on the verified state's intent. */
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauthLogin: OAuthLoginService,
    private readonly connections: ConnectionsService,
    private readonly dashboards: DashboardsService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /** Public: which login providers have credentials, so the web can disable the buttons of the others. */
  @Get('providers')
  providers(): OAuthProvidersResponse {
    return {
      github: { configured: loginProviderConfigured(this.config, 'github') },
      google: { configured: loginProviderConfigured(this.config, 'google') },
    };
  }

  /** Guard redirects to GitHub's authorize URL; this handler body never runs on the start leg. */
  @Get('github/start')
  @UseGuards(GithubOAuthGuard)
  githubStart(): void {}

  @Get('github/callback')
  @UseGuards(GithubOAuthGuard)
  async githubCallback(@Req() req: OAuthCallbackRequest, @Res() res: Response): Promise<void> {
    await this.handleCallback(req, res, 'github');
  }

  @Get('google/start')
  @UseGuards(GoogleOAuthGuard)
  googleStart(): void {}

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Req() req: OAuthCallbackRequest, @Res() res: Response): Promise<void> {
    await this.handleCallback(req, res, 'google');
  }

  @Get('steam/start')
  @UseGuards(SteamOAuthGuard)
  steamStart(): void {}

  @Get('steam/callback')
  @UseGuards(SteamOAuthGuard)
  async steamCallback(@Req() req: OAuthCallbackRequest, @Res() res: Response): Promise<void> {
    await this.handleCallback(req, res, 'steam');
  }

  /** Where connect/link flows land: the user's first dashboard (same fallback as login). */
  private async dashboardUrl(appUrl: string, userId: string): Promise<string> {
    const [first] = await this.dashboards.list(userId);
    return `${appUrl}/d/${first?.id ?? 'placeholder'}`;
  }

  private async handleCallback(req: OAuthCallbackRequest, res: Response, provider: ConnectServiceProvider): Promise<void> {
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/oauth' });
    res.clearCookie(OAUTH_CSRF_COOKIE, { path: '/api/oauth' });
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const state = req.oauthState;

    if (state?.intent === 'connect') {
      const service = CONNECT_PROVIDER_TO_SERVICE[provider];
      try {
        if (provider === 'steam') {
          const result = req.user as unknown as SteamConnectResult;
          await this.connections.upsertSteamConnection(state.userId, result.steamId64);
        } else {
          const result = req.user as unknown as ConnectProfileResult;
          await this.connections.upsertOAuthConnection(state.userId, service as 'github' | 'youtube', {
            externalAccountId: result.externalAccountId,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            scopes: result.scopes,
          });
        }
      } catch {
        res.redirect(`${appUrl}/connections?error=CONNECT_FAILED`);
        return;
      }
      res.redirect(await this.dashboardUrl(appUrl, state.userId));
      return;
    }

    // Steam only ever completes a `connect` handshake — the branches below are unreachable
    // for it, but TypeScript can't see that through the guard's dynamic dispatch.
    if (provider === 'steam') return;

    const profile = req.user as unknown as NormalizedOAuthProfile;

    if (state?.intent === 'link') {
      try {
        await this.oauthLogin.linkIdentity(state.userId, profile);
      } catch (err) {
        if (err instanceof OAuthIdentityConflictError) {
          res.redirect(`${appUrl}/profile?error=IDENTITY_ALREADY_LINKED`);
          return;
        }
        throw err;
      }
      res.redirect(await this.dashboardUrl(appUrl, state.userId));
      return;
    }

    try {
      const user = await this.oauthLogin.loginOrLink(profile);
      if (user.bannedAt) {
        res.redirect(`${appUrl}/login?error=ACCOUNT_BANNED`);
        return;
      }
      const token = this.jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion });
      setSessionCookie(res, appUrl, token);
      res.redirect(`${appUrl}/d/placeholder`);
    } catch (err) {
      if (err instanceof OAuthLinkRefusedError) {
        res.redirect(`${appUrl}/login?error=EMAIL_LINK_REQUIRED`);
        return;
      }
      if (err instanceof OAuthNoAccountError) {
        res.redirect(`${appUrl}/login?error=OAUTH_NO_ACCOUNT`);
        return;
      }
      throw err;
    }
  }
}
