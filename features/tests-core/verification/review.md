# tests-core review

Branch `feature/tests-core` (12cdb5e). Unit-test-only feature: no UI, so the evidence is command output, no screenshots.

## Checklist

| # | Result | Evidence |
|---|--------|----------|
| 1 | PASS | [env.validation.spec.ts](../../../server/src/core/config/env.validation.spec.ts): valid env + SMTP defaults, each of the 5 required vars missing, bad `APP_URL`, `SMTP_PORT` `abc`/`0`/`65536`/`25.5`, 16- and 33-byte `TOKEN_ENC_KEY`; [npm-test.txt](npm-test.txt) |
| 2 | PASS | [cookies.spec.ts](../../../server/src/core/http/cookies.spec.ts) (missing header, several cookies, `%`-encoded value), [client-address.spec.ts](../../../server/src/core/http/client-address.spec.ts) (direct IPv4/IPv6, `::ffff:` stripped, `X-Forwarded-For`/`X-Real-IP` ignored in favour of the socket); [npm-test.txt](npm-test.txt) |
| 3 | PASS | [mail.service.spec.ts](../../../server/src/core/mail/mail.service.spec.ts): `nodemailer` stubbed, exact message fields, rejection swallowed and logged (Error and non-Error); [npm-test.txt](npm-test.txt) |
| 4 | PASS | [catalog.service.spec.ts](../../../server/src/catalog/catalog.service.spec.ts) and [about.controller.spec.ts](../../../server/src/catalog/about.controller.spec.ts): empty and populated registry shapes, `client.host`, `current_time` in whole seconds under fake timers; [npm-test.txt](npm-test.txt) |
| 5 | PASS | [list-users-query.dto.spec.ts](../../../server/src/admin/dto/list-users-query.dto.spec.ts) (defaults 1/20, bounds 1..100, non-int/zero/negative rejected, `q` 200/201) and [update-user.dto.spec.ts](../../../server/src/admin/dto/update-user.dto.spec.ts) (invalid role, invalid `bannedAt`, `null` unban), both through the same `ValidationPipe` options as `main.ts`; [npm-test.txt](npm-test.txt) |
| 90 | PASS | [npm-test.txt](npm-test.txt): 33 files passed, 296 passed + 2 expected fail |
| 91 | PASS | [npm-run-lint.txt](npm-run-lint.txt): exit 0, 0 errors; every warning is in a file this branch does not touch (identical to `main`), none in the new specs. [tsc-noemit.txt](tsc-noemit.txt): empty output, exit 0 |
| 92 | PASS | [git-diff-main-stat.txt](git-diff-main-stat.txt): 10 new `*.spec.ts` files under `server/src`, 493 insertions, nothing else (plus this `verification/`) |
| 93 | PASS | 3 reviewer-chosen flips, each file restored afterwards (`git status` shows no source change): [mutation-1-cookies.txt](mutation-1-cookies.txt) `cookies.ts:10` `key === name` -> `!==`: 8 of 9 cookies tests fail; [mutation-2-client-address.txt](mutation-2-client-address.txt) `client-address.ts:6` `startsWith('::ffff:')` negated: 4 of 5 fail; [mutation-3-env-validation.txt](mutation-3-env-validation.txt) `env.validation.ts:76` `!== 32` -> `=== 32`: 4 fail incl. "rejects a 16-byte TOKEN_ENC_KEY" |
| 94 | PASS | New specs read in full: no `any` type (only the `expect.any(String)` matcher), no `it.skip`/`it.todo`, every test asserts, Prisma/nodemailer stubbed, no network/DB/Redis |
| 95 | FAIL | Both `it.fails` pins are real bugs ([pinned-bugs-run.txt](pinned-bugs-run.txt), see Findings below), but `verification/findings.md` does not exist: the branch ships no `features/tests-core/verification/` at all, and the reviewer's Write of `findings.md` was denied by the harness, so the findings are only in this file |

## Findings

`verification/findings.md` could not be written (the Write was denied by the harness), so the findings are listed here instead.

1. `server/src/core/config/env.validation.ts:17-18`: `JWT_SECRET` is only `@IsString()`, so an empty value passes validation. `.env.example:4` ships `JWT_SECRET=`, and `docs/Architecture.md:383` (§11) says the server refuses to start without `JWT_SECRET`. With `JWT_SECRET=` the boot check passes and `JwtService.signSegment` (`server/src/auth/jwt.service.ts:58-59`) HMACs session tokens with an empty key. Pinned by `server/src/core/config/env.validation.spec.ts:58`.
2. `server/src/core/http/cookies.ts:11`: `decodeURIComponent` throws `URIError` on a malformed escape (`session=%E0%A4%A`). `JwtGuard.canActivate` (`server/src/auth/jwt.guard.ts:27`) does not catch it, and since it is not an `HttpException`, Nest answers 500 instead of 401. The same unguarded call also runs from `auth/auth.controller.ts:165`, `auth/oauth/oauth.guard.ts:66,118,126,198,199` and `timer/realtime.gateway.ts:163`. Pinned by `server/src/core/http/cookies.spec.ts:43`.

## Notes (not contract misses)

- Item 1 "short secret" is covered by the `TOKEN_ENC_KEY` byte-length check. `JWT_SECRET` has no minimum length in the source, so only the empty-value pin exists for it.
- `admin.controller.spec.ts` covers the guards/roles metadata and `remove`, but not `list`/`update`, which only forward to the service.
- `catalog.controller.spec.ts` checks that the handler forwards the user id. That is close to the "mock called with what the test passed" non-goal, but it would still catch a controller that passed the whole user object.
