# Testing

Solo project, so the goal is coverage that catches regressions cheaply, not exhaustive suites. See [Stack.md](./Stack.md) for why each tool was picked.

## Layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Services, guards, pipes, param-spec validation — pure logic, DB/HTTP mocked or omitted. |
| Integration | Vitest + Testcontainers | Controllers/services against a real Postgres + Redis, so Prisma queries and cache keys are exercised as written, not against a mock. |
| E2E | Vitest + Supertest | Full REST surface through `app.getHttpServer()` — auth flow, widget CRUD, `/about.json` — hitting the same DB/Redis as integration tests. |
| WebSocket | `socket.io-client` in Vitest | Timer tick → room push: a widget instance subscribes, the tick loop fires, the client asserts the payload. |

## Layout

```
server/
  src/**/*.spec.ts       # unit tests, colocated with the code
  test/*.e2e-spec.ts     # Supertest e2e suites
  test/testcontainers.ts # shared Postgres/Redis container bootstrap
```

Matches Nest's default `test/` convention so `nest generate` scaffolding and existing CLI scripts keep working.

## Database strategy

Integration and e2e tests run against a real Postgres/Redis via Testcontainers, not `docker-compose.yml`'s services — tests must be runnable in CI without the dev stack up. `test/testcontainers.ts` is a Vitest `globalSetup`: it starts the containers once per run, runs `prisma migrate deploy` against them, and exports `DATABASE_URL`/`REDIS_URL` plus a throwaway `JWT_SECRET`/`TOKEN_ENC_KEY` through env vars. Truncate between tests as suites are added, so tests don't leak state into each other.

## What to prioritize

- Auth: local strategy, JWT issuance/verification, OAuth callback handlers (GitHub/Google/Steam) — highest blast radius if broken.
- Widget param validation: `class-validator` DTOs against each service's `ParamSpec`.
- Upstream API caching: same `(service, params, connection)` key returns cached data within TTL, doesn't leak across users.
- `/about.json`: the grader depends on this; keep an e2e test asserting shape.

## Commands

| Command | Runs |
|---|---|
| `npm run test` | Unit tests (`*.spec.ts`) |
| `npm run test:e2e` | Supertest suites against Testcontainers-backed DB (needs Docker) |
| `npm run test:cov` | Coverage report |

Run unit + e2e before every commit that touches `server/src`.
