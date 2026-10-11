import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { JwtService } from '../jwt.service.js';
import { OAuthController } from './oauth.controller.js';
import type { OAuthCallbackRequest, OAuthResolvedState } from './oauth.guard.js';
import { OAuthIdentityConflictError, OAuthLinkRefusedError, OAuthNoAccountError } from './oauth-login.service.js';

const APP_URL = 'http://localhost:8080';
const PROFILE = { provider: 'GITHUB', providerUserId: 'gh-1', email: 'a@b.com', emailVerified: true };
const USER = { id: 'u1', role: 'USER', tokenVersion: 3, bannedAt: null };
const LOGIN_STATE: OAuthResolvedState = { intent: 'login', provider: 'github' };
const LINK_STATE: OAuthResolvedState = { intent: 'link', provider: 'github', userId: 'u1' };

function connectState(provider: 'github' | 'google' | 'steam'): OAuthResolvedState {
  return { intent: 'connect', provider, userId: 'u1', csrf: 'h', iat: 0, exp: 0 };
}

function makeDeps() {
  const values: Record<string, string> = { JWT_SECRET: 'test-secret', APP_URL };
  const config = { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] };
  const jwt = new JwtService(config as never);
  const oauthLogin = { loginOrLink: vi.fn().mockResolvedValue(USER), linkIdentity: vi.fn().mockResolvedValue(undefined) };
  const connections = {
    upsertOAuthConnection: vi.fn().mockResolvedValue(undefined),
    upsertSteamConnection: vi.fn().mockResolvedValue(undefined),
  };
  const dashboards = { list: vi.fn().mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]) };
  const controller = new OAuthController(oauthLogin as never, connections as never, dashboards as never, config as never, jwt);
  return { controller, oauthLogin, connections, dashboards, jwt, values };
}

function makeReq(oauthState: OAuthResolvedState | undefined, user: unknown = PROFILE): OAuthCallbackRequest {
  return { oauthState, user } as unknown as OAuthCallbackRequest;
}

function makeRes() {
  const res = { cookie: vi.fn(), clearCookie: vi.fn(), redirect: vi.fn() };
  return { res, asResponse: res as unknown as Response };
}

describe('OAuthController', () => {
  describe('providers', () => {
    it('reports which login providers have credentials', () => {
      const { controller, values } = makeDeps();
      Object.assign(values, { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });

      expect(controller.providers()).toEqual({ github: { configured: true }, google: { configured: false } });
    });
  });

  it('clears both handshake cookies on any callback', async () => {
    const { controller } = makeDeps();
    const { res, asResponse } = makeRes();

    await controller.githubCallback(makeReq(LOGIN_STATE), asResponse);

    expect(res.clearCookie).toHaveBeenCalledWith('oauth_state', { path: '/api/oauth' });
    expect(res.clearCookie).toHaveBeenCalledWith('oauth_csrf', { path: '/api/oauth' });
    expect(res.clearCookie).toHaveBeenCalledWith('oauth_steam_nonce', { path: '/api/oauth' });
  });

  describe('login', () => {
    it('sets a session cookie for the resolved user and redirects into the app', async () => {
      const { controller, oauthLogin, jwt } = makeDeps();
      const { res, asResponse } = makeRes();

      await controller.githubCallback(makeReq(LOGIN_STATE), asResponse);

      expect(oauthLogin.loginOrLink).toHaveBeenCalledWith(PROFILE);
      const [name, token, options] = res.cookie.mock.calls[0] as [string, string, Record<string, unknown>];
      expect(name).toBe('session');
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
      expect(jwt.verify(token)).toMatchObject({ sub: 'u1', role: 'USER', tv: 3 });
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/d/placeholder`);
    });

    it('refuses a banned user without issuing a session', async () => {
      const { controller, oauthLogin } = makeDeps();
      oauthLogin.loginOrLink.mockResolvedValue({ ...USER, bannedAt: new Date() });
      const { res, asResponse } = makeRes();

      await controller.googleCallback(makeReq({ intent: 'login', provider: 'google' }), asResponse);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/login?error=ACCOUNT_BANNED`);
    });

    it('redirects to login when auto-linking by email is refused', async () => {
      const { controller, oauthLogin } = makeDeps();
      oauthLogin.loginOrLink.mockRejectedValue(new OAuthLinkRefusedError());
      const { res, asResponse } = makeRes();

      await controller.githubCallback(makeReq(LOGIN_STATE), asResponse);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/login?error=EMAIL_LINK_REQUIRED`);
    });

    it('redirects to login when no account matches the provider', async () => {
      const { controller, oauthLogin } = makeDeps();
      oauthLogin.loginOrLink.mockRejectedValue(new OAuthNoAccountError());
      const { res, asResponse } = makeRes();

      await controller.githubCallback(makeReq(LOGIN_STATE), asResponse);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/login?error=OAUTH_NO_ACCOUNT`);
    });

    it('rethrows an unexpected login failure without redirecting', async () => {
      const { controller, oauthLogin } = makeDeps();
      const failure = new Error('db down');
      oauthLogin.loginOrLink.mockRejectedValue(failure);
      const { res, asResponse } = makeRes();

      await expect(controller.githubCallback(makeReq(LOGIN_STATE), asResponse)).rejects.toBe(failure);
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  describe('link', () => {
    it('links the identity to the state-bound user and returns to the first dashboard without a new session', async () => {
      const { controller, oauthLogin, dashboards } = makeDeps();
      const { res, asResponse } = makeRes();

      await controller.githubCallback(makeReq(LINK_STATE), asResponse);

      expect(oauthLogin.linkIdentity).toHaveBeenCalledWith('u1', PROFILE);
      expect(oauthLogin.loginOrLink).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
      expect(dashboards.list).toHaveBeenCalledWith('u1');
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/d/d1`);
    });

    it('reports an identity already linked to someone else', async () => {
      const { controller, oauthLogin } = makeDeps();
      oauthLogin.linkIdentity.mockRejectedValue(new OAuthIdentityConflictError());
      const { res, asResponse } = makeRes();

      await controller.githubCallback(makeReq(LINK_STATE), asResponse);

      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/profile?error=IDENTITY_ALREADY_LINKED`);
    });

    it('rethrows an unexpected link failure without redirecting', async () => {
      const { controller, oauthLogin } = makeDeps();
      const failure = new Error('db down');
      oauthLogin.linkIdentity.mockRejectedValue(failure);
      const { res, asResponse } = makeRes();

      await expect(controller.githubCallback(makeReq(LINK_STATE), asResponse)).rejects.toBe(failure);
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    const connectResult = { externalAccountId: 'ext-1', accessToken: 'at', refreshToken: 'rt', scopes: ['repo'] };

    it('stores a GitHub connection for the state-bound user', async () => {
      const { controller, connections, oauthLogin } = makeDeps();
      const { res, asResponse } = makeRes();

      await controller.githubCallback(makeReq(connectState('github'), connectResult), asResponse);

      expect(connections.upsertOAuthConnection).toHaveBeenCalledWith('u1', 'github', connectResult);
      expect(oauthLogin.loginOrLink).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/d/d1`);
    });

    it('stores a Google connect as the youtube service', async () => {
      const { controller, connections } = makeDeps();
      const { res, asResponse } = makeRes();

      await controller.googleCallback(makeReq(connectState('google'), connectResult), asResponse);

      expect(connections.upsertOAuthConnection).toHaveBeenCalledWith('u1', 'youtube', connectResult);
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/d/d1`);
    });

    it('stores the token expiry of a Google connect', async () => {
      const { controller, connections } = makeDeps();
      const { asResponse } = makeRes();
      const expiresAt = new Date('2026-01-01T01:00:00Z');

      await controller.googleCallback(makeReq(connectState('google'), { ...connectResult, expiresAt }), asResponse);

      expect(connections.upsertOAuthConnection).toHaveBeenCalledWith(
        'u1',
        'youtube',
        expect.objectContaining({ expiresAt }),
      );
    });

    it('stores a Steam connection from the OpenID result', async () => {
      const { controller, connections } = makeDeps();
      const { res, asResponse } = makeRes();

      await controller.steamCallback(makeReq(connectState('steam'), { steamId64: '7656' }), asResponse);

      expect(connections.upsertSteamConnection).toHaveBeenCalledWith('u1', '7656');
      expect(connections.upsertOAuthConnection).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/d/d1`);
    });

    it('looks up the first dashboard of the state-bound user', async () => {
      const { controller, dashboards } = makeDeps();
      const { asResponse } = makeRes();

      await controller.githubCallback(makeReq(connectState('github'), connectResult), asResponse);

      expect(dashboards.list).toHaveBeenCalledWith('u1');
    });

    it('redirects with CONNECT_FAILED when storing the connection fails', async () => {
      const { controller, connections } = makeDeps();
      connections.upsertOAuthConnection.mockRejectedValue(new Error('db down'));
      const { res, asResponse } = makeRes();

      await controller.githubCallback(makeReq(connectState('github'), connectResult), asResponse);

      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(`${APP_URL}/connections?error=CONNECT_FAILED`);
    });
  });

  it('never logs a user in through the Steam callback', async () => {
    const { controller, oauthLogin } = makeDeps();
    const { res, asResponse } = makeRes();

    await controller.steamCallback(makeReq(LOGIN_STATE), asResponse);

    expect(oauthLogin.loginOrLink).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
