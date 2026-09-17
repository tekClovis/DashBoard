import type { Response } from 'express';
import { SESSION_COOKIE, SESSION_TTL_SEC } from './session.constants.js';

/** Sets the session cookie with the standard flags — see docs/Architecture.md §5.1. */
export function setSessionCookie(res: Response, appUrl: string, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: appUrl.startsWith('https'),
    maxAge: SESSION_TTL_SEC * 1000,
  });
}

export function clearSessionCookie(res: Response, appUrl: string): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: appUrl.startsWith('https'),
  });
}
