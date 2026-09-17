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
// `intent` is read from the start leg's query string but only 'login' is implemented by
// this feature; the shape supports 'connect' being added later (connections-api) without
// reworking this guard.

import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { assertBoundState, OAUTH_STATE_COOKIE, signOAuthState, type OAuthProviderSlug } from './oauth-state.js';

const STATE_COOKIE_TTL_MS = 10 * 60 * 1000;

function buildStartOptions(
  req: Request,
  res: Response,
  provider: OAuthProviderSlug,
  jwtSecret: string,
  appUrl: string,
): { state: string } {
  const intent = req.query['intent'] === 'connect' ? 'connect' : 'login';
  const state = signOAuthState({ intent, provider }, jwtSecret);

  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl.startsWith('https://'),
    path: '/api/oauth',
    maxAge: STATE_COOKIE_TTL_MS,
  });

  return { state };
}

function assertCallbackState(req: Request, jwtSecret: string): void {
  const queryState = req.query['state'] as string | undefined;
  const cookieState = (req.cookies as Record<string, string | undefined> | undefined)?.[OAUTH_STATE_COOKIE];
  try {
    assertBoundState(queryState, cookieState, jwtSecret);
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
    const req = context.switchToHttp().getRequest<Request>();
    if (req.query['code']) {
      assertCallbackState(req, this.config.getOrThrow<string>('JWT_SECRET'));
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
    const req = context.switchToHttp().getRequest<Request>();
    if (req.query['code']) {
      assertCallbackState(req, this.config.getOrThrow<string>('JWT_SECRET'));
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}
