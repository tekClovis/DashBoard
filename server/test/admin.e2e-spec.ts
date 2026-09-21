// e2e for features/admin-ui/spec.md's server-side verification checklist (items 1-6).

import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { Request } from 'express';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import type { Role } from '../src/generated/prisma/enums.js';

describe('Admin users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  beforeEach(async () => {
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUser(role: Role = 'USER', password = 'correct-horse-1!') {
    const email = `u-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), role },
    });
    const cookie = `session=${jwtService.sign({ sub: user.id, role: user.role, tv: user.tokenVersion })}`;
    return { user, email, password, cookie };
  }

  const http = () => request(app.getHttpServer());

  function connect(cookie: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { extraHeaders: { Cookie: cookie }, transports: ['websocket'] });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  it('1. GET /admin/users is 401 unauthenticated, 403 for a non-admin, and a paginated list for an admin', async () => {
    const admin = await createUser('ADMIN');
    const plain = await createUser('USER');
    await createUser('USER');

    await http().get('/api/admin/users').expect(401);
    await http().get('/api/admin/users').set('Cookie', plain.cookie).expect(403);

    const res = await http().get('/api/admin/users?pageSize=2&page=1').set('Cookie', admin.cookie).expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.users).toHaveLength(2);
    expect(res.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const page2 = await http().get('/api/admin/users?pageSize=2&page=2').set('Cookie', admin.cookie).expect(200);
    expect(page2.body.users).toHaveLength(1);

    const search = await http()
      .get(`/api/admin/users?q=${plain.email.slice(2, 12).toUpperCase()}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(search.body.users.map((u: { id: string }) => u.id)).toEqual([plain.user.id]);

    await http().get('/api/admin/users?pageSize=1000').set('Cookie', admin.cookie).expect(400);
  });

  it('every admin route rejects a non-admin (PATCH/DELETE 403, no mutation)', async () => {
    const plain = await createUser('USER');
    const target = await createUser('USER');

    await http().patch(`/api/admin/users/${target.user.id}`).set('Cookie', plain.cookie).send({ role: 'ADMIN' }).expect(403);
    await http().delete(`/api/admin/users/${target.user.id}`).set('Cookie', plain.cookie).expect(403);
    await http().delete(`/api/admin/users/${target.user.id}`).expect(401);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(after.role).toBe('USER');
  });

  it('2. ban bumps tokenVersion, the old cookie gets 401, and live sockets are disconnected immediately', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('USER');
    await http().get('/api/auth/me').set('Cookie', target.cookie).expect(200);

    const socket = await connect(target.cookie);
    const disconnected = new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));

    const res = await http()
      .patch(`/api/admin/users/${target.user.id}`)
      .set('Cookie', admin.cookie)
      .send({ bannedAt: new Date().toISOString() })
      .expect(200);
    expect(res.body.bannedAt).toEqual(expect.any(String));

    await disconnected;
    expect(socket.connected).toBe(false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(row.tokenVersion).toBe(target.user.tokenVersion + 1);
    await http().get('/api/auth/me').set('Cookie', target.cookie).expect(401);
  });

  it('3. unban lets the user log in again with fresh credentials', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('USER');
    await http().patch(`/api/admin/users/${target.user.id}`).set('Cookie', admin.cookie).send({ bannedAt: new Date().toISOString() }).expect(200);

    const unbanned = await http().patch(`/api/admin/users/${target.user.id}`).set('Cookie', admin.cookie).send({ bannedAt: null }).expect(200);
    expect(unbanned.body.bannedAt).toBeNull();

    // Called on the controller with a private client address: /auth/login's per-IP counter (10/h) is
    // shared through Redis with the other e2e suites, so an HTTP login here would eat their budget.
    let token = '';
    const fakeReq = { socket: { remoteAddress: '203.0.113.77' } } as unknown as Request;
    const fakeRes = { cookie: (_name: string, value: string) => (token = value) } as unknown as Parameters<AuthController['login']>[2];
    await app.get(AuthController).login({ email: target.email, password: target.password }, fakeReq, fakeRes);
    await http().get('/api/auth/me').set('Cookie', `session=${token}`).expect(200);
    // The pre-ban cookie stays dead.
    await http().get('/api/auth/me').set('Cookie', target.cookie).expect(401);
  });

  it('4. promote and demote change the role and bump tokenVersion', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('USER');

    const up = await http().patch(`/api/admin/users/${target.user.id}`).set('Cookie', admin.cookie).send({ role: 'ADMIN' }).expect(200);
    expect(up.body.role).toBe('ADMIN');
    let row = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(row.tokenVersion).toBe(1);
    await http().get('/api/auth/me').set('Cookie', target.cookie).expect(401);

    const down = await http().patch(`/api/admin/users/${target.user.id}`).set('Cookie', admin.cookie).send({ role: 'USER' }).expect(200);
    expect(down.body.role).toBe('USER');
    row = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    expect(row.tokenVersion).toBe(2);
  });

  it('5. an admin cannot ban, demote or delete themself — rejected with no mutation', async () => {
    const admin = await createUser('ADMIN');
    const url = `/api/admin/users/${admin.user.id}`;

    const ban = await http().patch(url).set('Cookie', admin.cookie).send({ bannedAt: new Date().toISOString() }).expect(403);
    expect(ban.body).toEqual({ error: 'CANNOT_MODIFY_SELF' });
    await http().patch(url).set('Cookie', admin.cookie).send({ role: 'USER' }).expect(403);
    await http().delete(url).set('Cookie', admin.cookie).expect(403);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } });
    expect(row).toMatchObject({ role: 'ADMIN', bannedAt: null, tokenVersion: 0 });
    await http().get('/api/auth/me').set('Cookie', admin.cookie).expect(200);
  });

  it('PATCH validates input and 404s an unknown user', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('USER');
    const auth = { Cookie: admin.cookie };

    await http().patch(`/api/admin/users/${target.user.id}`).set(auth).send({}).expect(400);
    await http().patch(`/api/admin/users/${target.user.id}`).set(auth).send({ role: 'ROOT' }).expect(400);
    await http().patch(`/api/admin/users/${target.user.id}`).set(auth).send({ email: 'x@y.z' }).expect(400);
    await http().patch('/api/admin/users/not-a-uuid').set(auth).send({ role: 'ADMIN' }).expect(400);
    await http().patch(`/api/admin/users/${randomUUID()}`).set(auth).send({ role: 'ADMIN' }).expect(404);
    await http().delete(`/api/admin/users/${randomUUID()}`).set(auth).expect(404);
  });

  it('6. DELETE removes the user and cascades dashboards, instances, connections, identities and tokens', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('USER');
    const dashboard = await prisma.dashboard.create({ data: { userId: target.user.id, name: 'D', position: 0 } });
    await prisma.widgetInstance.create({
      data: { dashboardId: dashboard.id, service: 's', widget: 'w', params: {}, refreshRate: 60, x: 0, y: 0, w: 1, h: 1 },
    });
    await prisma.authIdentity.create({ data: { userId: target.user.id, provider: 'GITHUB', providerUserId: 'gh-1' } });
    await prisma.emailToken.create({
      data: { userId: target.user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.serviceConnection.create({
      data: { userId: target.user.id, service: 'github', externalAccountId: 'ext-1', accessTokenEnc: 'x' },
    });

    const socket = await connect(target.cookie);
    const disconnected = new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));

    await http().delete(`/api/admin/users/${target.user.id}`).set('Cookie', admin.cookie).expect(200, { ok: true });
    await disconnected;

    const where = { userId: target.user.id };
    expect(await prisma.user.count({ where: { id: target.user.id } })).toBe(0);
    expect(await prisma.dashboard.count({ where })).toBe(0);
    expect(await prisma.widgetInstance.count({ where: { dashboardId: dashboard.id } })).toBe(0);
    expect(await prisma.authIdentity.count({ where })).toBe(0);
    expect(await prisma.emailToken.count({ where })).toBe(0);
    expect(await prisma.serviceConnection.count({ where })).toBe(0);
    await http().get('/api/auth/me').set('Cookie', target.cookie).expect(401);
  });
});
