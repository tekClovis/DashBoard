import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { MailService } from '../src/core/mail/mail.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { REDIS } from '../src/core/redis/redis.provider.js';

describe('Password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sent: { to: string; url: string }[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendConfirmationEmail: async () => undefined,
        sendPasswordResetEmail: async (to: string, url: string) => {
          sent.push({ to, url });
        },
      })
      .compile();
    const config = moduleFixture.get(ConfigService);
    config.set('ADMIN_EMAIL', '');
    config.set('ADMIN_PASSWORD', '');

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    // Earlier files (auth-session logs in 10x) leave the per-IP login bucket near its cap: start empty.
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('login:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    // The per-IP login bucket lives in the Redis shared by every e2e file: hand it back empty.
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('login:*');
    if (keys.length > 0) await redis.del(...keys);
    await app.close();
  });

  beforeEach(() => {
    sent = [];
  });

  const http = () => request(app.getHttpServer());
  const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');

  async function createUser(opts: { oauthOnly?: boolean; verified?: boolean } = {}) {
    const email = `user-${randomUUID()}@example.com`;
    const password = 'correct-horse-1!';
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: opts.oauthOnly ? null : await bcrypt.hash(password, 4),
        emailVerifiedAt: opts.verified === false ? null : new Date(),
      },
    });
    return { user, email, password };
  }

  async function requestLink(email: string) {
    await http().post('/api/auth/forgot-password').send({ email }).expect(200);
    const mail = sent.at(-1);
    return mail ? new URL(mail.url).searchParams.get('token')! : null;
  }

  describe('POST /auth/forgot-password', () => {
    it('returns the same 200 body for an existing, unknown and OAuth-only email, and mails only the first', async () => {
      const { email } = await createUser();
      const oauth = await createUser({ oauthOnly: true });
      const unknown = `nobody-${randomUUID()}@example.com`;

      const bodies = [];
      for (const e of [email, unknown, oauth.email]) {
        const res = await http().post('/api/auth/forgot-password').send({ email: e }).expect(200);
        bodies.push(res.body);
      }

      expect(bodies).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
      expect(sent.map((m) => m.to)).toEqual([email]);
      expect(sent[0]!.url).toMatch(/^http:\/\/localhost:8080\/reset-password\?token=[\w-]+$/);
    });

    it('stores only the SHA-256 of the token', async () => {
      const { email, user } = await createUser();
      const raw = (await requestLink(email))!;

      const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokenHash).toBe(sha(raw));
      expect(JSON.stringify(rows)).not.toContain(raw);
    });

    it('sends no new mail for a second request within 60 s but still answers 200', async () => {
      const { email } = await createUser();
      await requestLink(email);
      await requestLink(email);
      expect(sent).toHaveLength(1);
    });

    it('sends no mail for a 6th request within 24 h', async () => {
      const { email } = await createUser();
      for (let i = 0; i < 6; i++) {
        // Expire the 60 s window so only the daily cap can stop the mail.
        await app.get<Redis>(REDIS).del(`reset:request:${email}`);
        await requestLink(email);
      }
      expect(sent).toHaveLength(5);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('resets the password: new one logs in, old one fails, old sessions die, token is single use', async () => {
      const verified = await createUser();
      const session = request.agent(app.getHttpServer());
      await session.post('/api/auth/login').send({ email: verified.email, password: verified.password }).expect(200);
      await session.get('/api/auth/me').expect(200);
      const token = (await requestLink(verified.email))!;

      await http().post('/api/auth/reset-password').send({ token, password: 'brand-new-pw-2@' }).expect(200, { ok: true });

      await session.get('/api/auth/me').expect(401);
      await http().post('/api/auth/login').send({ email: verified.email, password: verified.password }).expect(401);
      await http().post('/api/auth/login').send({ email: verified.email, password: 'brand-new-pw-2@' }).expect(200);
      await http().post('/api/auth/reset-password').send({ token, password: 'another-pw-3#' }).expect(400);
    });

    it('marks a still-unverified account as verified', async () => {
      const { email, user } = await createUser({ verified: false });
      const token = (await requestLink(email))!;
      await http().post('/api/auth/reset-password').send({ token, password: 'brand-new-pw-2@' }).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
    });

    it('rejects garbage and expired tokens with 400', async () => {
      const { email, user } = await createUser();
      await http().post('/api/auth/reset-password').send({ token: 'garbage', password: 'brand-new-pw-2@' }).expect(400);

      const raw = (await requestLink(email))!;
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().post('/api/auth/reset-password').send({ token: raw, password: 'brand-new-pw-2@' }).expect(400);
    });

    it('rejects a password that fails the pattern with 400 and keeps the token usable', async () => {
      const { email } = await createUser();
      const token = (await requestLink(email))!;
      await http().post('/api/auth/reset-password').send({ token, password: 'short' }).expect(400);
      await http().post('/api/auth/reset-password').send({ token, password: 'brand-new-pw-2@' }).expect(200);
    });

    it('invalidates the user’s other unused reset tokens', async () => {
      const { user, email } = await createUser();
      const first = (await requestLink(email))!;
      // A second live token inserted directly, as if issued by another path.
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha('other'), expiresAt: new Date(Date.now() + 60_000) },
      });

      await http().post('/api/auth/reset-password').send({ token: first, password: 'brand-new-pw-2@' }).expect(200);

      await http().post('/api/auth/reset-password').send({ token: 'other', password: 'x-another-pw-1!' }).expect(400);
    });
  });
});
