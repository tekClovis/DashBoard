import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('AboutController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['about.json'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the subject-required shape', async () => {
    const res = await request(app.getHttpServer()).get('/about.json').expect(200);

    expect(res.body).toEqual({
      client: { host: expect.any(String) },
      server: {
        current_time: expect.any(Number),
        services: expect.any(Array),
      },
    });
    expect(Number.isInteger(res.body.server.current_time)).toBe(true);
  });

  it('lists the github service with its three widgets, params trimmed to name/type', async () => {
    const res = await request(app.getHttpServer()).get('/about.json').expect(200);

    expect(res.body.server.services).toContainEqual({
      name: 'github',
      widgets: [
        {
          name: 'recent_commits',
          description: expect.any(String),
          params: [
            { name: 'repo', type: 'string' },
            { name: 'number', type: 'integer' },
          ],
        },
        {
          name: 'pull_requests',
          description: expect.any(String),
          params: [
            { name: 'repo', type: 'string' },
            { name: 'state', type: 'string' },
          ],
        },
        { name: 'security_alerts', description: expect.any(String), params: [{ name: 'repo', type: 'string' }] },
      ],
    });
  });

  it('does not let the SPA fallback swallow /about.json or /api/*', async () => {
    await request(app.getHttpServer())
      .get('/about.json')
      .expect(200)
      .expect('Content-Type', /json/);

    await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
  });
});
