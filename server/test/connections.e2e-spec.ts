// e2e for features/connections-api/spec.md's verification checklist.
//
// Follows the about.e2e-spec.ts / testcontainers.ts conventions: real
// Postgres via testcontainers, real HTTP through supertest. The only things
// stubbed are the outbound calls to the OAuth/OpenID providers themselves
// (GitHub's code->token exchange + profile fetch, Google's code->token
// exchange + profile fetch, Steam's OpenID assertion verification) — the
// same boundary features/oauth-login's reviewed branch mocked at, and the
// only boundary that would otherwise require real provider credentials.
// Everything else (state signing/verification, cookie handling, session
// auth, Prisma persistence, encryption) runs for real.

import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { TokenCipherService } from '../src/connections/token-cipher.service.js';
import { GithubConnectStrategy } from '../src/connections/strategies/github-connect.strategy.js';

describe('Connections (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let cipher: TokenCipherService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    cipher = app.get(TokenCipherService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.serviceConnection.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUserWithCookie(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const token = jwtService.sign({ sub: user.id, role: 'USER', tv: 0 });
    return { userId: user.id, cookie: `session=${token}` };
  }

  function extractCookieValue(setCookieHeader: string | string[] | undefined, name: string): string {
    const raw = (setCookieHeader as unknown as string[] | undefined) ?? [];
    const header = raw.find((c) => c.startsWith(`${name}=`));
    if (!header) throw new Error(`Cookie ${name} not set`);
    return header.split(';')[0].slice(name.length + 1);
  }

  function extractStateFromLocation(location: string): string {
    const url = new URL(location);
    const state = url.searchParams.get('state');
    if (!state) throw new Error('No state in redirect Location');
    return state;
  }

  describe('GET /api/connections', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/connections').expect(401);
    });

    it('returns all registry services, connected:false for services with no row', async () => {
      const { cookie } = await createUserWithCookie('list1@example.com');

      const res = await request(app.getHttpServer()).get('/api/connections').set('Cookie', cookie).expect(200);

      expect(res.body).toEqual({
        connections: [
          { service: 'weather', connected: true, status: 'OK' },
          { service: 'github', connected: false, status: 'OK' },
          { service: 'steam', connected: false, status: 'OK' },
          { service: 'youtube', connected: false, status: 'OK' },
        ],
      });
    });
  });

  describe('connect intent requires a session', () => {
    it('rejects /oauth/github/start?intent=connect with no session, and creates no row', async () => {
      await request(app.getHttpServer()).get('/api/oauth/github/start?intent=connect').expect(401);

      expect(await prisma.serviceConnection.count()).toBe(0);
    });
  });

  describe('GitHub connect handshake', () => {
    it('creates an encrypted ServiceConnection, then GET reflects it and never leaks the token', async () => {
      const { userId, cookie } = await createUserWithCookie('gh1@example.com');
      const strategy = app.get(GithubConnectStrategy);
      (strategy as unknown as { _oauth2: { getOAuthAccessToken: unknown } })._oauth2.getOAuthAccessToken = (
        _code: string,
        _params: unknown,
        cb: (err: unknown, accessToken?: string, refreshToken?: string, params?: unknown) => void,
      ) => cb(null, 'real-github-access-token', undefined, {});
      strategy.userProfile = ((_accessToken: string, cb: (err: unknown, profile?: unknown) => void) =>
        cb(null, { id: 'gh-42', username: 'octocat', provider: 'github' })) as typeof strategy.userProfile;

      const startRes = await request(app.getHttpServer())
        .get('/api/oauth/github/start?intent=connect')
        .set('Cookie', cookie)
        .expect(302);

      const csrfCookie = extractCookieValue(startRes.headers['set-cookie'], 'oauth_csrf');
      const state = extractStateFromLocation(startRes.headers['location']);

      const callbackRes = await request(app.getHttpServer())
        .get(`/api/oauth/github/callback?code=fake-code&state=${encodeURIComponent(state)}`)
        .set('Cookie', [cookie, `oauth_csrf=${csrfCookie}`])
        .expect(302);

      expect(callbackRes.headers['location']).toMatch(/\/d\/[^/?]+$/);

      const row = await prisma.serviceConnection.findUnique({ where: { userId_service: { userId, service: 'github' } } });
      expect(row).not.toBeNull();
      expect(row!.accessTokenEnc).not.toBe('real-github-access-token');
      expect(cipher.decrypt(row!.accessTokenEnc!)).toBe('real-github-access-token');
      expect(row!.externalAccountId).toBe('gh-42');

      const listRes = await request(app.getHttpServer()).get('/api/connections').set('Cookie', cookie).expect(200);
      expect(listRes.body.connections).toContainEqual({ service: 'github', connected: true, status: 'OK' });
      expect(JSON.stringify(listRes.body)).not.toContain('accessTokenEnc');
      expect(JSON.stringify(listRes.body)).not.toContain('real-github-access-token');
    });

    it('rejects a tampered state on the callback, with no row created', async () => {
      const { cookie } = await createUserWithCookie('gh2@example.com');

      const startRes = await request(app.getHttpServer())
        .get('/api/oauth/github/start?intent=connect')
        .set('Cookie', cookie)
        .expect(302);
      const csrfCookie = extractCookieValue(startRes.headers['set-cookie'], 'oauth_csrf');
      const state = extractStateFromLocation(startRes.headers['location']);
      const tamperedState = state.slice(0, -4) + 'AAAA';

      await request(app.getHttpServer())
        .get(`/api/oauth/github/callback?code=fake-code&state=${encodeURIComponent(tamperedState)}`)
        .set('Cookie', [cookie, `oauth_csrf=${csrfCookie}`])
        .expect(401);

      expect(await prisma.serviceConnection.count()).toBe(0);
    });

    it('rejects a callback whose CSRF cookie does not match (missing cookie)', async () => {
      const { cookie } = await createUserWithCookie('gh3@example.com');

      const startRes = await request(app.getHttpServer())
        .get('/api/oauth/github/start?intent=connect')
        .set('Cookie', cookie)
        .expect(302);
      const state = extractStateFromLocation(startRes.headers['location']);

      await request(app.getHttpServer())
        .get(`/api/oauth/github/callback?code=fake-code&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie) // no oauth_csrf cookie sent
        .expect(401);

      expect(await prisma.serviceConnection.count()).toBe(0);
    });

    it('upserts rather than duplicating on a second connect for the same user', async () => {
      const { userId, cookie } = await createUserWithCookie('gh4@example.com');
      const strategy = app.get(GithubConnectStrategy);

      async function connectOnce(token: string): Promise<void> {
        (strategy as unknown as { _oauth2: { getOAuthAccessToken: unknown } })._oauth2.getOAuthAccessToken = (
          _code: string,
          _params: unknown,
          cb: (err: unknown, accessToken?: string, refreshToken?: string, params?: unknown) => void,
        ) => cb(null, token, undefined, {});
        strategy.userProfile = ((_accessToken: string, cb: (err: unknown, profile?: unknown) => void) =>
          cb(null, { id: 'gh-99', username: 'octocat', provider: 'github' })) as typeof strategy.userProfile;

        const startRes = await request(app.getHttpServer())
          .get('/api/oauth/github/start?intent=connect')
          .set('Cookie', cookie)
          .expect(302);
        const csrfCookie = extractCookieValue(startRes.headers['set-cookie'], 'oauth_csrf');
        const state = extractStateFromLocation(startRes.headers['location']);

        await request(app.getHttpServer())
          .get(`/api/oauth/github/callback?code=fake-code&state=${encodeURIComponent(state)}`)
          .set('Cookie', [cookie, `oauth_csrf=${csrfCookie}`])
          .expect(302);
      }

      await connectOnce('first-token');
      await connectOnce('second-token');

      const rows = await prisma.serviceConnection.findMany({ where: { userId, service: 'github' } });
      expect(rows).toHaveLength(1);
      expect(cipher.decrypt(rows[0].accessTokenEnc!)).toBe('second-token');
    });

    it('gives two different users independently encrypted rows for the same service', async () => {
      const userA = await createUserWithCookie('gh5a@example.com');
      const userB = await createUserWithCookie('gh5b@example.com');
      const strategy = app.get(GithubConnectStrategy);

      async function connectAs(user: { cookie: string }, token: string, externalId: string): Promise<void> {
        (strategy as unknown as { _oauth2: { getOAuthAccessToken: unknown } })._oauth2.getOAuthAccessToken = (
          _code: string,
          _params: unknown,
          cb: (err: unknown, accessToken?: string, refreshToken?: string, params?: unknown) => void,
        ) => cb(null, token, undefined, {});
        strategy.userProfile = ((_accessToken: string, cb: (err: unknown, profile?: unknown) => void) =>
          cb(null, { id: externalId, username: externalId, provider: 'github' })) as typeof strategy.userProfile;

        const startRes = await request(app.getHttpServer())
          .get('/api/oauth/github/start?intent=connect')
          .set('Cookie', user.cookie)
          .expect(302);
        const csrfCookie = extractCookieValue(startRes.headers['set-cookie'], 'oauth_csrf');
        const state = extractStateFromLocation(startRes.headers['location']);

        await request(app.getHttpServer())
          .get(`/api/oauth/github/callback?code=fake-code&state=${encodeURIComponent(state)}`)
          .set('Cookie', [user.cookie, `oauth_csrf=${csrfCookie}`])
          .expect(302);
      }

      await connectAs(userA, 'token-a', 'gh-a');
      await connectAs(userB, 'token-b', 'gh-b');

      const rowA = await prisma.serviceConnection.findUnique({
        where: { userId_service: { userId: userA.userId, service: 'github' } },
      });
      const rowB = await prisma.serviceConnection.findUnique({
        where: { userId_service: { userId: userB.userId, service: 'github' } },
      });

      expect(rowA!.accessTokenEnc).not.toBe(rowB!.accessTokenEnc);
      expect(cipher.decrypt(rowA!.accessTokenEnc!)).toBe('token-a');
      expect(cipher.decrypt(rowB!.accessTokenEnc!)).toBe('token-b');
    });
  });

  describe('Steam OpenID connect handshake', () => {
    it('creates a ServiceConnection with externalAccountId=SteamID64 and no token fields', async () => {
      const { userId, cookie } = await createUserWithCookie('steam1@example.com');
      const steamId64 = '76561198000000001';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')),
      );

      const startRes = await request(app.getHttpServer())
        .get('/api/oauth/steam/start?intent=connect')
        .set('Cookie', cookie)
        .expect(302);
      const csrfCookie = extractCookieValue(startRes.headers['set-cookie'], 'oauth_csrf');
      const stateCookie = extractCookieValue(startRes.headers['set-cookie'], 'oauth_state');
      const nonceCookie = extractCookieValue(startRes.headers['set-cookie'], 'oauth_steam_nonce');
      const returnTo = new URL(startRes.headers['location']).searchParams.get('openid.return_to') ?? '';
      expect(new URL(returnTo).searchParams.get('nonce')).toBe(nonceCookie);

      const assertion = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
        'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId64}`,
        'openid.identity': `https://steamcommunity.com/openid/id/${steamId64}`,
        'openid.return_to': returnTo,
        'openid.response_nonce': `${new Date().toISOString()}${randomUUID()}`,
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce',
        'openid.sig': 'sig=',
        nonce: nonceCookie,
      });
      const callbackPath = `/api/oauth/steam/callback?${assertion.toString()}`;
      const cookies = [cookie, `oauth_csrf=${csrfCookie}`, `oauth_state=${stateCookie}`, `oauth_steam_nonce=${nonceCookie}`];

      const callbackRes = await request(app.getHttpServer()).get(callbackPath).set('Cookie', cookies).expect(302);

      // A captured callback replayed with the same response_nonce is refused.
      await request(app.getHttpServer()).get(callbackPath).set('Cookie', cookies).expect(401);
      vi.unstubAllGlobals();

      expect(callbackRes.headers['location']).toMatch(/\/d\/[^/?]+$/);

      const row = await prisma.serviceConnection.findUnique({ where: { userId_service: { userId, service: 'steam' } } });
      expect(row).not.toBeNull();
      expect(row!.externalAccountId).toBe(steamId64);
      expect(row!.accessTokenEnc).toBeNull();
      expect(row!.refreshTokenEnc).toBeNull();
    });
  });

  describe('DELETE /api/connections/{service}', () => {
    it('removes the row so a subsequent GET shows connected:false', async () => {
      const { userId, cookie } = await createUserWithCookie('del1@example.com');
      await prisma.serviceConnection.create({
        data: { userId, service: 'github', externalAccountId: 'gh-1', accessTokenEnc: cipher.encrypt('t'), status: 'OK' },
      });

      await request(app.getHttpServer()).delete('/api/connections/github').set('Cookie', cookie).expect(200);

      const res = await request(app.getHttpServer()).get('/api/connections').set('Cookie', cookie).expect(200);
      expect(res.body.connections).toContainEqual({ service: 'github', connected: false, status: 'OK' });
    });
  });
});
