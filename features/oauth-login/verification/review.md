# oauth-login — verification review

Branch: `feature/oauth-login` (checked out as-is, not modified). Reviewed by independent inspection + running the actual test suites (npm test, npm run test:e2e with real testcontainers Postgres/Redis), not by trusting the builder's report.

## Test suite verification
- `npm test` (unit): **51/51 passed** — matches claim. Genuine (real HMAC round-trips with fake timers for expiry in `oauth-state.spec.ts`; mocked prisma only at the boundary in service/controller specs, which is appropriate for unit tests).
- `npm run test:e2e`: **15/15 passed** — matches claim. Genuine: real Postgres via testcontainers, real signed `state` extracted from actual `Set-Cookie`/redirect Location headers and replayed, real DB assertions (`prisma.user.count()`, `prisma.authIdentity.findFirst()`). Not tautological — only the outbound HTTP call to GitHub/Google's token/profile endpoints is stubbed (`_oauth2.getOAuthAccessToken` / `userProfile`), which is the correct boundary to mock.
- `oxlint --type-aware`: clean.
- `server` build: prisma generate clean. `web`: `tsc --noEmit` and `vite build` clean **once `@dashboard/shared` is rebuilt** (its `dist/` was stale for the new `LinkIdentityRequest`/`hasPassword` exports — a workspace build-order issue, not a code defect).
- Live browser check: **not performed**. Docker is available and the e2e DB stack works, but exercising the UI live would need real GitHub/Google OAuth client credentials (the login buttons redirect to the real provider), which aren't available in this environment. Verified via code inspection against `mock.html` instead — no screenshots faked.

## Checklist verdict

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | `start` redirects with client_id/scope/signed state | PASS | e2e test asserts `location` origin+path, `client_id=test-github-client-id`, `scope` contains `user:email`, `state` present and bound to `oauth_state` cookie. |
| 2 | Existing identity → login, no dup | PASS | `oauth-login.service.ts` step 1 checks `(provider,providerUserId)` unique lookup first; e2e test confirms `user.count()===1`, `authIdentity.count()===1`. |
| 3 | Verified email + confirmed local user → auto-link | PASS | Code checks `profile.emailVerified && existingUser.emailVerifiedAt`; e2e test confirms identity created, no new user row. |
| 4 | Unconfirmed local user → refused, no mutation | PASS | `OAuthLinkRefusedError` thrown, controller redirects to `/login?error=EMAIL_LINK_REQUIRED`; e2e test confirms no session cookie and `authIdentity.count()===0`. |
| 5 | No match → new verified user+identity | PASS | `tx.user.create` with `emailVerifiedAt: new Date()`; e2e confirms both rows. |
| 6 | Same behaviors for Google | PASS | e2e uses `describe.each` over github/google fixtures covering 2–5 identically. |
| 7 | Invalid/expired state rejected | PASS | `oauth.guard.ts` calls `assertBoundState` before passport `canActivate`; `oauth-state.spec.ts` unit-tests tamper/wrong-secret/malformed/expired (fake timers, +11min) cases; e2e tests cover mismatched/missing cookie → 401, zero user creation. |
| 8 | Authenticated link (given a *valid completed OAuth handshake*) + unlink with another method left | **FAIL** | See "New defect" below — the link endpoint never verifies a handshake occurred. |
| 9 | Reject unlinking the sole remaining login method | PASS | `identities.controller.ts` `unlink()`: `loginMethodCount = identities.length + (passwordHash?1:0)` computed **before** deletion; `<=1` correctly means removing the target leaves zero methods. Verified by e2e + unit tests, and by hand-tracing the off-by-one risk (there isn't one — count includes the target being removed, so the threshold is right). |

## New defect found (checklist item 8, real bug — not just "scoped out")

`identities.controller.ts::link()` accepts an arbitrary client-supplied `providerUserId` string and creates an `AuthIdentity` for the *current* authenticated user with zero proof they own that provider account — no token exchange, no call to GitHub/Google. `ProfilePage.tsx::handleLink()` confirms the frontend never even attempts one: it fabricates `mock-${provider}-${Date.now()}` and POSTs that directly.

This is an **account-takeover vector**, not a benign scope reduction:
1. Provider user IDs are frequently public/enumerable (e.g. GitHub numeric IDs via `GET /users/{login}`).
2. Attacker, authenticated as themselves, POSTs `{"providerUserId": "<victim's real GitHub id>"}` to `/api/auth/identities/github`. Nothing stops this — the only guard is "is this id already claimed by someone else," and the victim hasn't linked GitHub yet.
3. When the victim later does a real GitHub OAuth login, `OAuthLoginService.loginOrLink()`'s first branch (checklist item 2) matches `(provider, providerUserId)` and returns the **attacker's** `User` row — the victim is logged into the attacker's account.

The spec's item 8 explicitly says "given a valid completed OAuth handshake," which is the safeguard that's missing — the builder's framing of this as "correctly out of scope" doesn't hold; it's a missing server-side verification, not a UI/flow scope call. Fix requires the link endpoint to consume a short-lived, server-verified token from a real OAuth handshake (reusing the same `oauth.guard.ts`/`oauth-state.ts` machinery with `intent=connect`, or equivalent) instead of trusting a client-supplied id.

## Reconciliation claim (cookie-parser / JWT/session duplication)
Checked: `cookie-parser` is registered exactly once in `server/src/main.ts` (plus once, appropriately, in the e2e test's standalone app bootstrap). No duplicate registration bug in this branch. `session-cookie.ts`/`jwt.guard.ts` are self-contained, clearly commented as a temporary duplicate of `auth-session`'s unmerged work, consistent with the flagged/acceptable gap described by the builder — not a bug.

## UI check (LoginPage/ProfilePage vs mock.html)
- `LoginPage.tsx`: GitHub/Google buttons present (real `<a href>` to `/api/oauth/{provider}/start`), error banner on `?error=EMAIL_LINK_REQUIRED` matches mock's `#err-link` copy. Matches mock's login-card intent.
- `ProfilePage.tsx`: password badge (`me.hasPassword`), GitHub/Google rows with linked/not-linked + Link/Unlink toggle, toast on `LAST_LOGIN_METHOD` error — structurally matches mock's profile-card. However the "Link" action is fake end-to-end (see defect above), so functionally it doesn't match the mock's *intent* (mock explicitly simulates scenarios; shipped code doesn't do a real link at all).

## Overall verdict: **NOT READY**

One checklist item (8) fails on a genuine, exploitable account-linking defect (cross-account identity hijack via unauthenticated-handshake linking), not a scope trade-off. Everything else (items 1–7, 9; tests; lint/build) verified independently and holds up.

## Second-pass review (commit `17773b8`)

Branch re-checked out at `17773b8 [C.NE][server] fix: require completed OAuth handshake to link identity` (confirmed tip via `git log --oneline -3`), read via `git show 17773b8` in full.

**Fix verification:**
- Old vulnerable `POST /api/auth/identities/:provider` is fully removed, not deprecated: the `@Post` handler, `LinkIdentityDto`, and `LinkIdentityRequest` shared type are all deleted. `identities.controller.ts` now only exposes `DELETE :provider` (unlink). Confirmed only one `IdentitiesController` registration (`auth.module.ts`) and grepped the whole `server/src`, `web/src`, `shared/src` for `providerUserId` — the only writer of that field anywhere is `OAuthLoginService`, sourced from `NormalizedOAuthProfile` (populated by the passport GitHub/Google strategies from the real provider response). No other client-facing path accepts a caller-supplied provider id.
- `link`-intent state is bound to the authenticated user's id at the `start` leg (`oauth.guard.ts::buildStartOptions` → `requireLinkSessionUserId`, throws 401 without a valid session cookie), then HMAC-signed into the opaque `state` (`oauth-state.ts`). The callback (`oauth.controller.ts::handleCallback`) reads `state.userId` from the guard-verified `req.oauthState` — never from request body/query — and passes it straight to `linkIdentity(userId, profile)`. Tamper test in `oauth-state.spec.ts` ("rejects a tampered link-intent state (e.g. swapped userId)") confirms a forged `userId` in the payload fails signature verification. `assertBoundState` also requires exact cookie/query state match (CSRF binding), unchanged from the existing login flow's proven mechanism.
- Conflict case: `OAuthLoginService.linkIdentity` looks up `(provider, providerUserId)`; if claimed by a different user it throws `OAuthIdentityConflictError` (controller redirects to `/profile?error=IDENTITY_ALREADY_LINKED`) without ever calling `create`. Backed by a DB-level unique constraint on `(provider, providerUserId)`, so even a hypothetical TOCTOU race fails atomically rather than double-writing. New e2e test explicitly asserts the victim's original `AuthIdentity` row is untouched (`userId: victim.id`) after the attacker's attempt.
- Reconstructed the original exploit against current code: POSTing `{"providerUserId": "victims-real-github-id"}` to `/api/auth/identities/github` now 404s (route doesn't exist) — verified by the new e2e test and by the route table (only `DELETE`). There is no remaining path to link an identity without passing through the real OAuth handshake.

**Tests run directly (not trusted from claims):**
- `npm test` (server unit): **52/52 passed**.
- `npm run test:e2e` (real Postgres via testcontainers): **18/18 passed**.
- `oxlint --type-aware`: clean.
- `npm run build -w web` (`tsc --noEmit && vite build`): clean.
- New/changed test bodies read in full: `oauth-state.spec.ts`'s link round-trip + tamper test, `oauth-login.service.spec.ts`'s three `linkIdentity` cases (create/idempotent/conflict), and the three new e2e cases (dead-route 404, unauthenticated start → 401, conflict leaves victim's row intact) are genuine assertions against real signed tokens / real DB state, not tautological mocks-testing-mocks.
- Diff scope: `git diff 5581906 17773b8 --stat` touches only the 13 files listed in the commit — no changes to registration/verification/password-login code, so checklist items 1–7 and 9 stand as previously verified.

**New issues found:** none. No regressions, no residual client-supplied-id path, no way to bypass the session-bound state.

**Verdict: READY FOR PR.**
