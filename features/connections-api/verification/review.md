# connections-api — independent verification

Branch reviewed: `feature/connections-api` (checked out, not modified), diffed against `main`.
Commit: `cbb1c3b` "[C.NE][*] feat: implement connections-api (OAuth/OpenID connect + encrypted ServiceConnection CRUD)".

## Test suite (run, not trusted)

- `npm test -w server` (vitest, unit): **39/39 passed**, 6 files. Matches claim.
- `npm run test:e2e -w server` (vitest + testcontainers, real Postgres): **12/12 passed**.
- `npm run build` (shared → web → server, tsc + vite + nest build): clean.
- `npm run lint -w server` (`oxlint --type-aware`): clean, exit 0.
- e2e tests (`server/test/connections.e2e-spec.ts`) are genuine: real Prisma/Postgres round trips, real `TokenCipherService.decrypt` calls against stored ciphertext, real signed-state generation/verification through actual HTTP requests via supertest. Only the outbound provider calls (GitHub token/profile fetch, Steam's `verifyAssertion`) are stubbed at the strategy boundary — the same boundary `oauth-login`'s review used. Not superficial happy-path-only tests: includes tampered-state, missing-CSRF-cookie, two-user-isolation, and upsert-dedup cases.

## 9-item checklist verdict

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | GET /connections lists registry services, `connected:false` for no row | PASS | `connections.service.ts` `list()` selects only `{service,status}`, maps `CONNECTABLE_SERVICES`; e2e `returns all registry services...` test confirms exact body. |
| 2 | GitHub connect creates AES-256-GCM row, round-trips, ciphertext ≠ plaintext | PASS | `token-cipher.service.ts` uses `aes-256-gcm`, random 12-byte IV per call (verified fresh IV each call — test `first !== second` passes); e2e confirms `row.accessTokenEnc !== 'real-github-access-token'` and `cipher.decrypt(...) === 'real-github-access-token'`. |
| 3 | GET /connections after connect shows `connected:true,status:'OK'`; response never contains raw/encrypted token in any form | PASS | Checked the DTO (`shared/src/dto.ts` `ConnectionEntry`) and the Prisma `select` in `list()` — only `service`/`status` ever leave the DB layer; no serializer/interceptor elsewhere touches `ServiceConnection`. e2e asserts `JSON.stringify(body)` contains neither `accessTokenEnc` nor the raw token. |
| 4 | DELETE removes row, subsequent GET shows `connected:false` | PASS | `disconnect()` → `deleteMany({where:{userId,service}})`; e2e confirms. |
| 5 | Steam connect creates row with SteamID64, no token fields | PASS | `upsertSteamConnection` sets `accessTokenEnc/refreshTokenEnc: null`; e2e confirms both null. |
| 6 | No session → connect rejected, no row created | PASS | `start()` calls `session.requireUserId(req)` (throws 401) before any state is even signed; `callback()` never runs without a verified state that could only have been minted after that check. e2e: unauthenticated `start` → 401, 0 rows. |
| 7 | Invalid/expired/tampered state → rejected | PASS | `verifyConnectState` checks HMAC (timing-safe), expiry (`Date.now() > exp`), provider match, and CSRF-cookie hash binding — traced all four checks; unit tests (`oauth-state.spec.ts`) hit each branch including expiry via fake timers; e2e hits tampered-signature and missing-CSRF-cookie paths against the real HTTP endpoint. |
| 8 | Same-service reconnect upserts, not duplicates | PASS | DB-level `@@unique([userId, service])` (pre-existing in `schema.prisma`, confirmed unchanged) backs `prisma.serviceConnection.upsert`, which Postgres/Prisma compiles to an atomic `INSERT ... ON CONFLICT DO UPDATE` — no read-then-write race window. e2e connects twice, confirms 1 row with the second token. |
| 9 | Two users connecting same service get independent encryption | PASS | Per-value random IV (test above) plus per-row storage keyed by `(userId,service)`; e2e connects two real users, decrypts each independently, confirms `rowA.accessTokenEnc !== rowB.accessTokenEnc`. |

## Account-takeover-class scrutiny (the specific ask)

Traced every path that creates/mutates a `ServiceConnection` for a client-supplied identifier instead of a verified one:
- `userId` is **only** ever taken from `SessionService.requireUserId(req)` (at `start`) or from the HMAC-verified `state.userId` (at `callback`) — grepped all of `server/src/connections/*.ts`, no code path accepts `req.body`/`req.query`/`req.params` userId.
- Steam's cookie-carried state: both the signed `oauth_state` cookie and the `oauth_csrf` cookie are set `httpOnly`, scoped to `/api/oauth`, on the `start` response — only the browser that performed `start` (and is therefore the session that was authenticated then) can present them back at `callback`. An attacker cannot inject their own state into a victim's browser without already controlling it (no cross-origin cookie-write vector present). Confirmed: `callback` does not accept `state` from the query string for Steam at all, only the cookie.
- Steam assertion is verified by the real `passport-steam` → `@passport-next/passport-openid` library (`_relyingParty.verifyAssertion`), which performs genuine OpenID association/signature verification against Steam's OP; only this call is stubbed in tests (label makes that explicit), not bypassed in production code.
- Conclusion: **this branch does not repeat `oauth-login`'s account-takeover bug.** userId binding is sound throughout.

## Encryption key handling

- `TOKEN_ENC_KEY` is validated at boot in `server/src/core/config/env.validation.ts` (pre-existing file, unchanged by this branch): decoded from base64, `throw` if not exactly 32 bytes. Wired via `ConfigModule.forRoot({ validate })` in `app.module.ts`.
- `TokenCipherService` uses `config.getOrThrow` — no default/fallback value, no silent plaintext path anywhere in `encrypt`/`decrypt`.

## Additional defects found (beyond the 9 items)

1. **Disconnect revocation uses the wrong app's credentials for GitHub, and is completely untested.** `server/src/connections/provider-revoke.ts` revokes with `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (the *login* app), but `github-connect.strategy.ts` mints the token under `GITHUB_CONNECT_CLIENT_ID`/`GITHUB_CONNECT_CLIENT_SECRET` (falling back to the login ones only if unset). GitHub's revoke endpoint (`DELETE /applications/{client_id}/grant`) requires the *same* app that issued the token. If the "separate OAuth app" the spec explicitly calls for (`docs/Architecture.md`, and the strategy file's own comment: "a **separate** OAuth app registration/scope from the login flow") is ever actually configured, revocation will silently fail (swallowed by an empty `catch`) while `DELETE /api/connections/github` still returns `{ok:true}` and deletes the local row — the token stays live at GitHub indefinitely after a user believes they've disconnected. There is no `provider-revoke.spec.ts` in the 39 unit tests; this file has zero test coverage, so the gap is invisible to the claimed test counts.
2. **The "separate OAuth app" constraint is currently unreachable.** `GITHUB_CONNECT_CLIENT_ID`/`_SECRET` and `GOOGLE_CONNECT_CLIENT_ID`/`_SECRET` are referenced in the connect strategies but never declared in `env.validation.ts` nor documented in `.env.example` (both unchanged by this branch). In the only supported deployment configuration, connect and login silently share one OAuth app's credentials, which contradicts the architecture note both the spec and the strategy files themselves cite.

Neither of these is an exploitable-by-an-external-attacker bug (no client-controlled input reaches them); they are correctness/spec-compliance gaps in provider-side token revocation.

## UI check

`web/src/routes/ConnectionsPage.tsx` matches `mock.html`'s states: weather "always on" badge (no button), not-connected badge + primary "Connect" button, connected badge (OK green / REAUTH amber) + "Disconnect" button, loading state. `web/src/api/connections.ts`'s `startConnect` does a full-page redirect to `/api/oauth/{provider}/start?intent=connect` (mapping `youtube`→`google`), matching the real backend route. `npm run build` (includes `tsc --noEmit` for web) passed clean. Did not attempt a live browser/playwright check — no dev docker stack (Postgres/Redis/mailpit) was started for a full run, and standing one up plus real OAuth app credentials was out of scope for the time available; this is a code-inspection-only verdict for the UI, not a live-rendered one.

## Overall verdict: **READY FOR PR**, with two non-blocking defects to fix before merge

All 9 spec checklist items pass on independent re-verification (code trace + real test execution), and the specific account-takeover vulnerability class from `oauth-login` is **not** present here — userId binding is done correctly and consistently. The two additional defects (GitHub revoke credential mismatch + unreachable "separate app" config, both in `provider-revoke.ts`/env plumbing, both untested) do not block the checklist but should be fixed: either declare and wire `GITHUB_CONNECT_CLIENT_ID/SECRET` end-to-end (env schema + `.env.example` + `provider-revoke.ts`), or drop the "separate app" language from the connect strategies' comments until it's actually implemented — and add a `provider-revoke.spec.ts`.
