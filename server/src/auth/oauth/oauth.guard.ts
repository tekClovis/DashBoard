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
import { readCookie } from '../../core/http/cookies.js';
import { JwtService } from '../jwt.service.js';
import { SESSION_COOKIE } from '../session.constants.js';
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

/** Requires an authenticated session at the `link`/`connect` start leg; returns its user id. */
function requireSessionUserId(req: Request, jwt: JwtService): string {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) throw new UnauthorizedException({ error: 'LOGIN_REQUIRED' });
  const payload = jwt.verify(token);
  if (!payload) throw new UnauthorizedException({ error: 'LOGIN_REQUIRED' });
  return payload.sub;
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
        return runPassport(req, res, this.cfg.provider, { session: false });
      }

      const csrf = readCookie(req.headers.cookie, OAUTH_CSRF_COOKIE) ?? undefined;
      try {
        req.oauthState = verifyConnectState(queryState ?? '', this.cfg.provider, csrf, jwtSecret);
      } catch {
        throw new UnauthorizedException({ error: 'INVALID_STATE' });
      }
      if (denied) return redirectDenied(res, appUrl, 'connections');
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
      const userId = requireSessionUserId(req, this.jwt);
      const csrfToken = generateCsrfToken();
      const state = signConnectState({ provider: this.cfg.provider, userId, csrfToken }, jwtSecret);
      res.cookie(OAUTH_CSRF_COOKIE, csrfToken, cookieOptions);
      const options: Record<string, unknown> = { state, ...this.cfg.connectAuthenticateOptions?.() };
      return runPassport(req, res, this.cfg.connectStrategy, options);
    }

    const state =
      intent === 'link'
        ? signOAuthState({ intent, provider: this.cfg.provider, userId: requireSessionUserId(req, this.jwt) }, jwtSecret)
        : signOAuthState({ intent: 'login', provider: this.cfg.provider }, jwtSecret);
    res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions);
    return runPassport(req, res, this.cfg.provider, { state });
  }
}

@Injectable()
export class GithubOAuthGuard extends BaseProviderOAuthGuard {
  constructor(config: ConfigService, jwt: JwtService) {
    super(config, jwt, { provider: 'github', connectStrategy: 'github-connect' });
  }
}

@Injectable()
export class GoogleOAuthGuard extends BaseProviderOAuthGuard {
  constructor(config: ConfigService, jwt: JwtService) {
    super(config, jwt, {
      provider: 'google',
      connectStrategy: 'google-connect',
      connectAuthenticateOptions: () => ({ accessType: 'offline', prompt: 'consent', scope: YOUTUBE_CONNECT_SCOPES }),
    });
  }
}

/** Steam is OpenID and connect-only (no login/link) — its own guard, not `BaseProviderOAuthGuard`. */
@Injectable()
export class SteamOAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
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
      return runPassport(req, res, 'steam-connect', { session: false });
    }

    const userId = requireSessionUserId(req, this.jwt);
    const csrfToken = generateCsrfToken();
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
    return runPassport(req, res, 'steam-connect', { state, session: false });
  }
}
