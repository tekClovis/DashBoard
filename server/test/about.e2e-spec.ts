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

  it('serves the subject-required shape from an empty registry', async () => {
    const res = await request(app.getHttpServer()).get('/about.json').expect(200);

    expect(res.body).toEqual({
      client: { host: expect.any(String) },
      server: {
        current_time: expect.any(Number),
        services: [],
      },
    });
    expect(Number.isInteger(res.body.server.current_time)).toBe(true);
  });

  it('does not let the SPA fallback swallow /about.json or /api/*', async () => {
    await request(app.getHttpServer())
      .get('/about.json')
      .expect(200)
      .expect('Content-Type', /json/);

    await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
  });
});
