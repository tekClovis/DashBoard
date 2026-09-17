import { describe, expect, it, vi } from 'vitest';
import { clearSessionCookie, issueSessionCookie, verifySessionToken } from './session-cookie.js';

function makeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() };
}

describe('session-cookie', () => {
  it('signs a JWT with sub/role/tv and sets an httpOnly, SameSite=Lax cookie', () => {
    const res = makeRes();
    issueSessionCookie(res as never, 'http://localhost:8080', 'secret', {
      id: 'u1',
      role: 'USER',
      tokenVersion: 3,
    });

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, token, opts] = res.cookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe('session');
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' });

    const payload = verifySessionToken(token, 'secret');
    expect(payload).toMatchObject({ sub: 'u1', role: 'USER', tv: 3 });
  });

  it('sets Secure when APP_URL is https', () => {
    const res = makeRes();
    issueSessionCookie(res as never, 'https://dashboard.example.com', 'secret', {
      id: 'u1',
      role: 'USER',
      tokenVersion: 0,
    });

    const [, , opts] = res.cookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(opts).toMatchObject({ secure: true });
  });

  it('clears the session cookie', () => {
    const res = makeRes();
    clearSessionCookie(res as never);
    expect(res.clearCookie).toHaveBeenCalledWith('session', { path: '/' });
  });
});
