# auth-session review — feature/auth-session vs main

Branch reviewed: `feature/auth-session` (3 commits ahead of `main`: `0081f1f` feat, `6d50def` fix admin-seed overwrite, `4076c05` fix jti revocation on logout).

## Checklist verdicts

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Login sets httpOnly cookie, body has no secret | PASS | `server/test/auth-session.e2e-spec.ts` test 1 (passed); `auth.controller.ts` `login()` returns `{ok:true}` only, token goes via `res.cookie(...httpOnly:true...)` |
| 2 | Same generic 401 for wrong password vs unknown email | PASS | e2e test 2 passed; both paths throw `UnauthorizedException({error:'INVALID_CREDENTIALS'})` in `auth.controller.ts:116-118` |
| 3 | 403 EMAIL_NOT_CONFIRMED for unverified user w/ correct creds | PASS | e2e test 3 passed; `auth.controller.ts:119-121` |
| 4 | `/me` 200 with cookie, 401 with none/garbage | PASS | e2e test 4 passed; `jwt.guard.ts` throws Unauthorized on missing/invalid token |
| 5 | Logout clears cookie + old cookie value 401s afterward | PASS | e2e test 5 passed. Logout revokes the token's `jti` in Redis (`token-revocation.service.ts`) so the *exact* old signed cookie is rejected server-side, not just cleared client-side — stronger than the checklist requires |
| 6 | logout-all invalidates a second still-valid session | PASS | e2e test 6 passed; `logoutAll()` increments `tokenVersion`, guard rejects `tv !== user.tokenVersion` |
| 7 | Banned user rejected despite valid cookie | PASS | e2e test 7 passed; `jwt.guard.ts:37` checks `user.bannedAt` |
| 8 | Admin boot-seed: idempotent, doesn't overwrite existing user | PASS | e2e test 8 passed (auto-seed + immediate login); `admin-seed.service.ts` checks `findFirst({role:ADMIN})` first (no-op if any admin exists) and separately checks `findUnique({email})` to refuse overwriting a same-email non-admin account (added in fix commit `6d50def`) |
| 9 | register/confirm/resend endpoints/tests unmodified | PASS | `git diff main...feature/auth-session -- server/src/auth/auth.controller.ts` shows only additive hunks; `register`/`confirm`/`resend` method bodies byte-identical to main. All pre-existing `describe('register'/'confirm'/'resend')` blocks in `auth.controller.spec.ts` pass unchanged (48/48 unit tests pass) |

## Test run results
- `npm test` (server unit, vitest): **48/48 passed**, 6 files.
- `vitest run --config ./vitest.config.e2e.ts` (real Postgres+Redis via testcontainers): **10/10 passed** (8 auth-session + 2 about).
- Tests read as genuine, not tautological: they use a real bcrypt hash + DB round-trip, assert on actual `Set-Cookie` contents, replay a captured raw JWT after logout, and run two parallel login sessions for the logout-all check.

## Defect found — frontend UI does not implement logout / logout-all (checklist scope, not numbered 1-9 but explicitly required by spec.md's "Verification" section and mock.html)

`git diff main...feature/auth-session --stat` shows **zero files under `web/` changed** by this branch. Inspecting the frontend directly:
- `web/src/api/auth.ts` has `useLogin`, `useRegister`, `useConfirm`, `useResend`, `useMe` — **no `useLogout`/`useLogoutAll`**, and no client ever calls `POST /api/auth/logout` or `/logout-all`.
- `grep -rn "logout" web/src` returns **nothing**.
- `web/src/routes/DashboardPlaceholderPage.tsx` (the only "logged-in" screen) renders `Logged in as {email} ({role})` with a theme toggle — no buttons at all.

`mock.html`'s `#session-view` requires a logged-in panel with a "Log out" button and a "Log out of all devices" button. The built app has neither the buttons nor any backing API call. This is a real functional gap, not cosmetic: a logged-in user in the built app has no way to end their session from the UI, and `spec.md`'s own Verification section explicitly gates UI on matching mock.html's logged-in-panel state including logout/logout-all.

I could not drive this live in a headless browser: this sandbox has something (an IDE dev-container port-forward proxy) already bound to `:8080` — the server's hardcoded port (`server/src/main.ts:14`, no `PORT` env override) — returning an unrelated "Authentication required" redirect page, so the real Nest app couldn't bind. Backend unit+e2e tests (which use ephemeral testcontainer ports, not 8080) ran fine and are the evidence above. The UI finding above is from direct code/grep inspection, not a screenshot, per the "say so explicitly" fallback in the task instructions. No screenshots were produced (nothing to capture that isn't already fully described, and I was not able to load the app past `:8080`).

## Overall verdict: **NOT READY**

All 9 numbered checklist items in `spec.md` pass with solid, non-superficial test coverage. However, the branch's own "Verification" section requires the built UI to match `mock.html`'s logged-in panel (logout + logout-all buttons), and that UI was never built — the branch only touched `server/`. 

**Defect to fix before PR:** add logout/logout-all UI wiring — `useLogout`/`useLogoutAll` mutations in `web/src/api/auth.ts` calling `POST /api/auth/logout` and `POST /api/auth/logout-all`, plus buttons in the logged-in view (e.g. `DashboardPlaceholderPage.tsx`) that invoke them and redirect to `/login` (invalidate the `['me']` query) afterward, matching `mock.html`'s `#session-view`.

---

## Second-pass review (2026-09-17) — checking the claimed logout/logout-all fix

Instructed to re-review `feature/auth-session` expecting a new top commit `[C.NE][web] fix: add logout/logout-all buttons to logged-in view` on top of `4076c05`, touching `web/src/api/auth.ts` (`useLogout`/`useLogoutAll`) and `web/src/routes/DashboardPlaceholderPage.tsx` (two buttons).

**That commit does not exist.**

- Checked out `feature/auth-session`. `git log --oneline -6` still shows `4076c05` as the tip, identical to the state reviewed above. No commits were added on top.
- `git log --all --oneline --grep="logout" -i` across every ref in the repo (all local branches, `work/auth-session-logout-fix`, `feature-auth-session-ro`, `origin/feature/auth-session`, reflogs) returns only `4076c05` (`fix: revoke JWT jti on logout`), the pre-existing backend commit already accounted for in the first pass. No commit with the described message or diff exists anywhere in this repository's history, refs, or reflog.
- Direct code inspection confirms the gap is unchanged: `grep -rn "logout" web/src` → **no matches**. `web/src/api/auth.ts` still only exports `useRegister`, `useLogin`, `useConfirm`, `useResend`, `useMe` — no `useLogout`/`useLogoutAll`. `web/src/routes/DashboardPlaceholderPage.tsx` still renders only `Logged in as {email} ({role})` plus a theme toggle — no buttons.
- `web` build (`tsc --noEmit && vite build`) passes clean, unsurprising since no new frontend code was introduced to break it.

Conclusion: the "rebuild" and its described commit are not present on this branch (nor on any branch/ref in the repo). The frontend logout/logout-all defect flagged in the first pass is **still unfixed** — this is the same gap, not a re-verification of a fix. No live browser run was attempted since there is no new UI to exercise.

### Overall verdict (second pass): **NOT READY**

Backend (checklist items 1–9) remains solid per the first pass — untouched, still passing. The frontend logout/logout-all UI required by `mock.html`'s `#session-view` and by `spec.md`'s Verification section is absent from the branch as it currently exists. Before this can be re-reviewed as fixed, the commit adding `useLogout`/`useLogoutAll` and the two buttons needs to actually land on `feature/auth-session`.

---

## Third-pass review (2026-09-17) — commit `4dac9fd` now present

Checked out `feature/auth-session` in the assigned worktree first and ran `git log --oneline -5` before anything else, per instructions: tip is `4dac9fd` `[C.NE][web] fix: add logout/logout-all buttons to logged-in view`, on top of `4076c05` — the expected commit is present this time (the prior repo/clone mismatch is resolved).

**Diff inspected (`git show 4dac9fd`):**
- `web/src/api/auth.ts`: adds `useLogout()` and `useLogoutAll()`, each `apiFetch<OkResponse>('/auth/logout'|'/auth/logout-all', { method: 'POST' })` (client's `BASE_URL = '/api'`, so these hit `POST /api/auth/logout` and `POST /api/auth/logout-all` — correct endpoints), with `onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] })` — invalidates the cached `/api/auth/me` state as required.
- `web/src/routes/DashboardPlaceholderPage.tsx`: adds `onLogout`/`onLogoutAll` handlers that call `.mutate(undefined, { onSuccess: () => navigate('/login') })` — redirects to `/login` on success, matching the spec. Renders a `variant="secondary"` "Log out" button and a `variant="outline"` "Log out of all devices" button, both `disabled` while their mutation is pending — matches `mock.html`'s `#session-view` (`.btn-secondary` "Log out" / `.btn-outline` "Log out of all devices") in label, order, and visual weight.

**Scope check:** `git diff --stat 4076c05 4dac9fd` shows only the two `web/` files above (43 insertions, 4 deletions) — no backend files touched, and `git diff 4076c05 4dac9fd -- server/` is empty, confirming the prior 3 commits (`0081f1f`, `6d50def`, `4076c05`) and all backend code are untouched.

**Build:** `cd web && npm run build` (`tsc --noEmit && vite build`) — passes clean, zero type errors, build succeeds (`dist/` emitted normally).

**Live end-to-end run:** not possible in this sandbox — `server/src/main.ts` hardcodes `app.listen(8080)` with no `PORT` env override, and port 8080 is already bound by another process in this environment (same constraint hit in the first pass). Did not fake a screenshot; relied on code inspection plus the clean build as evidence instead, per the fallback instruction.

### Overall verdict (third pass): **READY FOR PR**

The logout/logout-all defect flagged in passes 1 and 2 is now fixed correctly and completely: both buttons exist, call the correct endpoints, invalidate the `me` cache, and redirect to `/login`, matching `mock.html`'s logged-in panel. Backend checklist items 1–9 remain solid and untouched. Frontend build is clean. No new issues found. The only residual gap is that this fix was verified by code inspection + build rather than a live browser screenshot, due to the sandbox's port-8080 conflict — this is an environment limitation, not a defect in the change itself.
