# tests-connections — review

Verdict: **FAIL** (items 3 and 95).

Unit-test-only feature: no UI, no app launch, no screenshots. Evidence is command output, run in `server/` on `feature/tests-connections` at `4c0f377`.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | `provider-revoke.spec.ts` covers each provider's revoke request (URL, method, auth), provider failure, providers with no revoke endpoint | PASS | GitHub URL / `DELETE` / Basic auth / body, YouTube URL / `POST` / no `Authorization`, rejected fetch for both, `steam` / `weather` / `unknown` make no request — [npm-test.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/npm-test.txt) |
| 2 | Each connect strategy's `validate` tested for account id / tokens / scopes, including missing refresh token | PASS | GitHub (id, access token, scopes, no refresh token), Google (both tokens, scopes, `''` and `undefined` refresh token), Steam (SteamID64, no tokens, 4 malformed identifiers) — [npm-test.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/npm-test.txt) |
| 3 | `connections.controller.spec.ts` covers list, connect callback (success and state failure) and disconnect, service mocked at the boundary | **FAIL** | List and disconnect are covered. The connect callback is not covered anywhere. The builder's claim is correct: `connections.controller.ts` only has `list` (`:21`) and `disconnect` (`:26`); the callback lives in `server/src/auth/oauth/oauth.controller.ts:38,48,58` with the connect branch at `:70`, outside this spec's file list, and that controller has no spec. The checklist wording is still unmet, so this is a contract miss — either the item is reworded or an `oauth.controller.spec.ts` is added (a new `*.spec.ts` under `server/src`, which item 92 allows). |
| 4 | A test asserts raw tokens are never returned in controller responses | PASS | `never returns raw or encrypted tokens from list` and `revokes the decrypted token of the deleted row without returning it`, both over the real `ConnectionsService` with a token-bearing row — [npm-test.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/npm-test.txt) |
| 90 | `npm test` in `server/` passes, including every pre-existing spec | PASS | 28 files passed, 261 tests passed, 1 expected fail, exit 0 — [npm-test.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/npm-test.txt) |
| 91 | `npm run lint` and `npx tsc --noEmit -p tsconfig.json` clean | PASS | Lint exit 0; its warnings are all in files this branch does not touch (`auth/`, `services/weather/`, `timer/`, `test/`), none under `connections/`. `tsc` exit 0 with empty output — [npm-lint.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/npm-lint.txt), [tsc.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/tsc.txt) |
| 92 | `git diff main --stat` shows only new `*.spec.ts` under `server/src` plus this feature's `verification/` | PASS | 5 new spec files, 357 insertions, nothing else — [git-diff-stat.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/git-diff-stat.txt) |
| 93 | Mutation spot-check: 3 reviewer-chosen branches, each flip fails at least one new test | PASS | See "Mutation spot-check" below; sources restored, `git status` shows no source changes |
| 94 | No `any`, no `it.skip` / `it.todo`, no assertion-free tests, no real network / DB / Redis | PASS | Read of the 5 specs: no `any`, no skip / todo, every test asserts, `fetch` stubbed with `vi.stubGlobal`, Prisma and cipher faked in memory |
| 95 | Bug found in src not fixed, listed in `verification/findings.md` with file:line, pinned by `it.fails` | **FAIL** | The pinned bug is real and is not fixed, and the `it.fails` pin is correct (`provider-revoke.spec.ts:52`, reported as "1 expected fail"). The item fails only because `verification/findings.md` is missing: the reviewer's Write of that file was denied by the harness ("Subagents should return findings as text, not write report files") and was not worked around. The findings text is in "Findings" below. |

## Mutation spot-check (item 93)

Each condition was flipped alone, the matching new spec run, then the file restored.

| # | Branch | Flip | Tests that failed | Output |
|---|--------|------|-------------------|--------|
| 1 | `server/src/connections/provider-revoke.ts:12` | `if (!accessToken) return;` → `if (accessToken) return;` | 6 of 12 in `provider-revoke.spec.ts`, e.g. `deletes the GitHub grant with the app credentials as basic auth and the token in the body`, `makes no request for github when there is no access token` | [mutation-1-provider-revoke.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/mutation-1-provider-revoke.txt) |
| 2 | `server/src/connections/connections.controller.ts:30` | `if (existing)` → `if (!existing)` | 4 of 7 in `connections.controller.spec.ts`, e.g. `deletes the current user's connection and revokes its token at the provider`, `is idempotent when nothing is connected: still ok, no provider call` | [mutation-2-connections-controller.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/mutation-2-connections-controller.txt) |
| 3 | `server/src/connections/strategies/steam-connect.strategy.ts:37` | `if (!steamId64)` → `if (steamId64)` | 5 of 5 in `steam-connect.strategy.spec.ts`, e.g. `extracts the SteamID64 from the OpenID claimed id and returns no tokens` | [mutation-3-steam-strategy.txt](https://github.com/tekClovis/dashBoard/blob/feature/tests-connections/features/tests-connections/verification/mutation-3-steam-strategy.txt) |

## Findings

Stands in for the missing `verification/findings.md` (see item 95).

### 1. GitHub disconnect revokes with the login app's credentials, not the connect app's

- **Where:** `server/src/connections/provider-revoke.ts:16-17` (used at `:19` for the URL and `:22` for the Basic auth header).
- **What:** `revokeAtProvider('github', …)` always reads `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
- **Why it is wrong:** connect tokens are issued to the connect OAuth app. `server/src/connections/strategies/github-connect.strategy.ts:24-26` prefers `GITHUB_CONNECT_CLIENT_ID` / `GITHUB_CONNECT_CLIENT_SECRET` and only falls back to the login pair. With a separate connect app configured, `DELETE https://api.github.com/applications/{login-id}/grant` is sent for a token that belongs to another app, so GitHub does not revoke the grant. The error is invisible: the response status is never checked and the call is best-effort, so disconnect still returns `{ ok: true }`.
- **Impact:** after "disconnect", the `repo` / `security_events` grant stays live at GitHub whenever the connect app differs from the login app.
- **Correct behaviour:** resolve credentials the way the strategy does (connect pair first, login pair as fallback), as `googleConnectClient` already does for Google in `server/src/connections/strategies/google-connect.strategy.ts:17-22`.
- **Pinned by:** `server/src/connections/provider-revoke.spec.ts:52` — `it.fails('revokes the GitHub grant with the connect app credentials when they are configured')`.

## Notes (not contract misses)

- `revokeAtProvider` never checks the provider's HTTP status, so a 4xx / 5xx revoke is treated as success. The spec covers "provider failure" only as a rejected `fetch`; a non-2xx response is untested.
- `GITHUB_CONNECT_CLIENT_ID` / `GITHUB_CONNECT_CLIENT_SECRET` are read only by `github-connect.strategy.ts`; nothing else in `server/src` references them.
- The GitHub strategy spec does not exercise the connect-vs-login client preference in the constructor (the Google spec does, through `googleConnectClient`).

## Screenshots

None: this feature has no UI state to capture.
