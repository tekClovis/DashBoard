// Wraps @nestjs/passport's AuthGuard for each provider strategy to add the signed,
// cookie-bound `state` param (docs/Architecture.md §5.2) around passport's own
// redirect/callback dance:
//   - start leg (no `code` query param yet): sign { intent, provider }, stash it in a
//     short-lived cookie, and hand it to passport as the `state` authenticate option so
//     it round-trips through the provider's redirect.
//   - callback leg (`code` present): before letting passport exchange the code, verify
//     the returned `state` matches the cookie and is still validly signed/unexpired.
//     An invalid/expired state throws 401 here, so no provider call and no user/identity
//     mutation ever happens (checklist item 7).
//
// `intent` is read from the start leg's query string. `login` and `connect` (the latter
// reserved, unimplemented — connections-api) carry no extra binding. `link` is this
// feature's authenticated identity-linking intent: the start leg requires a valid session
// cookie and binds the state to that user's id, so the callback never has to trust a
// client-supplied provider id (see identities.controller.ts's removed POST link endpoint).

import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { readSessionCookie, verifySessionToken } from '../session-cookie.js';
import {
  assertBoundState,
  OAUTH_STATE_COOKIE,
  signOAuthState,
  type OAuthIntent,
  type OAuthProviderSlug,
  type OAuthStatePayload,
} from './oauth-state.js';

const STATE_COOKIE_TTL_MS = 10 * 60 * 1000;

/** Request augmented by the callback leg's `canActivate` with the verified `state` payload. */
export interface OAuthCallbackRequest extends Request {
  oauthState?: OAuthStatePayload;
}

function getIntent(req: Request): OAuthIntent {
  if (req.query['intent'] === 'connect') return 'connect';
  if (req.query['intent'] === 'link') return 'link';
  return 'login';
}

/** Requires an authenticated session at the `link` intent's start leg; returns its user id. */
function requireLinkSessionUserId(req: Request, jwtSecret: string): string {
  const token = readSessionCookie(req.cookies as Record<string, string | undefined> | undefined);
  if (!token) throw new UnauthorizedException({ error: 'LOGIN_REQUIRED' });
  try {
    return verifySessionToken(token, jwtSecret).sub;
  } catch {
    throw new UnauthorizedException({ error: 'LOGIN_REQUIRED' });
  }
}

function buildStartOptions(
  req: Request,
  res: Response,
  provider: OAuthProviderSlug,
  jwtSecret: string,
  appUrl: string,
): { state: string } {
  const intent = getIntent(req);
  const state =
    intent === 'link'
      ? signOAuthState({ intent, provider, userId: requireLinkSessionUserId(req, jwtSecret) }, jwtSecret)
      : signOAuthState({ intent, provider }, jwtSecret);

  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl.startsWith('https://'),
    path: '/api/oauth',
    maxAge: STATE_COOKIE_TTL_MS,
  });

  return { state };
}

function assertCallbackState(req: Request, jwtSecret: string): OAuthStatePayload {
  const queryState = req.query['state'] as string | undefined;
  const cookieState = (req.cookies as Record<string, string | undefined> | undefined)?.[OAUTH_STATE_COOKIE];
  try {
    return assertBoundState(queryState, cookieState, jwtSecret);
  } catch {
    throw new UnauthorizedException({ error: 'INVALID_STATE' });
  }
}

@Injectable()
export class GithubOAuthGuard extends AuthGuard('github') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext): { state: string } | undefined {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.query['code']) return undefined;
    const res = context.switchToHttp().getResponse<Response>();
    return buildStartOptions(
      req,
      res,
      'github',
      this.config.getOrThrow<string>('JWT_SECRET'),
      this.config.getOrThrow<string>('APP_URL'),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OAuthCallbackRequest>();
    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    if (req.query['code']) {
      req.oauthState = assertCallbackState(req, jwtSecret);
    } else if (getIntent(req) === 'link') {
      requireLinkSessionUserId(req, jwtSecret);
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext): { state: string } | undefined {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.query['code']) return undefined;
    const res = context.switchToHttp().getResponse<Response>();
    return buildStartOptions(
      req,
      res,
      'google',
      this.config.getOrThrow<string>('JWT_SECRET'),
      this.config.getOrThrow<string>('APP_URL'),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OAuthCallbackRequest>();
    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    if (req.query['code']) {
      req.oauthState = assertCallbackState(req, jwtSecret);
    } else if (getIntent(req) === 'link') {
      requireLinkSessionUserId(req, jwtSecret);
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}
