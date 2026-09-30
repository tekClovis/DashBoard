# tests-auth-oauth: unit tests for the OAuth guard, controller, strategies and session helpers

Verdict: **PASS** — every item passes (item 95 after `verification/findings.md` was added). Reviewed at `84cfeb0` against `main` `3340fd6`.

The two `it.fails` pins do correspond to real bugs (verified below), so the fix is to add `findings.md` with the content of the "Findings" section of this review; no test or source change is needed.

Adds 8 `*.spec.ts` files (918 lines, 72 tests including 2 `it.fails` pins) next to their sources under `server/src/auth`. No source file is changed.

[ev-test]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/features/tests-auth-oauth/verification/npm-test.txt
[ev-lint]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/features/tests-auth-oauth/verification/npm-lint.txt
[ev-tsc]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/features/tests-auth-oauth/verification/tsc.txt
[ev-tsc-found]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/features/tests-auth-oauth/verification/tsc-as-found.txt
[ev-diff]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/features/tests-auth-oauth/verification/git-diff-main-stat.txt
[ev-mut]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/features/tests-auth-oauth/verification/mutation-spot-check.txt
[guard-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/oauth/oauth.guard.spec.ts
[ctrl-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/oauth/oauth.controller.spec.ts
[google-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/oauth/google.strategy.spec.ts
[github-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/oauth/github.strategy.spec.ts
[provider-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/oauth/provider.util.spec.ts
[revocation-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/token-revocation.service.spec.ts
[cookie-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/session-cookie.spec.ts
[user-spec]: https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/server/src/auth/session-user.spec.ts

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | `oauth.guard.spec.ts` covers every guard branch | PASS | [oauth.guard.spec.ts][guard-spec], [npm-test.txt][ev-test], [mutations M3, M6, M7][ev-mut] |
| 2 | `oauth.controller.spec.ts` covers success redirect + session cookie and each failure redirect | PASS | [oauth.controller.spec.ts][ctrl-spec], [mutation M2][ev-mut] |
| 3 | Both login strategies' `validate` tested for normalisation, missing and unverified email | PASS | [google][google-spec], [github][github-spec], [mutation M5][ev-mut] |
| 4 | `token-revocation.service`, `session-cookie`, `session-user` positive and negative paths | PASS | [revocation][revocation-spec], [cookie][cookie-spec], [user][user-spec], [mutations M1, M4][ev-mut] |
| 90 | `npm test` in `server/` passes, including pre-existing specs | PASS | [npm-test.txt][ev-test] |
| 91 | `npm run lint` and `npx tsc --noEmit -p tsconfig.json` clean | PASS | [npm-lint.txt][ev-lint], [tsc.txt][ev-tsc], [tsc-as-found.txt][ev-tsc-found] |
| 92 | `git diff main --stat` shows only new `*.spec.ts` under `server/src` plus `verification/` | PASS | [git-diff-main-stat.txt][ev-diff] |
| 93 | Mutation spot-check: 3 reviewer-chosen branches, each flip fails a new test | PASS | [mutation-spot-check.txt][ev-mut] |
| 94 | No `any`, no `it.skip`/`it.todo`, no assertion-free tests, no real network / DB / Redis | PASS | spec files above, [npm-test.txt][ev-test] |
| 95 | Bugs found are not fixed, listed in `findings.md` with file:line, pinned by `it.fails` | PASS | [findings.md](https://github.com/tekClovis/dashBoard/blob/feature/tests-auth-oauth/features/tests-auth-oauth/verification/findings.md), pins at [oauth.guard.spec.ts][guard-spec] lines 234 and 346; `verification/findings.md` added after review from this review's verified Findings section (the harness blocked subagents from writing it) |

## Detail per item

**1.** Start leg: login, unrecognised intent falling back to login, link bound to the session user, link/connect without a session, link with an unverifiable session token, connect (CSRF cookie, `*-connect` strategy), https `secure` flag. Callback leg: success for login, link and connect; missing state param, state not matching the cookie, no cookie, expired state (fake timers, 11 min), connect CSRF mismatch, connect state for another provider; provider error, non-`Error` provider failure and "no user" outcome. Steam guard: start without session, start with session, callback success, three rejected cookie combinations. The guard itself has no unknown-provider branch (one guard class per provider); that rejection lives in `parseProviderSlug` and is covered in [provider.util.spec.ts][provider-spec].

**2.** Success: `session` cookie flags, JWT claims, redirect to `/d/placeholder`. Failure redirects: `ACCOUNT_BANNED`, `EMAIL_LINK_REQUIRED`, `IDENTITY_ALREADY_LINKED`, `CONNECT_FAILED`. Also link success, connect success for github / youtube / steam, rethrow of unexpected errors, and Steam never logging a user in.

**90.** 31 files, 304 passed, 2 expected fail (the two `it.fails` pins), exit 0.

**91.** In a correctly set-up checkout, `tsc` exits 0 with no output and lint exits 0. What was run:

- As found (worktree without its own `node_modules`, so `@dashboard/shared` resolved to the parent checkout's stale `shared/dist`): 81 `tsc` errors, none in any file of this feature ([tsc-as-found.txt][ev-tsc-found]).
- `main` checkout (`3340fd6`), `npx tsc --noEmit --incremental false -p tsconfig.json` in `server/`: the same 81 errors, so they do not come from this branch.
- Worktree after `npm ci`, `npm run build -w shared`, `npm run db:generate`: `tsc` exit 0, no errors ([tsc.txt][ev-tsc]).
- Lint: exit 0, 0 errors, 24 warnings, all in files that pre-date this branch; `main` prints the same 24. None are in the new specs.

**92.** 8 files, all added (`A`), all `server/src/auth/**/*.spec.ts`.

**93.** Three chosen branches, each flipped, the relevant new spec run, the file restored from a copy:

| Mutation | Location | Tests that failed |
|---|---|---|
| M1 `user.bannedAt` → `!user.bannedAt` | `server/src/auth/session-user.ts:26` | 2 in `session-user.spec.ts` |
| M2 `if (user.bannedAt)` → `if (!user.bannedAt)` | `server/src/auth/oauth/oauth.controller.ts:114` | 2 in `oauth.controller.spec.ts` |
| M3 `intent === 'connect'` → `!==` | `server/src/auth/oauth/oauth.guard.ts:144` | 8 in `oauth.guard.spec.ts` |

Four extra flips (M4 `ttlSec <= 0` → `< 0`, M5 primary-email predicate, M6 Steam cookie `secure`, M7 Steam `openid.mode` detection) were also all caught. `git status` after restoring shows only the untracked `features/tests-auth-oauth/`; `git diff --stat` is empty.

**94.** A grep of the 8 specs for `any`, `it.skip`, `it.todo`, `.only` finds only `expect.any(...)` matchers. Every test has at least one `expect`. `passport.authenticate` is stubbed, Prisma and Redis are in-memory fakes, and the only URLs are config strings.

**95.** Not fixed: yes (`git diff main` contains no source change). Pinned by `it.fails` asserting the correct behaviour: yes, and both pins were checked against the source and are real bugs. Listed in `verification/findings.md`: no. The builder did not write the file, and the reviewer's attempt to create it was denied by the tool harness ("Subagents should return findings as text, not write report files"); the denial was not worked around. The verified content is in the "Findings" section below, ready to be saved as `findings.md`.

## Notes (not contract misses)

- The verification folder was absent from the branch; this review supplies it (without `findings.md`, see item 95).
- The worktree had no `node_modules` of its own, which is what produced the builder's `tsc` errors. `main` has the same problem whenever `shared/dist` is stale; rebuilding `shared` clears it.
- The 24 lint warnings are pre-existing (`unbound-method`, `no-base-to-string`) and outside this feature's scope.
- The non-pinned test "does not let the request through when the provider handshake fails on a login state" only asserts that some `Error` is thrown, because of bug #1; tighten it when #1 is fixed.
- Bug #1 also masks the "no user" `UnauthorizedException` on login/link states, not only thrown provider errors.

## Findings (content for `verification/findings.md`)

Both were checked against the source on `feature/tests-auth-oauth` (src identical to `main`).

### #1 Provider handshake failure on a valid login/link state is masked as `401 INVALID_STATE`

- Where: `server/src/auth/oauth/oauth.guard.ts:119-124` (fall-through to `:126-131`).
- What: `runPassport(...)` (line 121) is awaited inside the same bare `try { } catch { }` as `assertBoundState(...)` (line 120). When the state is valid but the provider round trip rejects (token-exchange error, or the `UnauthorizedException` raised for "no user" at line 88), the catch swallows it, the code falls through to `verifyConnectState` (line 128), which cannot verify a login/link state, and the guard throws `UnauthorizedException({ error: 'INVALID_STATE' })` (line 130).
- Effect: the real provider error is lost and reported as a state/CSRF failure. The connect path (line 132, outside any try) does propagate the same errors, so the two paths disagree.
- Pin: `server/src/auth/oauth/oauth.guard.spec.ts:234`, `it.fails('surfaces a provider handshake error on a login state instead of masking it as INVALID_STATE')`.

### #2 Login/link state is not bound to the callback's provider

- Where: `server/src/auth/oauth/oauth.guard.ts:120`, via `assertBoundState` in `server/src/auth/oauth/oauth-state.ts:81-90` and `verifyOAuthState` at `oauth-state.ts:58-60`.
- What: the signed state carries `provider`, but verification only checks that it is one of `github` / `google`; nothing compares it to `this.cfg.provider`. A state signed by the GitHub start leg is accepted by the Google callback (and the reverse), and `OAuthController.handleCallback` does not compare them either. The connect path does enforce this (`verifyConnectState(queryState, this.cfg.provider, ...)`, guard line 128).
- Effect: the cookie binding still holds, so this is a missing defence-in-depth check rather than a CSRF bypass, but `req.oauthState.provider` can disagree with the provider that actually authenticated the user.
- Pin: `server/src/auth/oauth/oauth.guard.spec.ts:346`, `it.fails('rejects a login state that was signed for another provider')`.

## Screenshots

None: this feature has no UI and no `mock.html`; the evidence is the command output linked above.
