// e2e for features/dashboards-api/spec.md's verification checklist.
//
// Follows the catalog.e2e-spec.ts / connections.e2e-spec.ts conventions: real Postgres via
// testcontainers, real HTTP through supertest. A test WidgetDefinition is registered directly
// against the WidgetRegistryService, since no real widgets are in scope for this feature.

import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { WidgetRegistryService } from '../src/catalog/widget-registry.service.js';
import type { WidgetDefinition } from '../src/catalog/widget-definition.js';

describe('Dashboards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const testWidget: WidgetDefinition = {
    service: 'weather',
    name: 'current_weather',
    description: 'Current weather for a city.',
    params: [
      { name: 'city', type: 'string', required: true, label: 'City' },
      { name: 'units', type: 'string', enum: ['metric', 'imperial'], default: 'metric', label: 'Units' },
    ],
    minRefreshSec: 300,
    auth: 'none',
    fetch: async () => ({}) as never,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const registry = app.get(WidgetRegistryService);
    registry.registerService({ name: 'weather', connection: 'none' });
    registry.register(testWidget);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.widgetInstance.deleteMany();
    await prisma.dashboard.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUserWithCookie(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const token = jwtService.sign({ sub: user.id, role: 'USER', tv: 0 });
    return { userId: user.id, cookie: `session=${token}` };
  }

  async function createDashboard(userId: string, name = 'Board', position = 0): Promise<string> {
    const dashboard = await prisma.dashboard.create({ data: { userId, name, position } });
    return dashboard.id;
  }

  const validInstanceBody = {
    service: 'weather',
    widget: 'current_weather',
    params: { city: 'Paris', units: 'metric' },
    refreshRate: 300,
    x: 0,
    y: 0,
    w: 2,
    h: 2,
  };

  describe('1. POST /api/dashboards + GET /api/dashboards', () => {
    it("creates a dashboard owned by the caller with an auto-assigned position, and lists only the caller's", async () => {
      const { cookie } = await createUserWithCookie('own1@example.com');
      const { cookie: otherCookie } = await createUserWithCookie('other1@example.com');

      const first = await request(app.getHttpServer())
        .post('/api/dashboards')
        .set('Cookie', cookie)
        .send({ name: 'First' })
        .expect(201);
      expect(first.body).toMatchObject({ name: 'First', position: 0 });
      expect(first.body.id).toBeDefined();

      const second = await request(app.getHttpServer())
        .post('/api/dashboards')
        .set('Cookie', cookie)
        .send({ name: 'Second' })
        .expect(201);
      expect(second.body).toMatchObject({ name: 'Second', position: 1 });

      await request(app.getHttpServer())
        .post('/api/dashboards')
        .set('Cookie', otherCookie)
        .send({ name: "Someone else's" })
        .expect(201);

      const list = await request(app.getHttpServer()).get('/api/dashboards').set('Cookie', cookie).expect(200);
      expect(list.body.dashboards).toHaveLength(2);
      expect(list.body.dashboards.map((d: { name: string }) => d.name).sort()).toEqual(['First', 'Second']);
    });
  });

  describe('2. PATCH /api/dashboards/{id} ownership scoping', () => {
    it('returns 404 for a dashboard owned by another user', async () => {
      const { userId: ownerId } = await createUserWithCookie('owner2@example.com');
      const { cookie: attackerCookie } = await createUserWithCookie('attacker2@example.com');
      const dashboardId = await createDashboard(ownerId);

      await request(app.getHttpServer())
        .patch(`/api/dashboards/${dashboardId}`)
        .set('Cookie', attackerCookie)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it('updates name/position for the owner', async () => {
      const { userId, cookie } = await createUserWithCookie('owner2b@example.com');
      const dashboardId = await createDashboard(userId);

      const res = await request(app.getHttpServer())
        .patch(`/api/dashboards/${dashboardId}`)
        .set('Cookie', cookie)
        .send({ name: 'Renamed', position: 3 })
        .expect(200);

      expect(res.body).toMatchObject({ id: dashboardId, name: 'Renamed', position: 3 });
    });
  });

  describe('2b. GET /api/dashboards/{id}/widgets', () => {
    it("lists the owner's instances, 404s for another user's dashboard, and returns [] when empty", async () => {
      const { userId: ownerId, cookie: ownerCookie } = await createUserWithCookie('list-owner@example.com');
      const { cookie: attackerCookie } = await createUserWithCookie('list-attacker@example.com');
      const dashboardId = await createDashboard(ownerId);
      const emptyId = await createDashboard(ownerId, 'Empty', 1);

      const empty = await request(app.getHttpServer())
        .get(`/api/dashboards/${emptyId}/widgets`)
        .set('Cookie', ownerCookie)
        .expect(200);
      expect(empty.body).toEqual({ widgets: [] });

      const created = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', ownerCookie)
        .send(validInstanceBody)
        .expect(201);

      const own = await request(app.getHttpServer())
        .get(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', ownerCookie)
        .expect(200);
      expect(own.body.widgets).toEqual([created.body]);

      await request(app.getHttpServer())
        .get(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', attackerCookie)
        .expect(404);
    });
  });

  describe('3. POST /api/dashboards/{id}/widgets — valid create', () => {
    it('creates a WidgetInstance and returns it with an id', async () => {
      const { userId, cookie } = await createUserWithCookie('widget3@example.com');
      const dashboardId = await createDashboard(userId);

      const res = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send(validInstanceBody)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body).toMatchObject({
        dashboardId,
        service: 'weather',
        widget: 'current_weather',
        params: { city: 'Paris', units: 'metric' },
        refreshRate: 300,
      });

      const row = await prisma.widgetInstance.findUnique({ where: { id: res.body.id } });
      expect(row).not.toBeNull();
    });
  });

  describe('4. POST .../widgets — invalid params', () => {
    it('returns 400 with a structured per-param error and creates no row for a missing required param', async () => {
      const { userId, cookie } = await createUserWithCookie('widget4a@example.com');
      const dashboardId = await createDashboard(userId);

      const res = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send({ ...validInstanceBody, params: { units: 'metric' } })
        .expect(400);

      expect(res.body).toEqual({ error: 'INVALID_PARAMS', param: 'city', message: expect.stringContaining('city') });
      expect(await prisma.widgetInstance.count()).toBe(0);
    });

    it('returns 400 for a param outside its enum, and creates no row', async () => {
      const { userId, cookie } = await createUserWithCookie('widget4b@example.com');
      const dashboardId = await createDashboard(userId);

      const res = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send({ ...validInstanceBody, params: { city: 'Paris', units: 'kelvin' } })
        .expect(400);

      expect(res.body).toEqual({ error: 'INVALID_PARAMS', param: 'units', message: expect.stringContaining('units') });
      expect(await prisma.widgetInstance.count()).toBe(0);
    });
  });

  describe('5. POST .../widgets — refreshRate out of range', () => {
    it('rejects a refreshRate below the widget minRefreshSec', async () => {
      const { userId, cookie } = await createUserWithCookie('widget5a@example.com');
      const dashboardId = await createDashboard(userId);

      await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send({ ...validInstanceBody, refreshRate: 60 })
        .expect(400);

      expect(await prisma.widgetInstance.count()).toBe(0);
    });

    it('rejects a refreshRate above 86400', async () => {
      const { userId, cookie } = await createUserWithCookie('widget5b@example.com');
      const dashboardId = await createDashboard(userId);

      await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send({ ...validInstanceBody, refreshRate: 86401 })
        .expect(400);

      expect(await prisma.widgetInstance.count()).toBe(0);
    });
  });

  describe('6. POST .../widgets — unknown service/widget', () => {
    it('returns 400 (not 500) for an unregistered service/widget pair', async () => {
      const { userId, cookie } = await createUserWithCookie('widget6@example.com');
      const dashboardId = await createDashboard(userId);

      const res = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send({ ...validInstanceBody, service: 'nope', widget: 'nope' })
        .expect(400);

      expect(res.body).toEqual({ error: 'UNKNOWN_WIDGET' });
      expect(await prisma.widgetInstance.count()).toBe(0);
    });
  });

  describe('7. PATCH /api/widgets/{id}', () => {
    it('updates params/refreshRate with the same validation as create', async () => {
      const { userId, cookie } = await createUserWithCookie('widget7a@example.com');
      const dashboardId = await createDashboard(userId);
      const created = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send(validInstanceBody)
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/widgets/${created.body.id}`)
        .set('Cookie', cookie)
        .send({ params: { city: 'Lyon', units: 'imperial' }, refreshRate: 600 })
        .expect(200);

      expect(res.body).toMatchObject({ params: { city: 'Lyon', units: 'imperial' }, refreshRate: 600 });

      await request(app.getHttpServer())
        .patch(`/api/widgets/${created.body.id}`)
        .set('Cookie', cookie)
        .send({ refreshRate: 100000 })
        .expect(400);
    });

    it("returns 404 for a request against another user's instance", async () => {
      const { userId: ownerId, cookie: ownerCookie } = await createUserWithCookie('widget7b-owner@example.com');
      const { cookie: attackerCookie } = await createUserWithCookie('widget7b-attacker@example.com');
      const dashboardId = await createDashboard(ownerId);
      const created = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', ownerCookie)
        .send(validInstanceBody)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/widgets/${created.body.id}`)
        .set('Cookie', attackerCookie)
        .send({ refreshRate: 600 })
        .expect(404);
    });
  });

  describe('8. DELETE /api/widgets/{id}', () => {
    it('removes the instance for the owner, and 404s for another user', async () => {
      const { userId: ownerId, cookie: ownerCookie } = await createUserWithCookie('widget8-owner@example.com');
      const { cookie: attackerCookie } = await createUserWithCookie('widget8-attacker@example.com');
      const dashboardId = await createDashboard(ownerId);
      const created = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', ownerCookie)
        .send(validInstanceBody)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/widgets/${created.body.id}`)
        .set('Cookie', attackerCookie)
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/widgets/${created.body.id}`)
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(await prisma.widgetInstance.findUnique({ where: { id: created.body.id } })).toBeNull();
    });
  });

  describe('9. PATCH /api/dashboards/{id}/layout', () => {
    it('updates all listed instances in one call', async () => {
      const { userId, cookie } = await createUserWithCookie('layout9a@example.com');
      const dashboardId = await createDashboard(userId);
      const a = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send(validInstanceBody)
        .expect(201);
      const b = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', cookie)
        .send({ ...validInstanceBody, x: 2, y: 2 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/dashboards/${dashboardId}/layout`)
        .set('Cookie', cookie)
        .send([
          { id: a.body.id, x: 5, y: 5, w: 3, h: 3 },
          { id: b.body.id, x: 6, y: 6, w: 4, h: 4 },
        ])
        .expect(200);

      expect(res.body).toHaveLength(2);
      const rowA = await prisma.widgetInstance.findUnique({ where: { id: a.body.id } });
      const rowB = await prisma.widgetInstance.findUnique({ where: { id: b.body.id } });
      expect(rowA).toMatchObject({ x: 5, y: 5, w: 3, h: 3 });
      expect(rowB).toMatchObject({ x: 6, y: 6, w: 4, h: 4 });
    });

    it('rejects (whole batch fails) when the batch includes an id belonging to another user', async () => {
      const { userId: ownerId, cookie: ownerCookie } = await createUserWithCookie('layout9b-owner@example.com');
      const { userId: otherId, cookie: otherCookie } = await createUserWithCookie('layout9b-other@example.com');
      const dashboardId = await createDashboard(ownerId);
      const otherDashboardId = await createDashboard(otherId);

      const mine = await request(app.getHttpServer())
        .post(`/api/dashboards/${dashboardId}/widgets`)
        .set('Cookie', ownerCookie)
        .send(validInstanceBody)
        .expect(201);
      const theirs = await request(app.getHttpServer())
        .post(`/api/dashboards/${otherDashboardId}/widgets`)
        .set('Cookie', otherCookie)
        .send(validInstanceBody)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/dashboards/${dashboardId}/layout`)
        .set('Cookie', ownerCookie)
        .send([
          { id: mine.body.id, x: 9, y: 9, w: 1, h: 1 },
          { id: theirs.body.id, x: 9, y: 9, w: 1, h: 1 },
        ])
        .expect(404);

      // Neither entry was applied — including the one that was legitimately owned.
      const rowMine = await prisma.widgetInstance.findUnique({ where: { id: mine.body.id } });
      expect(rowMine).toMatchObject({ x: validInstanceBody.x, y: validInstanceBody.y });
    });
  });

  describe('10. Signup auto-creates exactly one Dashboard', () => {
    it('creates exactly one "My Dashboard" at position 0 on POST /api/auth/register', async () => {
      const email = `signup-${randomUUID()}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'correct-horse-1!' })
        .expect(201);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const dashboards = await prisma.dashboard.findMany({ where: { userId: user.id } });

      expect(dashboards).toHaveLength(1);
      expect(dashboards[0]).toMatchObject({ name: 'My Dashboard', position: 0 });
    });
  });
});
