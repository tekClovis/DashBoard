# Review — tests-service-clients

**Verdict: PASS** — every checklist item passes (item 95 after `verification/findings.md` was added).

Unit-test-only feature: no UI, no `mock.html`, so no app launch and no screenshots. Evidence is command output captured in this folder, run in `server/` on Node v24.18.0.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Each client has a spec with `fetch` stubbed, asserting URL, query params, auth headers | PASS | `github-api.spec.ts:32-60`, `youtube-api.spec.ts:52-72`, `open-meteo.spec.ts:44-70` and `:126-135` (Open-Meteo has no credentials: the spec asserts no `Authorization` header is sent) |
| 2 | Non-2xx (401, 403/rate-limit, 404, 5xx), network failure, malformed JSON, exact error type/code | PASS | `github-api.spec.ts:83-138`, `youtube-api.spec.ts:127-138` and `:177-231`, `open-meteo.spec.ts:85-114` and `:183-201`; all green in [npm-test.txt](npm-test.txt) |
| 3 | Response mapping with realistic payloads, missing/optional fields | PASS | `github-api.spec.ts:62-70`, `youtube-api.spec.ts:74-84`, `open-meteo.spec.ts:72-83`, `:137-155` (result with and without `country`) |
| 4 | A test asserts access tokens never appear in thrown error messages | PASS | `github-api.spec.ts:94-99` (body echoes the token, exact fixed message asserted) and `:142-152` (pinned); `youtube-api.spec.ts:194-198` and `:220-231` |
| 5 | `open-meteo` geocoding: no-result and multi-result | PASS | `open-meteo.spec.ts:137-149` (multi), `:157-173` (no `results` field, empty list) |
| 90 | `npm test` passes, pre-existing specs included | PASS | [npm-test.txt](npm-test.txt): exit 0, 26 files passed, 314 passed + 1 expected fail (the `it.fails` pin) |
| 91 | `npm run lint` and `npx tsc --noEmit -p tsconfig.json` clean | PASS | [npm-lint.txt](npm-lint.txt) (exit 0, 0 errors, 28 warnings), [npm-lint-main-equivalent.txt](npm-lint-main-equivalent.txt) (exit 0, 0 errors, 24 warnings), [tsc.txt](tsc.txt) (exit 0, empty output). See "Lint comparison" |
| 92 | `git diff main --stat` shows only new `*.spec.ts` under `server/src` plus this `verification/` | PASS | [git-diff-stat.txt](git-diff-stat.txt): 3 files, all new `*.spec.ts`, 588 insertions |
| 93 | Mutation spot-check, 3 reviewer-chosen branches | PASS | [mutation.md](mutation.md), [mutation-run.txt](mutation-run.txt) (3 mutants, 6 tests failed), [mutation-restored-run.txt](mutation-restored-run.txt) (restored, exit 0); `git status` shows no source change |
| 94 | No `any`, no `it.skip`/`it.todo`, no assertion-free tests, no real network/DB/Redis | PASS | grep of the three specs: no `any` type, `.skip`, `.todo`, `.only` or snapshot; every `it` has an `expect`; `fetch` is always `vi.stubGlobal`-ed and restored in `afterEach`; Redis is `makeFakeRedis()` from `server/src/timer/test-helpers.ts` |
| 95 | Bugs not fixed, listed in `verification/findings.md` with file:line, pinned by `it.fails` | PASS | [findings.md](findings.md): `verification/findings.md` added after review from this review's verified Findings section (the harness blocked subagents from writing it). Original review: the pin is a real bug and is correctly pinned (`github-api.spec.ts:142`), and no source file is changed. But `verification/findings.md` does not exist: the branch does not contain it, and the reviewer's Write of that file was denied by the harness ("Subagents should return findings as text, not write report files"). Not worked around; the findings text is in the "Findings" section below |

## Lint comparison (item 91)

`main` differs from this branch only by the three new spec files, so linting this tree with those three files ignored is what `main` prints.

| Tree | Exit | Errors | Warnings |
|------|------|--------|----------|
| `main` equivalent ([npm-lint-main-equivalent.txt](npm-lint-main-equivalent.txt)) | 0 | 0 | 24 (23 `unbound-method`, 1 `no-base-to-string`) |
| This branch ([npm-lint.txt](npm-lint.txt)) | 0 | 0 | 28 |

The 4 extra warnings are all `typescript(unbound-method)` in `open-meteo.spec.ts` (`:148`, `:168`, `:191`, `:200`), each on `expect(redis.set)...`. `main` already has the identical construct and warning in `weather.widgets.spec.ts:91/104/125` and `fetch.service.spec.ts:31/89`, and `fetch.service.spec.ts` is a style reference named by the spec. Judged clean: exit 0, no errors, no new rule triggered, no new kind of warning. Noted, because the warning count does go up by 4.

## Findings

Text intended for `verification/findings.md` (file could not be written, see item 95).

### 1. GitHub transport error text, access token included, is sent to the client

- **Where:** `server/src/services/github/github-api.ts:44`
- **Code:** ``throw new FetchError('UPSTREAM_ERROR', `GitHub request failed: ${err instanceof Error ? err.message : String(err)}`);``
- **Why it is a bug:** `TimerService.handleFailure` (`server/src/timer/timer.service.ts:125`, `:131`, `:143`) emits a thrown error's `message` to the client. Node's fetch quotes an invalid header value in its error text, so a stored token containing a character that is illegal in a header ends up verbatim in the widget error. Reproduced on Node v24.18.0 (no request leaves the machine, the header check throws first):

  ```
  $ node -e "fetch('https://api.github.com/x',{headers:{Authorization:'Bearer gho_SEC\nRET'}}).then(()=>console.log('resolved'),e=>console.log(process.version, e.name+': '+JSON.stringify(e.message)))"
  v24.18.0 TypeError: "Headers.append: \"Bearer gho_SEC\nRET\" is an invalid header value."
  ```

  `server/src/services/youtube/youtube-api.ts:69-71` already handles the same case with a fixed message and says why in its comment.
- **Correct behaviour:** `UPSTREAM_ERROR` with a fixed message containing nothing of the transport error.
- **Pinned by:** `server/src/services/github/github-api.spec.ts:142`, `it.fails('keeps the access token out of a transport error message')`. Its first assertion (FetchError / `UPSTREAM_ERROR`) holds today (same path as the passing test at `:109`), so the expected failure comes from the token assertion, not from an unrelated one.

## Notes (not contract misses)

- `github-api.ts:47` and `open-meteo.ts:29`: a 2xx body that is not JSON rejects with the raw `SyntaxError`. The Timer still reports `UPSTREAM_ERROR` (`timer.service.ts:124`), but the client message is V8's text, which quotes the first characters of the upstream body (`Unexpected token '<', "<html>prox"... is not valid JSON`). No credential can plausibly be in it, and `youtube-api.ts:52-56` uses a fixed message for the same case. The builder documented the behaviour with a plain test in each spec instead of pinning it; accepted as a design choice, worth a follow-up.
- `open-meteo.ts:25`: `(err as Error).message` gives `Open-Meteo unreachable: undefined` for a non-Error rejection. Cosmetic.
- `features/tests-service-clients/spec.md` is not in this worktree (it lives in the main checkout only), so item 92's diff contains no `features/` path at all until this folder is committed.
- Mutation run: the three mutants were applied together, one per file; each new spec imports only its own source file, so the failures attribute unambiguously.

## Screenshots

None: this feature has no UI state.
