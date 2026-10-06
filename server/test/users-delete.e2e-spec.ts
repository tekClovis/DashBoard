// e2e for features/big-delete-account/spec.md's server-side checklist (items 3-8).

import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import type { Role } from '../src/generated/prisma/enums.js';

describe('DELETE /users/me (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
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
    await prisma.dashboardShare.deleteMany();
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUser(role: Role = 'USER') {
    const email = `u-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('correct-horse-1!', 4), emailVerifiedAt: new Date(), role },
    });
    const cookie = `session=${jwtService.sign({ sub: user.id, role: user.role, tv: user.tokenVersion })}`;
    return { user, email, cookie };
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

  it('7. is 401 without a session and deletes nobody', async () => {
    const { user } = await createUser();
    await http().delete('/api/users/me').expect(401);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
  });

  it('3-5. returns 204, clears the cookie, removes every owned row, kills the session and sockets', async () => {
    const me = await createUser();
    const bystander = await createUser();
    const dashboard = await prisma.dashboard.create({ data: { userId: me.user.id, name: 'Mine', position: 0 } });
    await prisma.widgetInstance.create({
      data: { dashboardId: dashboard.id, service: 'weather', widget: 'current_weather', params: {}, refreshRate: 300, x: 0, y: 0, w: 2, h: 2 },
    });
    await prisma.serviceConnection.create({ data: { userId: me.user.id, service: 'github', externalAccountId: 'x' } });
    await prisma.authIdentity.create({ data: { userId: me.user.id, provider: 'GITHUB', providerUserId: 'gh-1' } });
    await prisma.emailToken.create({
      data: { userId: me.user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.dashboardShare.create({
      data: { dashboardId: dashboard.id, fromUserId: me.user.id, toUserId: bystander.user.id },
    });

    const socket = await connect(me.cookie);
    const disconnected = new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));

    const res = await http().delete('/api/users/me').set('Cookie', me.cookie).expect(204);
    expect(String(res.headers['set-cookie'])).toMatch(/session=;/);
    await disconnected;

    const where = { userId: me.user.id };
    expect(await prisma.user.count({ where: { id: me.user.id } })).toBe(0);
    expect(await prisma.dashboard.count({ where })).toBe(0);
    expect(await prisma.widgetInstance.count({ where: { dashboardId: dashboard.id } })).toBe(0);
    expect(await prisma.serviceConnection.count({ where })).toBe(0);
    expect(await prisma.authIdentity.count({ where })).toBe(0);
    expect(await prisma.emailToken.count({ where })).toBe(0);
    expect(await prisma.dashboardShare.count({ where: { OR: [{ fromUserId: me.user.id }, { toUserId: me.user.id }] } })).toBe(0);

    await http().get('/api/auth/me').set('Cookie', me.cookie).expect(401);
    await http().post('/api/auth/login').send({ email: me.email, password: 'correct-horse-1!' }).expect(401);
    expect(await prisma.user.count({ where: { id: bystander.user.id } })).toBe(1);
  });

  it('6. an accepted copy stays with the recipient and pending shares vanish from their incoming list', async () => {
    const owner = await createUser();
    const recipient = await createUser();
    const d1 = await prisma.dashboard.create({ data: { userId: owner.user.id, name: 'Shared', position: 0 } });
    const d2 = await prisma.dashboard.create({ data: { userId: owner.user.id, name: 'Pending', position: 1 } });
    for (const d of [d1, d2]) {
      await http().post(`/api/dashboards/${d.id}/share`).set('Cookie', owner.cookie).send({ email: recipient.email }).expect(201);
    }
    const before = (await http().get('/api/shares/incoming').set('Cookie', recipient.cookie).expect(200)).body.shares;
    const shareOfD1 = before.find((s: { dashboardName: string }) => s.dashboardName === 'Shared');
    await http().post(`/api/shares/${shareOfD1.id}/accept`).set('Cookie', recipient.cookie).expect(201);

    await http().delete('/api/users/me').set('Cookie', owner.cookie).expect(204);

    expect((await http().get('/api/shares/incoming').set('Cookie', recipient.cookie).expect(200)).body.shares).toEqual([]);
    expect(await prisma.dashboard.count({ where: { userId: recipient.user.id, name: 'Shared' } })).toBe(1);
  });

  it('8. refuses with 409 LAST_ADMIN when the caller is the only admin, then allows it once another exists', async () => {
    const admin = await createUser('ADMIN');
    const res = await http().delete('/api/users/me').set('Cookie', admin.cookie).expect(409);
    expect(res.body.error).toBe('LAST_ADMIN');
    expect(await prisma.user.count({ where: { id: admin.user.id } })).toBe(1);

    await createUser('ADMIN');
    await http().delete('/api/users/me').set('Cookie', admin.cookie).expect(204);
  });
});
