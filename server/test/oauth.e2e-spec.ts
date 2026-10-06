import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { GithubStrategy } from '../src/auth/oauth/github.strategy.js';
import { GoogleStrategy } from '../src/auth/oauth/google.strategy.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';

interface OAuth2Internal {
  _oauth2: {
    getOAuthAccessToken: (
      code: string,
      params: unknown,
      cb: (err: unknown, accessToken?: string, refreshToken?: string, params2?: unknown) => void,
    ) => void;
  };
  userProfile: (accessToken: string, done: (err: unknown, profile?: unknown) => void) => void;
}

function stubStrategyProfile(strategy: GithubStrategy | GoogleStrategy, profile: unknown): void {
  const internal = strategy as unknown as OAuth2Internal;
  vi.spyOn(internal._oauth2, 'getOAuthAccessToken').mockImplementation((_code, _params, cb) => {
    cb(null, 'fake-access-token', 'fake-refresh-token', {});
  });
  vi.spyOn(internal, 'userProfile').mockImplementation((_accessToken, done) => {
    done(null, profile);
  });
}

function githubProfile(id: string, email: string, verified: boolean) {
  return { id, provider: 'github', emails: [{ value: email, primary: true, verified }] };
}

function googleProfile(id: string, email: string, verified: boolean) {
  return { id, provider: 'google', emails: [{ value: email }], _json: { email_verified: verified } };
}

function extractCookie(res: request.Response, name: string): string {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const line = raw.find((c) => c.startsWith(`${name}=`));
  if (!line) throw new Error(`cookie ${name} not set`);
  return line.split(';')[0]!;
}

describe('OAuth login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let github: GithubStrategy;
  let google: GoogleStrategy;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    jwtService = moduleFixture.get(JwtService);
    github = moduleFixture.get(GithubStrategy);
    google = moduleFixture.get(GoogleStrategy);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.authIdentity.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('start', () => {
    it('redirects to GitHub authorize URL with client_id, scope, and a signed state, bound to a cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/oauth/github/start?intent=login').expect(302);

      const location = new URL(res.headers['location'] as string);
      expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
      expect(location.searchParams.get('client_id')).toBe('test-github-client-id');
      expect(location.searchParams.get('scope')).toContain('user:email');
      expect(location.searchParams.get('state')).toBeTruthy();

      const cookie = extractCookie(res, 'oauth_state');
      expect(cookie).toContain(location.searchParams.get('state')!);
    });
  });

  describe('callback — invalid/expired state (checklist 7)', () => {
    it('rejects a callback whose state does not match the cookie, without touching the provider', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/oauth/github/callback?code=fake&state=bogus-state')
        .set('Cookie', 'oauth_state=different-state')
        .expect(401);

      expect(res.body).toMatchObject({ error: 'INVALID_STATE' });
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejects a callback with no oauth_state cookie at all', async () => {
      await request(app.getHttpServer())
        .get('/api/oauth/github/callback?code=fake&state=whatever')
        .expect(401);
    });
  });

  async function startAndGetState(provider: 'github' | 'google'): Promise<{ cookie: string; state: string }> {
    const res = await request(app.getHttpServer()).get(`/api/oauth/${provider}/start?intent=login`).expect(302);
    const location = new URL(res.headers['location'] as string);
    return { cookie: extractCookie(res, 'oauth_state'), state: location.searchParams.get('state')! };
  }

  describe.each([
    { provider: 'github' as const, getStrategy: () => github, makeProfile: githubProfile },
    { provider: 'google' as const, getStrategy: () => google, makeProfile: googleProfile },
  ])('$provider callback (checklist 2-6)', ({ provider, getStrategy, makeProfile }) => {
    const dbProvider = provider.toUpperCase();

    it('logs in the existing identity owner without creating a duplicate user/identity', async () => {
      const user = await prisma.user.create({ data: { email: `existing-${provider}@example.com`, emailVerifiedAt: new Date() } });
      await prisma.authIdentity.create({
        data: { userId: user.id, provider: dbProvider as never, providerUserId: `${provider}-100` },
      });
      stubStrategyProfile(getStrategy(), makeProfile(`${provider}-100`, 'unused@example.com', true));

      const { cookie, state } = await startAndGetState(provider);
      const res = await request(app.getHttpServer())
        .get(`/api/oauth/${provider}/callback?code=fake&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers['location']).toContain('/d/placeholder');
      expect(extractCookie(res, 'session')).toBeTruthy();
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.authIdentity.count()).toBe(1);
    });

    it('auto-links when the provider email is verified and the local user is confirmed', async () => {
      const user = await prisma.user.create({ data: { email: `auto-link-${provider}@example.com`, emailVerifiedAt: new Date() } });
      stubStrategyProfile(getStrategy(), makeProfile(`${provider}-200`, user.email, true));

      const { cookie, state } = await startAndGetState(provider);
      const res = await request(app.getHttpServer())
        .get(`/api/oauth/${provider}/callback?code=fake&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers['location']).toContain('/d/placeholder');
      expect(extractCookie(res, 'session')).toBeTruthy();
      expect(await prisma.user.count()).toBe(1);
      const identity = await prisma.authIdentity.findFirst({ where: { userId: user.id } });
      expect(identity).toMatchObject({ provider: dbProvider, providerUserId: `${provider}-200` });
    });

    it('refuses when the local user is unconfirmed: no login, no identity created', async () => {
      const user = await prisma.user.create({ data: { email: `unconfirmed-${provider}@example.com`, emailVerifiedAt: null } });
      stubStrategyProfile(getStrategy(), makeProfile(`${provider}-300`, user.email, true));

      const { cookie, state } = await startAndGetState(provider);
      const res = await request(app.getHttpServer())
        .get(`/api/oauth/${provider}/callback?code=fake&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers['location']).toContain('/login');
      expect(res.headers['location']).toContain('EMAIL_LINK_REQUIRED');
      expect(() => extractCookie(res, 'session')).toThrow();
      expect(await prisma.authIdentity.count()).toBe(0);
    });

    it('refuses when nothing matches: no login, no user or identity created', async () => {
      stubStrategyProfile(getStrategy(), makeProfile(`${provider}-400`, `brand-new-${provider}@example.com`, true));

      const { cookie, state } = await startAndGetState(provider);
      const res = await request(app.getHttpServer())
        .get(`/api/oauth/${provider}/callback?code=fake&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers['location']).toContain('/login');
      expect(res.headers['location']).toContain('OAUTH_NO_ACCOUNT');
      expect(() => extractCookie(res, 'session')).toThrow();
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.authIdentity.count()).toBe(0);
    });
  });

  describe('identities link/unlink (checklist 8-9)', () => {
    function sessionCookieFor(userId: string): string {
      const token = jwtService.sign({ sub: userId, role: 'USER', tv: 0 });
      return `session=${token}`;
    }

    async function startLinkAndGetState(
      provider: 'github' | 'google',
      sessionCookie: string,
    ): Promise<{ cookie: string; state: string }> {
      const res = await request(app.getHttpServer())
        .get(`/api/oauth/${provider}/start?intent=link`)
        .set('Cookie', sessionCookie)
        .expect(302);
      const location = new URL(res.headers['location'] as string);
      return { cookie: extractCookie(res, 'oauth_state'), state: location.searchParams.get('state')! };
    }

    it('links a second provider via a completed OAuth handshake, then unlinks it while a password remains', async () => {
      const user = await prisma.user.create({
        data: { email: 'linker@example.com', emailVerifiedAt: new Date(), passwordHash: 'hash' },
      });
      const sessionCookie = sessionCookieFor(user.id);
      stubStrategyProfile(github, githubProfile('gh-link-1', 'linker-provider@example.com', true));

      const { cookie, state } = await startLinkAndGetState('github', sessionCookie);
      const callbackRes = await request(app.getHttpServer())
        .get(`/api/oauth/github/callback?code=fake&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(callbackRes.headers['location']).toMatch(/\/d\/[^/?]+$/);
      expect(await prisma.authIdentity.count({ where: { userId: user.id } })).toBe(1);

      await request(app.getHttpServer())
        .delete('/api/auth/identities/github')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(await prisma.authIdentity.count({ where: { userId: user.id } })).toBe(0);
    });

    it('rejects unlinking the only remaining login method', async () => {
      const user = await prisma.user.create({ data: { email: 'sole-identity@example.com', emailVerifiedAt: new Date() } });
      await prisma.authIdentity.create({ data: { userId: user.id, provider: 'GITHUB', providerUserId: 'gh-sole' } });
      const cookie = sessionCookieFor(user.id);

      const res = await request(app.getHttpServer())
        .delete('/api/auth/identities/github')
        .set('Cookie', cookie)
        .expect(400);

      expect(res.body).toMatchObject({ error: 'LAST_LOGIN_METHOD' });
      expect(await prisma.authIdentity.count({ where: { userId: user.id } })).toBe(1);
    });

    it('rejects the old raw-body link endpoint — it no longer exists (account-takeover fix)', async () => {
      const attacker = await prisma.user.create({
        data: { email: 'attacker@example.com', emailVerifiedAt: new Date(), passwordHash: 'hash' },
      });
      const cookie = sessionCookieFor(attacker.id);

      await request(app.getHttpServer())
        .post('/api/auth/identities/github')
        .set('Cookie', cookie)
        .send({ providerUserId: 'victims-real-github-id' })
        .expect(404);

      expect(await prisma.authIdentity.count({ where: { userId: attacker.id } })).toBe(0);
    });

    it('requires an authenticated session to start a link handshake', async () => {
      await request(app.getHttpServer()).get('/api/oauth/github/start?intent=link').expect(401);
    });

    it('rejects linking a provider identity already linked to a different user, leaving the original untouched', async () => {
      const victim = await prisma.user.create({
        data: { email: 'victim@example.com', emailVerifiedAt: new Date(), passwordHash: 'hash' },
      });
      await prisma.authIdentity.create({ data: { userId: victim.id, provider: 'GITHUB', providerUserId: 'gh-taken' } });

      const attacker = await prisma.user.create({
        data: { email: 'attacker2@example.com', emailVerifiedAt: new Date(), passwordHash: 'hash' },
      });
      const attackerCookie = sessionCookieFor(attacker.id);
      stubStrategyProfile(github, githubProfile('gh-taken', 'attacker-provider@example.com', true));

      const { cookie, state } = await startLinkAndGetState('github', attackerCookie);
      const res = await request(app.getHttpServer())
        .get(`/api/oauth/github/callback?code=fake&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers['location']).toContain('/profile');
      expect(res.headers['location']).toContain('IDENTITY_ALREADY_LINKED');
      expect(await prisma.authIdentity.count({ where: { userId: attacker.id } })).toBe(0);
      const stillVictims = await prisma.authIdentity.findUnique({
        where: { provider_providerUserId: { provider: 'GITHUB', providerUserId: 'gh-taken' } },
      });
      expect(stillVictims).toMatchObject({ userId: victim.id });
    });
  });
});
