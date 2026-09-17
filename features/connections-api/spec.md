## Scope
Build out `server/src/connections` (currently an empty module) into the widget-credential "connect" flow, per `docs/Architecture.md` §5.2 and §4:

- `ServiceConnection` CRUD: `GET /api/connections` (list the current user's connections + status), `DELETE /api/connections/{service}` (disconnect: deletes the row and revokes the token at the provider where the API allows it).
- Generic OAuth/OpenID **connect** flow reusing the `{provider}/start` and `{provider}/callback` routes added by `oauth-login`, now handling `intent=connect`: requires an existing session (bound via the signed, cookie-bound `state`), and on success upserts a `ServiceConnection` row for `(userId, service)` instead of logging in.
- `passport-steam` (Steam OpenID 2.0) strategy — connect-only, no login. Stores `externalAccountId` = SteamID64; no tokens to encrypt (the API key is server-side `STEAM_API_KEY`).
- Reuse `passport-github2` / `passport-google-oauth20` (added by `oauth-login`) for the `github` and `youtube` (Google) connect flows, requesting the widget scopes (`repo security_events` for github; `youtube.readonly` with `access_type=offline` for google) — a **separate** OAuth app registration/scope from the login flow per Architecture's "one callback per provider" note, but same callback route, dispatched by `state.intent`.
- Token encryption service: AES-256-GCM (`node:crypto`), key `TOKEN_ENC_KEY` (32 bytes, base64, from env), random 12-byte IV per value, stored as `iv:tag:ciphertext`. Used to encrypt `accessTokenEnc`/`refreshTokenEnc` before persisting; decryption only happens inside whatever later becomes `FetchContext` (built in `timer-realtime`), never serialized to the client.
- The client-facing connection shape is always `{ service, connected: boolean, status: 'OK' | 'REAUTH' }` — raw tokens never appear in any response.

## Non-goals
- The actual widget `fetch()` implementations that use these connections (weather/github/steam/youtube services) — later, out of this batch.
- Token refresh-on-401 logic for YouTube — needed by the real widget fetch code, not this feature; this feature only needs to store and retrieve tokens correctly. (A stub `refreshToken(service, connection)` interface point is fine to leave for that later work.)
- `oauth-login`'s login-only strategies/routes — this feature builds on top of them.

## Verification checklist
1. `GET /api/connections` (authenticated) returns all registry services with `connected`/`status` for the current user, `connected: false` for services with no row.
2. Completing a GitHub connect handshake (`intent=connect`) creates a `ServiceConnection` row with an AES-256-GCM-encrypted `accessTokenEnc` (verify the stored value round-trips through the encryption service back to the original token, and is not equal to the plaintext).
3. `GET /api/connections` after connecting shows `connected: true, status: 'OK'` for that service; the response body never contains `accessTokenEnc`/`refreshTokenEnc` in any form.
4. `DELETE /api/connections/github` removes the row; a subsequent `GET /api/connections` shows `connected: false`.
5. Completing a Steam OpenID connect handshake creates a `ServiceConnection` with `externalAccountId` set to the SteamID64 and no token fields populated.
6. Attempting a `connect` intent without an active session is rejected (no `ServiceConnection` created).
7. A `connect` callback with an invalid/expired/tampered `state` is rejected.
8. Connecting the same service twice for the same user upserts (unique `(userId, service)`) rather than creating a duplicate row.
9. Two different users connecting the same service (e.g. both GitHub) each get their own independently encrypted token rows.

## Constraints
- Depends on `oauth-login` for the shared `{provider}/start|callback` scaffolding and signed-`state` helper — extend, don't fork it.
- Do not implement `FetchContext` or any upstream API calls beyond the OAuth/OpenID token exchange itself.
- `mock.html`: a "Services" list (weather always-on, github/steam/youtube with Connect/Disconnect buttons and OK/Reauth/Not-connected badges), clicking Connect simulates a fake OAuth redirect+callback round trip and flips the badge — no real network calls.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/connections-api/mock.html` (connect/disconnect flow and badge states). Capture evidence via `chrome-headless-shell` into `features/connections-api/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/connections-api/spec.md
