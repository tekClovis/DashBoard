// Session-cookie-issuing helper — matches the contract documented by `auth-session`
// (features/auth-session/spec.md, docs/Architecture.md §5.1 "Session"):
//   - One JWT (`sub`, `role`, `tv` = tokenVersion), 7-day expiry, signed with JWT_SECRET.
//   - httpOnly; SameSite=Lax; Path=/ cookie, plus Secure when APP_URL is https.
//
// `auth-session` builds the same shape on its own unmerged branch. This copy exists so
// `oauth-login` doesn't block on that branch landing first; the two are meant to be
// reconciled into one shared implementation by hand when both PRs merge (see
// features/oauth-login's build report for the reconciliation note).

import jwt from 'jsonwebtoken';
import type { Response } from 'express';

const SESSION_COOKIE = 'session';
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  role: string;
  tokenVersion: number;
}

export function issueSessionCookie(res: Response, appUrl: string, jwtSecret: string, user: SessionUser): void {
  const token = jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, jwtSecret, {
    expiresIn: SESSION_TTL_SEC,
  });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl.startsWith('https://'),
    path: '/',
    maxAge: SESSION_TTL_SEC * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function verifySessionToken(token: string, jwtSecret: string): { sub: string; role: string; tv: number } {
  return jwt.verify(token, jwtSecret) as { sub: string; role: string; tv: number };
}

export function readSessionCookie(cookies: Record<string, string | undefined> | undefined): string | undefined {
  return cookies?.[SESSION_COOKIE];
}
