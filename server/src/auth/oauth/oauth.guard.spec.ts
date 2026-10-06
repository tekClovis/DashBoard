import { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import passport from 'passport';
import { OAUTH_CSRF_COOKIE, signConnectState, verifyConnectState } from '../../connections/oauth-state.js';
import { YOUTUBE_CONNECT_SCOPES } from '../../connections/strategies/google-connect.strategy.js';
import { JwtService } from '../jwt.service.js';
import { OAUTH_STATE_COOKIE, signOAuthState, verifyOAuthState } from './oauth-state.js';
import { GithubOAuthGuard, GoogleOAuthGuard, SteamOAuthGuard, type OAuthCallbackRequest } from './oauth.guard.js';

const SECRET = 'test-secret';
const PROVIDER_USER = { providerUserId: 'gh-1' };
const STATE_COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 600_000, path: '/api/oauth' };
const INVALID_STATE = { status: 401, response: { error: 'INVALID_STATE' } };
const LOGIN_REQUIRED = { status: 401, response: { error: 'LOGIN_REQUIRED' } };

type PassportOutcome = { err: unknown } | { user: unknown; info?: unknown };
type AuthenticateCallback = (err: unknown, user: unknown, info: unknown) => void;

/** Replaces the provider round trip (the only network boundary here) with a fixed outcome. */
function stubPassport(outcome: PassportOutcome = { user: PROVIDER_USER }) {
  const implementation = (_strategy: string, _options: unknown, callback: AuthenticateCallback) => () => {
    if ('err' in outcome) callback(outcome.err, false, undefined);
    else callback(null, outcome.user, outcome.info);
  };
  return vi.spyOn(passport, 'authenticate').mockImplementation(implementation as never);
}

function makeDeps(appUrl = 'http://localhost:8080') {
  const values: Record<string, string> = { JWT_SECRET: SECRET, APP_URL: appUrl };
  const config = { getOrThrow: (key: string) => values[key] };
  const jwt = new JwtService(config as never);
  return { config, jwt, sessionToken: jwt.sign({ sub: 'u1', role: 'USER', tv: 0 }) };
}

function makeExchange(query: Record<string, string>, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
  const req = { query, headers: { cookie } } as unknown as OAuthCallbackRequest;
  const res = { cookie: vi.fn(), redirect: vi.fn() };
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  /** Value of a cookie the guard set on the response, or undefined. */
  const setCookie = (name: string) => res.cookie.mock.calls.find((call) => call[0] === name)?.[1] as string | undefined;
  return { req, res, context, setCookie };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GithubOAuthGuard', () => {
  function makeGuard(appUrl?: string) {
    const deps = makeDeps(appUrl);
    return { ...deps, guard: new GithubOAuthGuard(deps.config as never, deps.jwt) };
  }

  describe('start leg', () => {
    it('signs a login state, binds it to a short-lived cookie and hands it to the login strategy', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const { res, context, setCookie } = makeExchange({});

      await guard.canActivate(context);

      const state = setCookie(OAUTH_STATE_COOKIE);
      expect(verifyOAuthState(state ?? '', SECRET)).toEqual({ intent: 'login', provider: 'github' });
      expect(res.cookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, state, STATE_COOKIE_OPTIONS);
      expect(authenticate).toHaveBeenCalledWith('github', { state }, expect.any(Function));
    });

    it('marks the state cookie secure when the app is served over https', async () => {
      stubPassport();
      const { guard } = makeGuard('https://dash.example.com');
      const { res, context } = makeExchange({});

      await guard.canActivate(context);

      expect(res.cookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, expect.any(String), {
        ...STATE_COOKIE_OPTIONS,
        secure: true,
      });
    });

    it('treats an unrecognised intent as login', async () => {
      stubPassport();
      const { guard } = makeGuard();
      const { context, setCookie } = makeExchange({ intent: 'admin' });

      await guard.canActivate(context);

      expect(verifyOAuthState(setCookie(OAUTH_STATE_COOKIE) ?? '', SECRET)).toEqual({
        intent: 'login',
        provider: 'github',
      });
    });

    it('binds a link state to the session user id', async () => {
      stubPassport();
      const { guard, sessionToken } = makeGuard();
      const { context, setCookie } = makeExchange({ intent: 'link' }, { session: sessionToken });

      await guard.canActivate(context);

      expect(verifyOAuthState(setCookie(OAUTH_STATE_COOKIE) ?? '', SECRET)).toEqual({
        intent: 'link',
        provider: 'github',
        userId: 'u1',
      });
    });

    it.each(['link', 'connect'])('rejects a %s start without a session before contacting the provider', async (intent) => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const { res, context } = makeExchange({ intent });

      await expect(guard.canActivate(context)).rejects.toMatchObject(LOGIN_REQUIRED);
      expect(res.cookie).not.toHaveBeenCalled();
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('rejects a link start whose session token does not verify', async () => {
      const authenticate = stubPassport();
      const { guard, sessionToken } = makeGuard();
      const { context } = makeExchange({ intent: 'link' }, { session: `${sessionToken}x` });

      await expect(guard.canActivate(context)).rejects.toMatchObject(LOGIN_REQUIRED);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('signs a CSRF-bound connect state for the session user and uses the connect strategy', async () => {
      const authenticate = stubPassport();
      const { guard, sessionToken } = makeGuard();
      const { res, context, setCookie } = makeExchange({ intent: 'connect' }, { session: sessionToken });

      await guard.canActivate(context);

      const csrf = setCookie(OAUTH_CSRF_COOKIE);
      expect(res.cookie).toHaveBeenCalledWith(OAUTH_CSRF_COOKIE, csrf, STATE_COOKIE_OPTIONS);
      expect(setCookie(OAUTH_STATE_COOKIE)).toBeUndefined();
      const [strategy, options] = authenticate.mock.calls[0] as unknown as [string, { state: string }];
      expect(strategy).toBe('github-connect');
      expect(options).toEqual({ state: expect.any(String) });
      expect(verifyConnectState(options.state, 'github', csrf, SECRET)).toMatchObject({
        intent: 'connect',
        provider: 'github',
        userId: 'u1',
      });
    });
  });

  describe('callback leg', () => {
    it('accepts a cookie-bound login state and attaches the verified state and provider user', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { req, res, context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: state });

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(req.oauthState).toEqual({ intent: 'login', provider: 'github' });
      expect(req.user).toBe(PROVIDER_USER);
      expect(authenticate).toHaveBeenCalledWith('github', { session: false }, expect.any(Function));
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('attaches the bound user id of a link state', async () => {
      stubPassport();
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'link', provider: 'github', userId: 'u1' }, SECRET);
      const { req, context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: state });

      await guard.canActivate(context);

      expect(req.oauthState).toEqual({ intent: 'link', provider: 'github', userId: 'u1' });
    });

    it('rejects a callback without a state param', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { context } = makeExchange({ code: 'c' }, { [OAUTH_STATE_COOKIE]: state });

      await expect(guard.canActivate(context)).rejects.toMatchObject(INVALID_STATE);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('rejects a validly signed state that is not the one bound to the cookie', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const other = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: other });

      await expect(guard.canActivate(context)).rejects.toMatchObject(INVALID_STATE);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('rejects a state with no cookie at all', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { context } = makeExchange({ code: 'c', state });

      await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('rejects an expired state', async () => {
      vi.useFakeTimers();
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: state });
      vi.advanceTimersByTime(11 * 60 * 1000);

      await expect(guard.canActivate(context)).rejects.toMatchObject(INVALID_STATE);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('does not let the request through when the provider handshake fails on a login state', async () => {
      const failure = new Error('token exchange failed');
      stubPassport({ err: failure });
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { req, context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: state });

      await expect(guard.canActivate(context)).rejects.toBe(failure);
      expect(req.user).toBeUndefined();
    });

    it('surfaces a provider handshake error on a login state instead of masking it as INVALID_STATE', async () => {
      stubPassport({ err: new Error('token exchange failed') });
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: state });

      await expect(guard.canActivate(context)).rejects.toThrow('token exchange failed');
    });

    it('surfaces the no-user outcome on a login state instead of masking it as INVALID_STATE', async () => {
      stubPassport({ user: false, info: { message: 'access_denied' } });
      const { guard } = makeGuard();
      const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const { context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: state });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 401,
        response: { message: 'access_denied' },
      });
    });

    it('accepts a CSRF-bound connect state and dispatches to the connect strategy', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signConnectState({ provider: 'github', userId: 'u1', csrfToken: 'csrf-token' }, SECRET);
      const { req, context } = makeExchange({ code: 'c', state }, { [OAUTH_CSRF_COOKIE]: 'csrf-token' });

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(req.oauthState).toMatchObject({ intent: 'connect', provider: 'github', userId: 'u1' });
      expect(req.user).toBe(PROVIDER_USER);
      expect(authenticate).toHaveBeenCalledWith('github-connect', { session: false }, expect.any(Function));
    });

    describe('provider denial (error, no code)', () => {
      async function deny(query: Record<string, string>, cookies: Record<string, string>) {
        const authenticate = stubPassport();
        const { guard } = makeGuard();
        const { context, res, setCookie } = makeExchange({ error: 'access_denied', ...query }, cookies);
        const result = await guard.canActivate(context);
        expect(authenticate).not.toHaveBeenCalled();
        expect(setCookie(OAUTH_STATE_COOKIE)).toBeUndefined();
        return { result, redirect: res.redirect };
      }

      it('sends a denied connect back to /connections with an error', async () => {
        const state = signConnectState({ provider: 'github', userId: 'u1', csrfToken: 'csrf-token' }, SECRET);
        const { result, redirect } = await deny({ state }, { [OAUTH_CSRF_COOKIE]: 'csrf-token' });
        expect(result).toBe(false);
        expect(redirect).toHaveBeenCalledExactlyOnceWith('http://localhost:8080/connections?error=OAUTH_DENIED');
      });

      it('sends a denied link back to /profile with an error', async () => {
        const state = signOAuthState({ intent: 'link', provider: 'github', userId: 'u1' }, SECRET);
        const { result, redirect } = await deny({ state }, { [OAUTH_STATE_COOKIE]: state });
        expect(result).toBe(false);
        expect(redirect).toHaveBeenCalledExactlyOnceWith('http://localhost:8080/profile?error=OAUTH_DENIED');
      });

      it('sends a denied login back to /login with an error', async () => {
        const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
        const { result, redirect } = await deny({ state }, { [OAUTH_STATE_COOKIE]: state });
        expect(result).toBe(false);
        expect(redirect).toHaveBeenCalledExactlyOnceWith('http://localhost:8080/login?error=OAUTH_DENIED');
      });
    });

    it('rejects a denial callback whose state does not verify', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const { context } = makeExchange({ error: 'access_denied' });

      await expect(guard.canActivate(context)).rejects.toMatchObject(INVALID_STATE);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('rejects a connect state whose CSRF cookie does not match', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signConnectState({ provider: 'github', userId: 'u1', csrfToken: 'csrf-token' }, SECRET);
      const { context } = makeExchange({ code: 'c', state }, { [OAUTH_CSRF_COOKIE]: 'other-token' });

      await expect(guard.canActivate(context)).rejects.toMatchObject(INVALID_STATE);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it('rejects a connect state signed for another provider', async () => {
      const authenticate = stubPassport();
      const { guard } = makeGuard();
      const state = signConnectState({ provider: 'google', userId: 'u1', csrfToken: 'csrf-token' }, SECRET);
      const { context } = makeExchange({ code: 'c', state }, { [OAUTH_CSRF_COOKIE]: 'csrf-token' });

      await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
      expect(authenticate).not.toHaveBeenCalled();
    });

    describe('provider outcome on a connect state', () => {
      function connectCallback() {
        const { guard } = makeGuard();
        const state = signConnectState({ provider: 'github', userId: 'u1', csrfToken: 'csrf-token' }, SECRET);
        const { context } = makeExchange({ code: 'c', state }, { [OAUTH_CSRF_COOKIE]: 'csrf-token' });
        return guard.canActivate(context);
      }

      it('propagates the provider error', async () => {
        const failure = new Error('token exchange failed');
        stubPassport({ err: failure });

        await expect(connectCallback()).rejects.toBe(failure);
      });

      it('wraps a non-Error provider failure in an Error', async () => {
        stubPassport({ err: 'boom' });

        await expect(connectCallback()).rejects.toThrow('OAuth handshake failed.');
      });

      it('rejects with 401 and the provider info when no user comes back', async () => {
        stubPassport({ user: false, info: { message: 'access_denied' } });

        await expect(connectCallback()).rejects.toMatchObject({
          status: 401,
          response: { message: 'access_denied' },
        });
      });
    });
  });
});

describe('GoogleOAuthGuard', () => {
  function makeGuard() {
    const deps = makeDeps();
    return { ...deps, guard: new GoogleOAuthGuard(deps.config as never, deps.jwt) };
  }

  it('signs login states for google and uses the google strategy', async () => {
    const authenticate = stubPassport();
    const { guard } = makeGuard();
    const { context, setCookie } = makeExchange({});

    await guard.canActivate(context);

    const state = setCookie(OAUTH_STATE_COOKIE);
    expect(verifyOAuthState(state ?? '', SECRET)).toEqual({ intent: 'login', provider: 'google' });
    expect(authenticate).toHaveBeenCalledWith('google', { state }, expect.any(Function));
  });

  it('requests offline YouTube access on a connect start', async () => {
    const authenticate = stubPassport();
    const { guard, sessionToken } = makeGuard();
    const { context, setCookie } = makeExchange({ intent: 'connect' }, { session: sessionToken });

    await guard.canActivate(context);

    const [strategy, options] = authenticate.mock.calls[0] as unknown as [string, { state: string }];
    expect(strategy).toBe('google-connect');
    expect(options).toEqual({
      state: expect.any(String),
      accessType: 'offline',
      prompt: 'consent',
      scope: YOUTUBE_CONNECT_SCOPES,
    });
    expect(verifyConnectState(options.state, 'google', setCookie(OAUTH_CSRF_COOKIE), SECRET).userId).toBe('u1');
  });

  it('rejects a login state that was signed for another provider', async () => {
    const authenticate = stubPassport();
    const { guard } = makeGuard();
    const state = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
    const { context } = makeExchange({ code: 'c', state }, { [OAUTH_STATE_COOKIE]: state });

    await expect(guard.canActivate(context)).rejects.toMatchObject(INVALID_STATE);
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe('SteamOAuthGuard', () => {
  function makeGuard() {
    const deps = makeDeps();
    return { ...deps, guard: new SteamOAuthGuard(deps.config as never, deps.jwt) };
  }

  it('rejects a start without a session', async () => {
    const authenticate = stubPassport();
    const { guard } = makeGuard();
    const { res, context } = makeExchange({});

    await expect(guard.canActivate(context)).rejects.toMatchObject(LOGIN_REQUIRED);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('stores the CSRF-bound state in a cookie on start, since OpenID cannot echo it', async () => {
    const authenticate = stubPassport();
    const { guard, sessionToken } = makeGuard();
    const { res, context, setCookie } = makeExchange({}, { session: sessionToken });

    await guard.canActivate(context);

    const state = setCookie(OAUTH_STATE_COOKIE);
    const csrf = setCookie(OAUTH_CSRF_COOKIE);
    expect(verifyConnectState(state ?? '', 'steam', csrf, SECRET)).toMatchObject({ provider: 'steam', userId: 'u1' });
    expect(res.cookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, state, STATE_COOKIE_OPTIONS);
    expect(res.cookie).toHaveBeenCalledWith(OAUTH_CSRF_COOKIE, csrf, STATE_COOKIE_OPTIONS);
    expect(authenticate).toHaveBeenCalledWith('steam-connect', { state, session: false }, expect.any(Function));
  });

  it('accepts an OpenID callback whose cookie state matches the CSRF cookie', async () => {
    const authenticate = stubPassport({ user: { steamId64: '7656' } });
    const { guard } = makeGuard();
    const state = signConnectState({ provider: 'steam', userId: 'u1', csrfToken: 'csrf-token' }, SECRET);
    const { req, context } = makeExchange(
      { 'openid.mode': 'id_res' },
      { [OAUTH_STATE_COOKIE]: state, [OAUTH_CSRF_COOKIE]: 'csrf-token' },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(req.oauthState).toMatchObject({ intent: 'connect', provider: 'steam', userId: 'u1' });
    expect(req.user).toEqual({ steamId64: '7656' });
    expect(authenticate).toHaveBeenCalledWith('steam-connect', { session: false }, expect.any(Function));
  });

  const steamState = signConnectState({ provider: 'steam', userId: 'u1', csrfToken: 'csrf-token' }, SECRET);

  it.each<[string, Record<string, string>]>([
    ['no state cookie', { [OAUTH_CSRF_COOKIE]: 'csrf-token' }],
    ['no CSRF cookie', { [OAUTH_STATE_COOKIE]: steamState }],
    ['a mismatched CSRF cookie', { [OAUTH_STATE_COOKIE]: steamState, [OAUTH_CSRF_COOKIE]: 'other-token' }],
  ])('rejects an OpenID callback with %s', async (_label, cookies) => {
    const authenticate = stubPassport();
    const { guard } = makeGuard();
    const { context } = makeExchange({ 'openid.mode': 'id_res' }, cookies);

    await expect(guard.canActivate(context)).rejects.toMatchObject(INVALID_STATE);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
