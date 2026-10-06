// e2e for features/big-dashboard-share/spec.md's server-side checklist (items 1-5).

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';

describe('Dashboard sharing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.dashboardShare.deleteMany();
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.user.deleteMany();
  });

  async function user(email: string) {
    const row = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    return { id: row.id, cookie: `session=${jwtService.sign({ sub: row.id, role: 'USER', tv: 0 })}` };
  }

  async function seed() {
    const owner = await user('owner@example.com');
    const recipient = await user('recipient@example.com');
    const other = await user('other@example.com');
    const dashboard = await prisma.dashboard.create({ data: { userId: owner.id, name: 'Game night', position: 0 } });
    await prisma.widgetInstance.createMany({
      data: [
        { dashboardId: dashboard.id, service: 'weather', widget: 'current_weather', params: { city: 'Paris' }, refreshRate: 300, x: 0, y: 0, w: 2, h: 2 },
        { dashboardId: dashboard.id, service: 'weather', widget: 'forecast', params: { city: 'Rome' }, refreshRate: 600, x: 2, y: 1, w: 3, h: 4 },
      ],
    });
    return { owner, recipient, other, dashboard };
  }

  const share = (cookie: string, dashboardId: string, email: string) =>
    request(app.getHttpServer()).post(`/api/dashboards/${dashboardId}/share`).set('Cookie', cookie).send({ email });
  const incoming = (cookie: string) => request(app.getHttpServer()).get('/api/shares/incoming').set('Cookie', cookie);

  it('1. shares to an existing user, errors for an unknown one', async () => {
    const { owner, dashboard } = await seed();
    await share(owner.cookie, dashboard.id, 'recipient@example.com').expect(201);
    const res = await share(owner.cookie, dashboard.id, 'nobody@example.com').expect(400);
    expect(res.body).toMatchObject({ error: 'UNKNOWN_USER' });
  });

  it('1. only the dashboard owner can share it', async () => {
    const { other, dashboard } = await seed();
    await share(other.cookie, dashboard.id, 'recipient@example.com').expect(404);
  });

  it('2. the recipient sees the incoming share with name and sender; others see nothing', async () => {
    const { owner, recipient, other, dashboard } = await seed();
    await share(owner.cookie, dashboard.id, 'recipient@example.com').expect(201);
    const res = await incoming(recipient.cookie).expect(200);
    expect(res.body.shares).toEqual([
      { id: expect.any(String), dashboardName: 'Game night', fromEmail: 'owner@example.com', widgetCount: 2, createdAt: expect.any(String) },
    ]);
    expect((await incoming(other.cookie).expect(200)).body.shares).toEqual([]);
  });

  it('3. accepting adds a dashboard with the same widgets and layout, and clears the share', async () => {
    const { owner, recipient, dashboard } = await seed();
    await share(owner.cookie, dashboard.id, 'recipient@example.com').expect(201);
    const [{ id: shareId }] = (await incoming(recipient.cookie)).body.shares;

    const accepted = await request(app.getHttpServer())
      .post(`/api/shares/${shareId}/accept`)
      .set('Cookie', recipient.cookie)
      .expect(201);
    expect(accepted.body).toMatchObject({ name: 'Game night', position: 0 });
    expect(accepted.body.id).not.toBe(dashboard.id);

    const list = await request(app.getHttpServer()).get('/api/dashboards').set('Cookie', recipient.cookie).expect(200);
    expect(list.body.dashboards).toHaveLength(1);
    const widgets = await request(app.getHttpServer())
      .get(`/api/dashboards/${accepted.body.id}/widgets`)
      .set('Cookie', recipient.cookie)
      .expect(200);
    const original = await prisma.widgetInstance.findMany({ where: { dashboardId: dashboard.id } });
    const strip = (w: { service: string; widget: string; params: unknown; refreshRate: number; x: number; y: number; w: number; h: number }) =>
      JSON.stringify([w.service, w.widget, w.params, w.refreshRate, w.x, w.y, w.w, w.h]);
    expect(widgets.body.widgets.map(strip).sort()).toEqual(original.map(strip).sort());
    expect(widgets.body.widgets.map((w: { id: string }) => w.id)).not.toEqual(expect.arrayContaining(original.map((w) => w.id)));
    expect((await incoming(recipient.cookie)).body.shares).toEqual([]);
  });

  it('4. editing or deleting the copy does not change the original, and vice versa', async () => {
    const { owner, recipient, dashboard } = await seed();
    await share(owner.cookie, dashboard.id, 'recipient@example.com').expect(201);
    const [{ id: shareId }] = (await incoming(recipient.cookie)).body.shares;
    const copy = (await request(app.getHttpServer()).post(`/api/shares/${shareId}/accept`).set('Cookie', recipient.cookie)).body;

    await request(app.getHttpServer()).patch(`/api/dashboards/${copy.id}`).set('Cookie', recipient.cookie).send({ name: 'Mine' }).expect(200);
    const copyWidgets = (await request(app.getHttpServer()).get(`/api/dashboards/${copy.id}/widgets`).set('Cookie', recipient.cookie)).body.widgets;
    await request(app.getHttpServer()).delete(`/api/widgets/${copyWidgets[0].id}`).set('Cookie', recipient.cookie).expect(200);
    expect((await prisma.dashboard.findUniqueOrThrow({ where: { id: dashboard.id } })).name).toBe('Game night');
    expect(await prisma.widgetInstance.count({ where: { dashboardId: dashboard.id } })).toBe(2);

    await request(app.getHttpServer()).delete(`/api/dashboards/${dashboard.id}`).set('Cookie', owner.cookie).expect(200);
    const remaining = await request(app.getHttpServer()).get('/api/dashboards').set('Cookie', recipient.cookie);
    expect(remaining.body.dashboards).toMatchObject([{ id: copy.id, name: 'Mine' }]);
    expect(await prisma.widgetInstance.count({ where: { dashboardId: copy.id } })).toBe(1);
  });

  it('5. non-recipients cannot accept or decline a share (404) and it stays pending', async () => {
    const { owner, recipient, other, dashboard } = await seed();
    await share(owner.cookie, dashboard.id, 'recipient@example.com').expect(201);
    const [{ id: shareId }] = (await incoming(recipient.cookie)).body.shares;
    for (const who of [other, owner]) {
      await request(app.getHttpServer()).post(`/api/shares/${shareId}/accept`).set('Cookie', who.cookie).expect(404);
      await request(app.getHttpServer()).delete(`/api/shares/${shareId}`).set('Cookie', who.cookie).expect(404);
    }
    expect((await incoming(recipient.cookie)).body.shares).toHaveLength(1);
    await request(app.getHttpServer()).delete(`/api/shares/${shareId}`).set('Cookie', recipient.cookie).expect(200);
    expect((await incoming(recipient.cookie)).body.shares).toEqual([]);
    await request(app.getHttpServer()).post('/api/shares/x/accept').expect(401);
  });
});
