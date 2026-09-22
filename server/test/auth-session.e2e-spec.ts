import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';

describe('Auth session (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // ConfigService.get() prefers the env-file-derived config it validated at
    // ConfigModule.forRoot() time over live process.env, so if the repo's .env
    // sets ADMIN_EMAIL/ADMIN_PASSWORD (even to ''), a plain `process.env[...] =`
    // here would never reach AdminSeedService and it would seed against whatever
    // ADMIN_EMAIL/PASSWORD are in that file. Explicitly clearing them through
    // ConfigService.set() writes into its internalConfig, which get() checks
    // first — this describe's app.init() must not seed a real admin row, or it
    // would block the "Admin boot-seed" describe below from seeding its own
    // (AdminSeedService only ever seeds once).
    const config = moduleFixture.get(ConfigService);
    config.set('ADMIN_EMAIL', '');
    config.set('ADMIN_PASSWORD', '');

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(opts: { verified?: boolean } = {}) {
    const email = `user-${randomUUID()}@example.com`;
    const password = 'correct-horse-1!';
    const passwordHash = await bcrypt.hash(password, 4);
    const user = await prisma.user.create({
      data: { email, passwordHash, emailVerifiedAt: opts.verified === false ? null : new Date() },
    });
    return { user, email, password };
  }

  it('1. logs in a verified user, sets an httpOnly cookie, and the body carries no secret', async () => {
    const { email, password } = await createUser();

    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);

    expect(res.body).toEqual({ ok: true });
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toContain('HttpOnly');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('2. returns the same generic 401 body for a wrong password and an unknown email', async () => {
    const { email } = await createUser();

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'totally-wrong-1!' })
      .expect(401);

    const unknownEmail = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `nobody-${randomUUID()}@example.com`, password: 'totally-wrong-1!' })
      .expect(401);

    expect(wrongPassword.body).toEqual({ error: 'INVALID_CREDENTIALS' });
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('3. returns 403 EMAIL_NOT_CONFIRMED for correct credentials on an unverified user', async () => {
    const { email, password } = await createUser({ verified: false });

    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(403);

    expect(res.body).toEqual({ error: 'EMAIL_NOT_CONFIRMED' });
  });

  it('4. GET /me returns the user with the login cookie, and 401s with no/garbage cookie', async () => {
    const { email, password, user } = await createUser();
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send({ email, password }).expect(200);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ id: user.id, email, role: 'USER' });

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', 'session=garbage').expect(401);
  });

  it('5. logout clears the cookie; the old cookie value then 401s on /me', async () => {
    const { email, password } = await createUser();
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent.post('/api/auth/login').send({ email, password }).expect(200);
    await agent.get('/api/auth/me').expect(200);

    const setCookie = loginRes.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const oldToken = rawCookie.split(';')[0]; // e.g. "session=<jwt>"

    await agent.post('/api/auth/logout').expect(200);

    // The agent's own cookie jar auto-replaces the cookie on logout, so replay
    // the captured raw old token explicitly — this is what actually proves
    // the old JWT was invalidated server-side, not just cleared client-side.
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', oldToken).expect(401);
  });

  it('6. logout-all invalidates a still-unexpired session issued to a second login', async () => {
    const { email, password } = await createUser();
    const agentA = request.agent(app.getHttpServer());
    const agentB = request.agent(app.getHttpServer());
    await agentA.post('/api/auth/login').send({ email, password }).expect(200);
    await agentB.post('/api/auth/login').send({ email, password }).expect(200);

    await agentA.get('/api/auth/me').expect(200);
    await agentB.post('/api/auth/logout-all').expect(200);

    await agentA.get('/api/auth/me').expect(401);
  });

  it('7. a banned user is rejected even with a still-valid cookie', async () => {
    const { email, password, user } = await createUser();
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
    await agent.get('/api/auth/me').expect(200);

    await prisma.user.update({ where: { id: user.id }, data: { bannedAt: new Date() } });

    await agent.get('/api/auth/me').expect(401);
  });
});

describe('Admin boot-seed (e2e)', () => {
  let app: INestApplication;
  const adminEmail = `admin-${randomUUID()}@example.com`;
  const adminPassword = 'admin-boot-seed-1!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // See the ADMIN_EMAIL/PASSWORD comment in the describe above: ConfigService.get()
    // won't see plain process.env writes here if the repo's .env already defines these
    // keys, so set them through ConfigService directly before app.init() runs
    // AdminSeedService's OnApplicationBootstrap hook.
    const config = moduleFixture.get(ConfigService);
    config.set('ADMIN_EMAIL', adminEmail);
    config.set('ADMIN_PASSWORD', adminPassword);

    // AdminSeedService seeds at most once — it no-ops if any ADMIN-role row already
    // exists. All e2e files share one Postgres container with no per-file namespacing
    // (see vitest.config.e2e.ts), and admin.e2e-spec.ts creates its own ADMIN-role rows
    // directly; depending on file execution order (which isn't guaranteed stable across
    // environments — this passed locally but failed in CI), those rows can already be
    // there by the time this describe runs and block the seed this test is checking for.
    // Clear them first so this test's precondition doesn't depend on run order.
    await moduleFixture.get(PrismaService).user.deleteMany({ where: { role: 'ADMIN' } });

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init(); // runs OnApplicationBootstrap, including AdminSeedService
  });

  afterAll(async () => {
    await app.close();
  });

  it('8. seeds a confirmed ADMIN user that can log in immediately', async () => {
    const agent = request.agent(app.getHttpServer());

    const res = await agent
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    expect(res.body).toEqual({ ok: true });

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ email: adminEmail, role: 'ADMIN' });
    expect(me.body.emailVerifiedAt).not.toBeNull();
  });
});
