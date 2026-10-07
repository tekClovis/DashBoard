// Vitest globalSetup for e2e tests — see docs/Testing.md.
//
// Starts real Postgres/Redis containers (not docker-compose.yml's services,
// so tests run without the dev stack up), runs `prisma migrate deploy`
// against them, and exports their URLs plus test secrets through env vars
// that env.validation.ts requires.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

let postgres: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;

/**
 * Start Postgres 16 and Redis 7 containers, set the env vars the app validates, and apply migrations.
 * @throws when `prisma migrate deploy` exits non-zero (stdio is inherited).
 */
export async function setup(): Promise<void> {
  [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  process.env['APP_URL'] = 'http://localhost:8080';
  process.env['DATABASE_URL'] = postgres.getConnectionUri();
  process.env['REDIS_URL'] = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  process.env['JWT_SECRET'] = randomBytes(32).toString('hex');
  process.env['TOKEN_ENC_KEY'] = randomBytes(32).toString('base64');
  // OAuth app credentials are never actually used against a real provider in
  // tests — the outbound HTTP is stubbed at the strategy boundary — but
  // passport-oauth2 strategies require non-empty values to construct.
  process.env['GITHUB_CLIENT_ID'] = 'test-github-client-id';
  process.env['GITHUB_CLIENT_SECRET'] = 'test-github-client-secret';
  process.env['GOOGLE_CLIENT_ID'] = 'test-google-client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'test-google-client-secret';
  process.env['STEAM_API_KEY'] = 'test-steam-api-key';

  const schemaPath = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
  // npm workspaces hoist bins to the repo root's node_modules/.bin.
  const prismaBin = fileURLToPath(new URL('../../node_modules/.bin/prisma', import.meta.url));
  execFileSync(prismaBin, ['migrate', 'deploy', '--schema', schemaPath], {
    stdio: 'inherit',
    env: process.env,
  });
}

/** Stop both containers; safe if `setup` failed before they started. */
export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), redis?.stop()]);
}
