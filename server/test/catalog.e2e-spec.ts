// e2e for features/catalog-api/spec.md's verification checklist (items 1-3; the param
// validator itself is covered by src/catalog/param-validator.spec.ts, and /about.json's
// unchanged shape by about.e2e-spec.ts).
//
// Follows the connections.e2e-spec.ts conventions: real Postgres via testcontainers, real
// HTTP through supertest. A test WidgetDefinition is registered directly against the
// WidgetRegistryService, since no real widgets are in scope for this feature.

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/core/prisma/prisma.service.js';
import { TokenCipherService } from '../src/connections/token-cipher.service.js';
import { WidgetRegistryService } from '../src/catalog/widget-registry.service.js';
import type { WidgetDefinition } from '../src/catalog/widget-definition.js';

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let cipher: TokenCipherService;

  // Exercises every ParamSpec field the checklist requires beyond /about.json's name/type.
  const testWidget: WidgetDefinition = {
    service: 'github',
    name: 'recent_commits',
    description: 'Recent commits for a repo.',
    params: [
      { name: 'repo', type: 'string', required: true, pattern: '^[\\w.-]+/[\\w.-]+$', label: 'Repository' },
      { name: 'count', type: 'integer', min: 1, max: 20, default: 5, label: 'Count' },
      { name: 'sort', type: 'string', enum: ['recent', 'oldest'], default: 'recent', label: 'Sort' },
    ],
    minRefreshSec: 60,
    auth: 'connection',
    fetch: async () => ({}) as never,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    cipher = app.get(TokenCipherService);

    const registry = app.get(WidgetRegistryService);
    registry.registerService({ name: 'github', connection: 'oauth' });
    registry.register(testWidget);
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

  describe('GET /api/catalog', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/catalog').expect(401);
    });

    it('returns the full ParamSpec shape, with connected:true and the row status for a connected service', async () => {
      const { userId, cookie } = await createUserWithCookie('cat1@example.com');
      await prisma.serviceConnection.create({
        data: { userId, service: 'github', externalAccountId: 'gh-1', accessTokenEnc: cipher.encrypt('t'), status: 'OK' },
      });

      const res = await request(app.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(200);

      expect(res.body.services).toContainEqual(
        {
          name: 'github',
          connection: 'oauth',
          connected: true,
          status: 'OK',
          widgets: [
            {
              service: 'github',
              name: 'recent_commits',
              description: 'Recent commits for a repo.',
              minRefreshSec: 60,
              params: [
                { name: 'repo', type: 'string', required: true, pattern: '^[\\w.-]+/[\\w.-]+$', label: 'Repository' },
                { name: 'count', type: 'integer', min: 1, max: 20, default: 5, label: 'Count' },
                { name: 'sort', type: 'string', enum: ['recent', 'oldest'], default: 'recent', label: 'Sort' },
              ],
            },
          ],
        },
      );
    });

    it('returns connected:false for a service the current user has not connected', async () => {
      const { cookie } = await createUserWithCookie('cat2@example.com');

      const res = await request(app.getHttpServer()).get('/api/catalog').set('Cookie', cookie).expect(200);

      expect(res.body.services).toContainEqual(expect.objectContaining({ name: 'github', connected: false }));
    });
  });
});
