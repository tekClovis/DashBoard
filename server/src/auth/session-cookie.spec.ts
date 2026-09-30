import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

function makeRes() {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  return { res, asResponse: res as unknown as Response };
}

describe('setSessionCookie', () => {
  it('sets an httpOnly, lax, site-wide cookie that lasts seven days', () => {
    const { res, asResponse } = makeRes();

    setSessionCookie(asResponse, 'http://localhost:8080', 'token-1');

    expect(res.cookie).toHaveBeenCalledExactlyOnceWith('session', 'token-1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it('marks the cookie secure when the app is served over https', () => {
    const { res, asResponse } = makeRes();

    setSessionCookie(asResponse, 'https://dash.example.com', 'token-1');

    expect(res.cookie).toHaveBeenCalledWith('session', 'token-1', expect.objectContaining({ secure: true }));
  });
});

describe('clearSessionCookie', () => {
  it.each([
    ['http://localhost:8080', false],
    ['https://dash.example.com', true],
  ])('clears the cookie with the flags it was set with (%s)', (appUrl, secure) => {
    const { res, asResponse } = makeRes();

    clearSessionCookie(asResponse, appUrl);

    expect(res.clearCookie).toHaveBeenCalledExactlyOnceWith('session', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure,
    });
  });
});
