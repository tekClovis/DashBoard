// GET /api/oauth/{provider}/start?intent=login, GET /api/oauth/{provider}/callback
// See docs/Architecture.md §5.2: "One callback per provider... serves both login and connect."
// Only `intent=login` is handled here; `connect` is left for connections-api to add.

import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { issueSessionCookie } from '../session-cookie.js';
import { OAUTH_STATE_COOKIE } from './oauth-state.js';
import { GithubOAuthGuard, GoogleOAuthGuard } from './oauth.guard.js';
import { OAuthLinkRefusedError, OAuthLoginService } from './oauth-login.service.js';
import type { NormalizedOAuthProfile } from './normalized-profile.js';

@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauthLogin: OAuthLoginService,
    private readonly config: ConfigService,
  ) {}

  /** Guard redirects to GitHub's authorize URL; this handler body never runs on the start leg. */
  @Get('github/start')
  @UseGuards(GithubOAuthGuard)
  githubStart(): void {}

  @Get('github/callback')
  @UseGuards(GithubOAuthGuard)
  async githubCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handleCallback(req, res);
  }

  @Get('google/start')
  @UseGuards(GoogleOAuthGuard)
  googleStart(): void {}

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handleCallback(req, res);
  }

  private async handleCallback(req: Request, res: Response): Promise<void> {
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/oauth' });
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    const profile = req.user as NormalizedOAuthProfile;

    try {
      const user = await this.oauthLogin.loginOrLink(profile);
      issueSessionCookie(res, appUrl, this.config.getOrThrow<string>('JWT_SECRET'), {
        id: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });
      res.redirect(`${appUrl}/d/placeholder`);
    } catch (err) {
      if (err instanceof OAuthLinkRefusedError) {
        res.redirect(`${appUrl}/login?error=EMAIL_LINK_REQUIRED`);
        return;
      }
      throw err;
    }
  }
}
