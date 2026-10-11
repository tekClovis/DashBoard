// Wraps passport authenticate for each provider around the signed, cookie-bound `state`
// param (docs/Architecture.md §8.3): the *same* callback URL per provider serves `login`,
// `link` (oauth-login) and `connect` (connections-api) — a GitHub OAuth App allows only
// one registered callback URL, so all three share it, dispatching by strategy based on the
// server-verified intent, never a client-supplied one.
//
//   - start leg (no `code`/`openid.mode` yet): sign the state for the requested intent,
//     stash it in a short-lived cookie, and hand it to passport as `state` (or, for
//     `connect`, connections-api's own CSRF-cookie-bound state — see
//     ../../connections/oauth-state.js, which Steam's OpenID round trip also needs since
//     it can't echo an arbitrary `state` query param) so it round-trips through the
//     provider redirect.
//   - callback leg: verify state before letting passport exchange the code — try
//     oauth-login's `login`/`link` verifier first, then connections-api's `connect`
//     verifier. An invalid/expired/unmatched state on both throws 401 here, so no provider
//     call and no user/identity/connection mutation ever happens.
//
// `login` needs no session. `link` and `connect` both require an existing session at the
// start leg and bind the state to that user's id, so the callback never has to trust a
// client-supplied id. `connect` additionally authenticates against the separate
// `{provider}-connect` strategy (widget scopes, e.g. YouTube read access) instead of the
// login strategy — can't use @nestjs/passport's `AuthGuard(name)` mixin for that since its
// strategy name is fixed at class-definition time, so this guard calls
// `passport.authenticate` directly instead, picking the strategy per request.

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import {
  generateCsrfToken,
  OAUTH_CSRF_COOKIE,
  signConnectState,
  verifyConnectState,
  type ConnectStatePayload,
} from '../../connections/oauth-state.js';
import { YOUTUBE_CONNECT_SCOPES } from '../../connections/strategies/google-connect.strategy.js';
import { SteamOpenIdError, SteamOpenIdService, STEAM_NONCE_COOKIE } from '../../connections/steam-openid.js';
import { readCookie } from '../../core/http/cookies.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { JwtService } from '../jwt.service.js';
import { resolveSessionUser } from '../session-user.js';
import { SESSION_COOKIE } from '../session.constants.js';
import { TokenRevocationService } from '../token-revocation.service.js';
import {
  assertBoundState,
  OAUTH_STATE_COOKIE,
  signOAuthState,
  type OAuthIntent,
  type OAuthStatePayload,
} from './oauth-state.js';

const STATE_COOKIE_TTL_MS = 10 * 60 * 1000;

export type OAuthResolvedState = OAuthStatePayload | ConnectStatePayload;

/** Request augmented by the callback leg's `canActivate` with the verified `state` payload. */
export interface OAuthCallbackRequest extends Request {
  oauthState?: OAuthResolvedState;
}

function getIntent(req: Request): OAuthIntent {
  if (req.query['intent'] === 'connect') return 'connect';
  if (req.query['intent'] === 'link') return 'link';
  return 'login';
}

/** Requires a valid session (verified, not banned, not revoked) at the `link`/`connect` start leg; returns its user id. */
async function requireSessionUserId(
  req: Request,
  jwt: JwtService,
  prisma: PrismaService,
  revocation: TokenRevocationService,
): Promise<string> {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  const user = token ? await resolveSessionUser(token, jwt, prisma, revocation) : null;
  if (!user) throw new UnauthorizedException({ error: 'LOGIN_REQUIRED' });
  return user.id;
}

/** The state-bound user may have been deleted or banned since the start leg; refuse to link on their behalf. */
async function assertUserStillActive(prisma: PrismaService, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedAt: true } });
  if (!user || user.bannedAt) throw new UnauthorizedException({ error: 'LOGIN_REQUIRED' });
}

/** Runs a named passport strategy and resolves like a normal guard once it settles. */
function runPassport(
  req: Request,
  res: Response,
  strategyName: string,
  options: Record<string, unknown>,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const next: NextFunction = (err) => (err ? reject(err) : resolve(true));
    passport.authenticate(strategyName, options, (err: unknown, user: unknown, info: unknown) => {
      if (err) {
        reject(err instanceof Error ? err : new Error('OAuth handshake failed.'));
        return;
      }
      if (!user) {
        reject(new UnauthorizedException(info as Record<string, unknown> | undefined));
        return;
      }
      (req as unknown as { user: unknown }).user = user;
      resolve(true);
    })(req, res, next);
  });
}

/** Sends a user who denied the provider consent screen back into the app with an error; never lets the handler run. */
function redirectDenied(res: Response, appUrl: string, page: 'connections' | 'profile' | 'login'): boolean {
  res.redirect(`${appUrl}/${page}?error=OAUTH_DENIED`);
  return false;
}

interface ProviderGuardConfig {
  provider: 'github' | 'google';
  connectStrategy: 'github-connect' | 'google-connect';
  connectAuthenticateOptions?: () => Record<string, unknown>;
}

class BaseProviderOAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly revocation: TokenRevocationService,
    private readonly cfg: ProviderGuardConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OAuthCallbackRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const appUrl = this.config.getOrThrow<string>('APP_URL');

    // A provider denial (`?error=access_denied`, no `code`) is still a callback leg: restarting
    // auth would silently bounce the user back to the provider instead of surfacing the error.
    const denied = !req.query['code'] && Boolean(req.query['error']);
    if (req.query['code'] || denied) {
      const queryState = req.query['state'] as string | undefined;
      const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE) ?? undefined;
      let loginState: OAuthStatePayload | undefined;
      try {
        loginState = assertBoundState(queryState, cookieState, jwtSecret);
      } catch {
        // Not a login/link state — fall through and try the connect verifier below.
      }
      // A login/link state signed for another provider falls through too, so it ends as INVALID_STATE.
      if (loginState?.provider === this.cfg.provider) {
        req.oauthState = loginState;
        if (denied) return redirectDenied(res, appUrl, loginState.intent === 'link' ? 'profile' : 'login');
        if (loginState.intent === 'link') await assertUserStillActive(this.prisma, loginState.userId);
        return runPassport(req, res, this.cfg.provider, { session: false });
      }

      const csrf = readCookie(req.headers.cookie, OAUTH_CSRF_COOKIE) ?? undefined;
      try {
        req.oauthState = verifyConnectState(queryState ?? '', this.cfg.provider, csrf, jwtSecret);
      } catch {
        throw new UnauthorizedException({ error: 'INVALID_STATE' });
      }
      if (denied) return redirectDenied(res, appUrl, 'connections');
      await assertUserStillActive(this.prisma, req.oauthState.userId);
      return runPassport(req, res, this.cfg.connectStrategy, { session: false });
    }

    const intent = getIntent(req);
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: appUrl.startsWith('https'),
      maxAge: STATE_COOKIE_TTL_MS,
      path: '/api/oauth',
    };

    if (intent === 'connect') {
      const userId = await requireSessionUserId(req, this.jwt, this.prisma, this.revocation);
      const csrfToken = generateCsrfToken();
      const state = signConnectState({ provider: this.cfg.provider, userId, csrfToken }, jwtSecret);
      res.cookie(OAUTH_CSRF_COOKIE, csrfToken, cookieOptions);
      const options: Record<string, unknown> = { state, ...this.cfg.connectAuthenticateOptions?.() };
      return runPassport(req, res, this.cfg.connectStrategy, options);
    }

    const state =
      intent === 'link'
        ? signOAuthState({ intent, provider: this.cfg.provider, userId: await requireSessionUserId(req, this.jwt, this.prisma, this.revocation) }, jwtSecret)
        : signOAuthState({ intent: 'login', provider: this.cfg.provider }, jwtSecret);
    res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions);
    return runPassport(req, res, this.cfg.provider, { state });
  }
}

@Injectable()
export class GithubOAuthGuard extends BaseProviderOAuthGuard {
  constructor(config: ConfigService, jwt: JwtService, prisma: PrismaService, revocation: TokenRevocationService) {
    super(config, jwt, prisma, revocation, { provider: 'github', connectStrategy: 'github-connect' });
  }
}

@Injectable()
export class GoogleOAuthGuard extends BaseProviderOAuthGuard {
  constructor(config: ConfigService, jwt: JwtService, prisma: PrismaService, revocation: TokenRevocationService) {
    super(config, jwt, prisma, revocation, {
      provider: 'google',
      connectStrategy: 'google-connect',
      connectAuthenticateOptions: () => ({ accessType: 'offline', prompt: 'consent', scope: YOUTUBE_CONNECT_SCOPES }),
    });
  }
}

/**
 * Steam is OpenID and connect-only (no login/link) — its own guard, not `BaseProviderOAuthGuard`, and its
 * own handshake ({@link SteamOpenIdService}) so a per-request nonce rides in `return_to` and is matched
 * against a cookie at the callback.
 */
@Injectable()
export class SteamOAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly revocation: TokenRevocationService,
    private readonly steam: SteamOpenIdService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OAuthCallbackRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const appUrl = this.config.getOrThrow<string>('APP_URL');

    // Steam's OpenID redirect echoes `openid.mode`, never our own `code`/`state` shape —
    // and (per oauth-state.ts) can't carry an arbitrary `state` query param at all, so the
    // signed state travels via cookie instead.
    if (typeof req.query['openid.mode'] === 'string') {
      const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE) ?? '';
      const csrf = readCookie(req.headers.cookie, OAUTH_CSRF_COOKIE) ?? undefined;
      try {
        req.oauthState = verifyConnectState(cookieState, 'steam', csrf, jwtSecret);
      } catch {
        throw new UnauthorizedException({ error: 'INVALID_STATE' });
      }
      await assertUserStillActive(this.prisma, req.oauthState.userId);
      const nonce = readCookie(req.headers.cookie, STEAM_NONCE_COOKIE) ?? undefined;
      try {
        (req as unknown as { user: unknown }).user = await this.steam.verify(req.query, nonce);
      } catch (err) {
        if (err instanceof SteamOpenIdError) throw new UnauthorizedException({ error: 'INVALID_STATE' });
        throw err;
      }
      return true;
    }

    const userId = await requireSessionUserId(req, this.jwt, this.prisma, this.revocation);
    const csrfToken = generateCsrfToken();
    const nonce = this.steam.generateNonce();
    const state = signConnectState({ provider: 'steam', userId, csrfToken }, jwtSecret);
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: appUrl.startsWith('https'),
      maxAge: STATE_COOKIE_TTL_MS,
      path: '/api/oauth',
    };
    res.cookie(OAUTH_CSRF_COOKIE, csrfToken, cookieOptions);
    res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions);
    res.cookie(STEAM_NONCE_COOKIE, nonce, cookieOptions);
    res.redirect(this.steam.loginUrl(nonce));
    return false;
  }
}
