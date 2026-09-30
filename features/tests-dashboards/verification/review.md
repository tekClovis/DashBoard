# tests-dashboards — review

Verdict: **PASS** (11/11 checklist items). Unit-test-only feature: no UI, no `mock.html`, so no app launch and no screenshots; evidence is command output in this folder.

Base: `https://github.com/tekClovis/dashBoard/blob/feature/tests-dashboards/features/tests-dashboards/verification/`

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | `dashboards.service.spec.ts` covers every public method: happy path, not-found, other-user rejection | PASS | [dashboards-specs-verbose.txt](dashboards-specs-verbose.txt) — `list`, `create`, `createDefault`, `update`, `remove`, `listWidgets`, `addWidgetInstance`, `updateWidgetInstance`, `removeWidgetInstance`, `updateLayout` each have a describe block; every method that takes an id has an "unknown … 404" and an "another user's … 404" case (`list`/`create` assert other users' rows are excluded instead). |
| 2 | Widget instance create/update: unknown widget type, invalid params, missing required connection | PASS | [dashboards-specs-verbose.txt](dashboards-specs-verbose.txt) — `UNKNOWN_WIDGET` (unknown service, unknown widget, retired type on update), `INVALID_PARAMS` (missing required, out of range) on both paths through the real `validateParams`; the no-connection case is covered on both paths and asserts the instance is created/updated. See note (a). |
| 3 | Layout update: unknown instance ids and partial updates | PASS | [dashboards-specs-verbose.txt](dashboards-specs-verbose.txt) — "moves only the listed instances…", "…when one id does not exist", "…belongs to another of the caller's dashboards / another user's dashboard". Killed by [mutation-1.txt](mutation-1.txt). |
| 4 | Every mutating method asserted to emit (or not emit on failure) the matching event | PASS | `instance.created` / `instance.updated` / `instance.deleted` asserted with exact payload on success and `emitted == []` on every failure path of the three instance mutators; `updateLayout` asserts it emits nothing. Dashboard-level mutators have no event type in `dashboard-events.ts`. |
| 5 | DTO specs run `class-validator` on each DTO: one valid + each distinct invalid shape | PASS | [dashboards-specs-verbose.txt](dashboards-specs-verbose.txt) — all five concrete DTOs (abstract `PositionDto` through both subclasses): length bounds 1/100/101, `Min(0)`, wrong types, missing fields, undeclared fields. See notes (b), (c). |
| 90 | `npm test` in `server/` passes incl. pre-existing specs | PASS | [npm-test.txt](npm-test.txt) — 28 files, 347 tests passed, exit 0. |
| 91 | `npm run lint` and `npx tsc --noEmit -p tsconfig.json` clean | PASS | [npm-lint.txt](npm-lint.txt) — exit 0, 0 errors; 24 warnings, none under `src/dashboards`, all in files this branch does not touch (so identical on `main`). [tsc.txt](tsc.txt) — no output, exit 0. |
| 92 | `git diff main --stat` shows only new `*.spec.ts` under `server/src` (+ this folder) | PASS | [git-diff-stat.txt](git-diff-stat.txt) — 5 new spec files, 910 insertions, nothing else. |
| 93 | Mutation spot-check, 3 reviewer-chosen branches | PASS | [mutation-1.txt](mutation-1.txt) `service.ts:174` `owned !== ids.length` → `===`: 5 `updateLayout` tests fail. [mutation-2.txt](mutation-2.txt) `service.ts:137` `body.refreshRate !== undefined` → `===`: 2 `updateWidgetInstance` refreshRate tests fail. [mutation-3.txt](mutation-3.txt) `service.ts:201` `> MAX_REFRESH_SEC` → `>=`: "accepts a refreshRate equal to the global maximum" fails. Source restored: [mutation-restore-status.txt](mutation-restore-status.txt). |
| 94 | No `any`, no `it.skip`/`it.todo`, no assertion-free tests, no real network/DB/Redis | PASS | Grep of the 5 specs: only `expect.any(String)` matchers; no skip/todo/only/fails, no lint or ts suppressions. Prisma is an in-memory fake, registry and event emitter are the real classes; every test has at least one `expect`. |
| 95 | Bugs found are not fixed, are listed in `findings.md` and pinned with `it.fails` | PASS | No src change ([git-diff-stat.txt](git-diff-stat.txt)); builder pinned none and no spec asserts a bug as correct behaviour. Unpinned issues seen on read-through are in the notes. |

## Notes (not contract misses)

Builder's judgement calls:

- (a) "Missing required connection": `DashboardsService` never reads connections; `features/dashboards-api/spec.md` does not require one at create/update and `docs/Architecture.md` §6 puts `NOT_CONNECTED` at fetch time. Asserting that creation succeeds is the real behaviour, not a pinned bug.
- (b) `LayoutUpdateDto` goes through `ParseArrayPipe` without whitelist (`dashboards.controller.ts:62`), so an extra field is not an invalid shape for it and none is asserted. The shared spec helper still validates it with `whitelist + forbidNonWhitelisted`, which is stricter than production for that one DTO; harmless for the cases present.
- (c) One file `dto/dashboards.dto.spec.ts` for all DTOs; the checklist does not require one file per DTO.

Possible src bugs nobody pinned (read-through only, not executed):

- `dashboards.service.ts:172-174` — a layout batch that lists the same id twice is rejected with 404, because `count` de-duplicates while `ids.length` does not.
- `dto/update-dashboard.dto.ts`, `dto/update-widget-instance.dto.ts` — `@IsOptional()` also lets `null` through. `{ "params": null }` reaches `validateParams` (`param-validator.ts:32` indexes `raw`), and `{ "name": null }` / `{ "refreshRate": null }` reach Prisma: likely 500 instead of 400.
- `dto/position.dto.ts` — no bounds: negative `x`/`y` and zero or negative `w`/`h` are accepted.
- `dashboards.service.ts:67-70` — deleting a dashboard removes its instances without any `instance.deleted` event.

Other:

- Controller specs mostly assert delegation with the arguments the test passed in, which sits close to the spec's non-goal; they do pin the `{ dashboards }` / `{ widgets }` / `{ ok: true }` envelopes and the argument order.
- Dashboard-level mutators (`create`, `createDefault`, `update`, `remove`) carry no "emits nothing" assertion; there is no event type for them.

## Screenshots

None: this feature has no UI state.
