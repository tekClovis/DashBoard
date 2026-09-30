# fix-pinned-bugs: review

## Checklist

1. **PASS**: A. The pinned handshake-error test is now a plain `it` and passes. "does not let the request through…" now asserts `rejects.toBe(failure)`. A new no-user test asserts `401` with `message: 'access_denied'`, not `INVALID_STATE`. Evidence: [npm-test.txt](npm-test.txt), [revert-A.txt](revert-A.txt)
2. **PASS**: B. `rejects a login state that was signed for another provider` is a plain `it`, asserts `INVALID_STATE` (401) and checks that passport is never called. The diff leaves every connect test in `oauth.guard.spec.ts` untouched, and they all pass. Evidence: [npm-test.txt](npm-test.txt), [revert-B.txt](revert-B.txt)
3. **PASS**: C. `keeps the access token out of a transport error message` is a plain `it` and passes. Transport failures still reject with `FetchError` / `UPSTREAM_ERROR` and the fixed text `GitHub request failed.`, which matches youtube-api. Evidence: [npm-test.txt](npm-test.txt), [revert-C.txt](revert-C.txt)
4. **PASS**: D. The connect-credentials test is a plain `it` and passes. The login-pair fallback is tested. `revokeAtProvider` and `GithubConnectStrategy` both use `githubConnectClient()`, which follows the `googleConnectClient` pattern. Evidence: [npm-test.txt](npm-test.txt), [revert-D.txt](revert-D.txt)
5. **PASS**: E. `rejects an empty JWT_SECRET` is a plain `it` and passes (`@IsNotEmpty()`). The valid-env test now asserts that `JWT_SECRET` is kept. Evidence: [npm-test.txt](npm-test.txt), [revert-E.txt](revert-E.txt)
6. **PASS**: F. The pinned test is a plain `it` and passes. A new test asserts `null`. `URI-decodes the value` still passes. `jwt.guard.spec.ts` asserts 401 for `session=%E0%A4%A`, and `jwt.verify` is never called. Evidence: [npm-test.txt](npm-test.txt), [revert-F.txt](revert-F.txt)
7. **PASS**: I temporarily reverted each fix's source change on its own and ran the spec: A (3 failures), B (1), C (3), D (1), E (1), F (3). A and B share `oauth.guard.ts`, so each was reverted by a targeted hand edit (the diff is shown in each file). C–F used `git checkout main -- <file>`. Everything was restored with `git checkout HEAD -- <file>`. Evidence: [revert-A.txt](revert-A.txt), [revert-B.txt](revert-B.txt), [revert-C.txt](revert-C.txt), [revert-D.txt](revert-D.txt), [revert-E.txt](revert-E.txt), [revert-F.txt](revert-F.txt)
90. **PASS**: `npm test` passes 58 files / 649 tests. `git grep "it.fails" -- server/src` finds nothing (exit 1). Evidence: [npm-test.txt](npm-test.txt), [git-grep-it-fails.txt](git-grep-it-fails.txt)
91. **PASS**: `npm run lint` exits 0 with 28 warnings, the same count as `main`. None of the warnings is in a file this branch changes. `tsc --noEmit` is clean. Evidence: [npm-lint.txt](npm-lint.txt), [tsc.txt](tsc.txt)
92. **PASS**: The diff touches only the A–F source files and their specs (including `strategies/github-connect.strategy.ts`, which D names, and its spec) plus `server/src/auth/jwt.guard.spec.ts`. Nothing under `web/`, `shared/` or `server/test` changes. Evidence: [git-diff-stat.txt](git-diff-stat.txt), [git-log.txt](git-log.txt)

## Notes

- There are 5 commits: A and B share one, and C, D, E and F have one each. Every commit contains its own test change.
- D: `githubConnectClient` uses `??`, so a connect variable set to an empty string (`GITHUB_CONNECT_CLIENT_ID=`) does not fall back to the login pair, and revoke then silently skips. This matches `googleConnectClient`. `.env.example` does not list the connect variables, so today they are undefined.
- D: the shared helper lives in the existing `github-connect.strategy.ts`, not in a new file. This is consistent with `googleConnectClient`.
- B: a login state for the wrong provider falls through to the connect verifier, which rejects it as `INVALID_STATE`. The comment in the code explains this.
- E: whitespace-only `JWT_SECRET` values are still accepted. The spec rules out length and entropy checks as a non-goal.
- C: in `github-api.spec.ts`, the two existing network-failure tests were renamed and now expect the fixed message. C requires this change.
- To run tsc I had to run `prisma generate` first (it writes to `server/src/generated/prisma`, which is gitignored). `shared/dist` was already built.
