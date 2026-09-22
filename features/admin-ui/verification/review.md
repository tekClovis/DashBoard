# admin-ui review 2 (fresh reviewer) — verdict: PASS

## Automated
- lint (warnings only, pre-existing), server unit 121/121, web 29/29, web build, tsc web + server: PASS
- server e2e x5: 74/74 x4; one run had `auth-session` test 8 (seeded admin login) fail once (unchanged test, not admin/timer; log shows `getaddrinfo EAI_AGAIN mailpit` noise in every run). Flake not attributable to this branch; timer-realtime test 7 did not fail in 5 runs.

## Server (adversarial e2e against real Postgres, temp spec, removed)
- Self-guard vs spellings: uppercase, mixed case, trailing `/`, `other/../self` -> 403 (PATCH+DELETE). braces, urn:, whitespace, trailing junk, no-hyphen -> 400. PASS
- Two-field PATCH (role USER + bannedAt null / role ADMIN + ban / role USER + ban) on self -> 403, admin row untouched (role, bannedAt, tv=0). PASS
- Ban/role change bump tokenVersion, old cookie 401, live socket disconnected, delete cascades: covered by admin.e2e items 2,4,6, passing. PASS
- GET validation: page 0/-1/1.5/abc, pageSize 0/101, unknown/array q -> 400; pageSize 100, huge page -> 200; q len 200 ok, 201 -> 400; empty q lists all; q `\`, `x\y`, `x\`, `%`, `_` literal. PASS
- Login ACCOUNT_BANNED 403 after password + email-confirm check (no ban disclosure without credentials), no cookie; unit test present. PASS
- OAuth callback banned -> redirect /login?error=ACCOUNT_BANNED, no cookie; only on login branch (link/connect require a live session so banned users can't reach them); existing oauth e2e/unit pass. PASS (no dedicated test: non-blocking)

## Web (real Chrome, mocked stateful API, review2-harness.cjs; screenshots review2-*.png)
Non-admin 403 and no list request; columns; 20 rows/page, 3 pages; self row 3 buttons disabled; rapid search stale response not overwriting; search resets to page 1; Ban/Unban/Promote/Demote; delete cancel (no request)/confirm; failed mutation alert; two quick mutations rendered==server; clamp to page 2 after deleting last row of last page. All PASS (0 failures).

## Non-blocking notes
1. Login page (web/src/routes/LoginPage.tsx:21,60) ignores `error=ACCOUNT_BANNED` from OAuth redirect (silent) and shows "Invalid email or password." for a password-login 403 ACCOUNT_BANNED. Spec doesn't require messaging.
2. Last-admin lockout race (two admins demoting each other) not covered by spec; observed one request got 401 due to tv bump, but no invariant enforced.
3. AdminPage.tsx: mutate-level callbacks fire only for the latest mutation, so an error from an earlier overlapping mutation may not show an alert (table still refetches to server state).
4. `page` has no upper bound (200 empty result); harmless.
