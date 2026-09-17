## Scope
Add local login and session management to the existing NestJS auth module (`server/src/auth`), which already has register/confirm/resend:

- `POST /api/auth/login` — Passport `local` strategy against email+bcrypt password hash. 403 `EMAIL_NOT_CONFIRMED` if `emailVerifiedAt` is null. Generic 401 on bad credentials (no user-enumeration).
- On successful login, sign a JWT (`sub`, `role`, `tv` = `tokenVersion`), 7-day expiry, `JWT_SECRET`. Set it as an httpOnly, `SameSite=Lax`, `Path=/` cookie, plus `Secure` when `APP_URL` is https.
- `JwtGuard` — verifies the cookie's JWT signature, loads the user, rejects (401) if `bannedAt` is set or `tv !== user.tokenVersion`.
- `GET /api/auth/me` (protected) — returns the current user (id, email, role, emailVerifiedAt) plus linked `AuthIdentity` providers.
- `POST /api/auth/logout` (protected) — clears the session cookie.
- `POST /api/auth/logout-all` (protected) — clears the cookie and increments `tokenVersion`, invalidating every previously issued JWT for that user.
- Admin boot-seed: on Nest app bootstrap, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are both set in env and no `User` with `role = ADMIN` exists, create one with `emailVerifiedAt` set (pre-confirmed) and `role = ADMIN`.

Reference: `docs/Architecture.md` §5.1 (Authentication) and §5.3 (Roles and admin — boot-seed paragraph only; the rest of admin, e.g. `RolesGuard`/`/api/admin/*`, is a separate feature).

## Non-goals
- GitHub/Google OAuth login (separate `oauth-login` feature).
- Admin panel UI or `/api/admin/*` endpoints beyond the boot-seed (separate `admin-ui` feature).
- Dashboards, catalog, timer (separate features).
- Any frontend work beyond wiring the existing `LoginPage.tsx` to call the new endpoint and the auth route guard reading `/api/auth/me`.

## Verification checklist
1. `POST /api/auth/login` with a verified user's correct email+password returns 200, sets an httpOnly `Set-Cookie` header, and the response body contains no password hash or raw token.
2. `POST /api/auth/login` with a wrong password, and separately with an unknown email, both return the same generic 401 body (no enumeration signal).
3. `POST /api/auth/login` with correct credentials for an unverified user returns 403 with code `EMAIL_NOT_CONFIRMED`.
4. `GET /api/auth/me` with the cookie from step 1 returns 200 with the user's id/email/role; called with no cookie (or a garbage cookie) returns 401.
5. `POST /api/auth/logout` clears the cookie (Set-Cookie with past expiry / empty value); a subsequent `GET /api/auth/me` with the old cookie value returns 401.
6. `POST /api/auth/logout-all` invalidates a second, still-unexpired JWT issued earlier for the same user (simulate by logging in twice and hitting `/me` with the first cookie after calling `logout-all` via the second session) — returns 401.
7. Manually setting a test user's `bannedAt` and calling `GET /api/auth/me` with that user's still-valid cookie returns 401.
8. With `ADMIN_EMAIL`/`ADMIN_PASSWORD` set in the server's env and no existing admin, starting the server creates a `User` with `role = ADMIN` and `emailVerifiedAt` set, and `POST /api/auth/login` with those credentials succeeds immediately (no confirmation step needed).
9. Existing register/confirm/resend endpoints and their tests still pass unmodified.

## Constraints
- Do not touch `server/src/auth/verification.service.ts`'s register/confirm/resend behavior beyond wiring cookies/guard around it.
- Do not build `server/src/admin` module logic — only the boot-seed, which may live in `auth` (e.g. an `onApplicationBootstrap` hook) or a minimal seed step in `core`.
- No UI redesign — the existing `LoginPage.tsx` form just needs to call the real endpoint instead of being a shell; `mock.html` only needs to show the login form and a simple "logged in as ..." state gated on `/api/auth/me`, not a full dashboard.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/auth-session/mock.html` (the built login flow must match the prototype's states: logged-out form, bad-credentials error, unconfirmed error, logged-in panel with logout/logout-all). Capture evidence via `chrome-headless-shell` into `features/auth-session/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/auth-session/spec.md
