# dashboards-api — review

Reviewed at commit tip of `feature/dashboards-api` (worktree
`.claude/worktrees/agent-a5f76b554b1b3fd04`), diffed against `main`.

Evidence: (a) code inspection of `server/src/dashboards/*`,
`server/src/catalog/param-validator.ts`, `server/src/catalog/widget-registry.service.ts`,
`server/src/auth/auth.controller.ts`, `server/src/auth/oauth/oauth-login.service.ts`,
`server/prisma/schema.prisma`; (b) running the branch's own e2e suite against a real Postgres
(testcontainers) via `npx vitest run --config ./vitest.config.e2e.ts` — 54/54 e2e tests pass,
97/97 unit tests pass, including `server/test/dashboards.e2e-spec.ts` which issues real HTTP
requests (supertest) covering each checklist item 1:1.

## UI (mock.html)
`features/dashboards-api/mock.html` is unchanged by this branch (`git log main..feature/dashboards-api
-- features/dashboards-api/mock.html` is empty) and is a fully self-contained static page — its
`<script>` only mutates an in-memory `instances` array, it never calls `fetch()` against the
built API. No new HTML page or static route was added anywhere in the diff
(`git diff main...feature/dashboards-api --stat` has no `.html`/route additions). Per spec's
Non-goals ("Any frontend grid/dialog UI — widget-grid-ui"), this feature is backend-only; there is
no real frontend to click through, so no screenshots were captured — faking them would misrepresent
what was verified. mock.html remains only a reference contract for `widget-grid-ui` to implement
against.

## Checklist

1. **POST /api/dashboards auto-position, GET lists only caller's — PASS.**
   `dashboards.service.ts:36-46` (`create`) finds the caller's max position and inserts at
   `+1` (or `0` if none); `list` (`:28-34`) filters `where: { userId }`. Confirmed live via
   `dashboards.e2e-spec.ts` describe block 1 (two dashboards for one user get positions 0/1; a
   third user's dashboard doesn't appear in the first user's list).

2. **PATCH /api/dashboards/{id} cross-user → 404 — PASS.**
   `dashboards.service.ts:58-64` (`update`) does `findFirst({ where: { id, userId } })` before
   updating, throwing `NotFoundException` (not Forbidden) when it's someone else's — matches
   Architecture §8's 404-not-403 rule. Confirmed via e2e describe block 2.

3. **POST .../widgets valid create — PASS.**
   `addWidgetInstance` (`dashboards.service.ts:71-111`) creates the row and returns
   `toWidgetInstanceEntry` with `id`. Confirmed via e2e describe block 3 (id present, row exists
   in DB).

4. **Invalid params → 400 structured per-param error, no row — PASS.**
   `validateParamsOrThrow` (`dashboards.service.ts:178-188`) wraps
   `catalog/param-validator.ts`'s `validateParams`, throwing
   `BadRequestException({ error: 'INVALID_PARAMS', param, message })`. `validateParams`
   (`param-validator.ts:28-73`) checks `required`, `enum`, integer `min`/`max`, and string
   `pattern`, returning the first failing param. Confirmed via e2e describe block 4 (missing
   required `city`, and enum-violating `units`), both asserting the exact `{error, param,
   message}` shape and zero rows created.

5. **refreshRate out of `[minRefreshSec, 86400]` → 400 — PASS.**
   `validateRefreshRateOrThrow` (`dashboards.service.ts:190-197`), bounds inclusive. Confirmed
   via e2e describe block 5 (60 < minRefreshSec=300, and 86401 > 86400), both 400, no rows.

6. **Unknown service/widget → 400 not 500 — PASS.**
   `dashboards.service.ts:88-89`: `registry.get()` returns `undefined` →
   `BadRequestException({ error: 'UNKNOWN_WIDGET' })` thrown before any DB write. Confirmed via
   e2e describe block 6.

7. **PATCH /api/widgets/{id} same validation, cross-user → 404 — PASS.**
   `updateWidgetInstance` (`dashboards.service.ts:113-142`) re-validates via the same
   `validateParamsOrThrow`/`validateRefreshRateOrThrow`, scoped by
   `findFirst({ where: { id: instanceId, dashboard: { userId } } })` (WidgetInstance has no
   `userId` column, scoped through the `dashboard` relation, per the file's header comment).
   Confirmed via e2e describe block 7 (valid update to `params`/`refreshRate`, an out-of-range
   `refreshRate` rejected, and a cross-user request 404s).

8. **DELETE /api/widgets/{id} scoped removal — PASS.**
   `removeWidgetInstance` (`dashboards.service.ts:144-150`) uses
   `deleteMany({ where: { id, dashboard: { userId } } })`, 404 on `count === 0`. Confirmed via
   e2e describe block 8 (attacker gets 404, owner's delete succeeds and the row is gone).

9. **PATCH /api/dashboards/{id}/layout batch semantics — PASS.**
   `updateLayout` (`dashboards.service.ts:153-176`) runs in a `$transaction`: confirms the
   dashboard belongs to `userId`, then requires every entry's `id` to `count`-match
   `{ id: { in: ids }, dashboardId }` — an id from another dashboard (same or different user)
   fails this count and the whole call 404s with nothing applied (chosen: whole-batch-fails).
   Confirmed via e2e describe block 9 (2-entry batch applied atomically; a batch mixing one
   owned + one other-user id is rejected in full, and the owned entry's row is left untouched).

10. **Signup → exactly one Dashboard — PASS (happy path), with a resilience gap flagged below.**
    Local register (`auth.controller.ts:74-79`) creates the `User`, then
    `Promise.all([dashboards.createDefault(user.id), this.issueAndSend(...)])`. OAuth signup
    (`oauth-login.service.ts:57-74`) creates `User` + `Dashboard` inside one
    `$transaction`, genuinely atomic. The register path is **not** atomic: `prisma.user.create`
    (line 75) is already committed before `createDefault` runs, and the two are `Promise.all`'d
    rather than the dashboard creation being folded into the user-creation transaction. If
    `createDefault` throws for any reason (DB hiccup, connection pool exhaustion), the request
    500s but the `User` row already exists with zero dashboards — silently violating "exactly
    one auto-created Dashboard" for that account, with no compensating retry. Confirmed via e2e
    describe block 10 that the happy path does produce exactly one `Dashboard` — this is a
    correctness gap under failure, not a happy-path bug, so I'm not marking it a hard FAIL, but
    it's worth fixing to match the OAuth path's atomicity (fold `createDefault` into the same
    `prisma.user.create` transaction, or make it compensable).

## Overall verdict: PASS

All 10 checklist items pass in normal operation, backed by the branch's own real-Postgres e2e
suite (54/54) plus independent code review. One non-blocking finding: **register's
signup-then-default-dashboard sequence (`server/src/auth/auth.controller.ts:74-79`) isn't
transactionally atomic**, unlike the OAuth signup path (`server/src/auth/oauth/oauth-login.service.ts:57-74`)
which explicitly is — a mid-request failure can leave a `User` with zero dashboards. Recommend
wrapping `prisma.user.create` + `dashboards.createDefault` in one transaction (mirroring the OAuth
path) before merging, even though it doesn't fail any of the 10 checklist assertions as written.
