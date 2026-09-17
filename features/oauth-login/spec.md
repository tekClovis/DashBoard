## Scope
Add GitHub and Google OAuth **login** (not the widget-scope "connect" flow — that's `connections-api`) to `server/src/auth`, per `docs/Architecture.md` §5.1:

- `passport-github2` strategy, scopes `read:user user:email`.
- `passport-google-oauth20` strategy, scopes `openid email profile`.
- Shared route shape: `GET /api/oauth/{provider}/start?intent=login`, `GET /api/oauth/{provider}/callback`. (The `connect` intent and its handling belong to `connections-api`, but this feature must leave the route/controller structured so that feature can add `intent=connect` without reworking it — a `state` param carrying `{ intent, provider }`, HMAC-signed, 10-minute expiry, bound to a short-lived cookie, per Architecture §5.2.)
- Account-linking rules (Architecture §5.1, "Account linking"):
  1. If an `AuthIdentity` row matches `(provider, providerUserId)`, log that user in.
  2. Else if a `User` with the same email exists: auto-link (create the `AuthIdentity`, log in) only if the provider reports the email verified **and** the existing local user's `emailVerifiedAt` is set. Otherwise refuse with a clear error telling the user to log in with password first and link from Profile.
  3. Else create a new `User` (marked verified immediately, since the provider verified the email) and its `AuthIdentity`, then log in.
- On successful login (any branch), issue the same session cookie as `auth-session`'s local login (reuse its JWT-signing code — depends on `auth-session` being built first).
- Authenticated `POST /api/auth/identities/{provider}` (link) and `DELETE /api/auth/identities/{provider}` (unlink) for a logged-in user, with the rule that the last remaining login method (last `AuthIdentity` when there's no `passwordHash`, or vice versa) cannot be unlinked.

## Non-goals
- The widget-scope "connect" flow (Steam/GitHub/YouTube `ServiceConnection` creation) — `connections-api`.
- Profile page UI beyond what's needed to click through link/unlink in the mock — full Profile page is `frontend-shell`.
- Local email/password login itself — `auth-session`.

## Verification checklist
1. `GET /api/oauth/github/start?intent=login` redirects to GitHub's authorize URL with the correct `client_id`, scopes, and a signed `state` param.
2. Completing the GitHub callback for a `providerUserId` that already has an `AuthIdentity` logs that exact user in (sets the session cookie) without creating a duplicate `User` or `AuthIdentity`.
3. Completing the callback with a new `providerUserId` whose verified provider email matches an existing confirmed local `User` auto-links: creates the `AuthIdentity`, no new `User` row, and logs in.
4. Same as (3) but the local `User` is unconfirmed (or the provider reports the email unverified): login is refused with a message directing the user to log in with password and link from Profile; no `AuthIdentity` is created.
5. Completing the callback with a `providerUserId`/email combination matching no existing `User` creates a new verified `User` + `AuthIdentity` and logs in.
6. The same three behaviors (2)-(5) hold for the Google strategy.
7. An invalid or expired `state` value on the callback is rejected (no login, no user/identity mutation).
8. A logged-in user can `POST /api/auth/identities/github` to link a second provider to their account (given a valid completed OAuth handshake), and can `DELETE /api/auth/identities/github` to unlink it, as long as they have another login method left.
9. Attempting to unlink the only remaining login method (e.g. the sole `AuthIdentity` on a user with no `passwordHash`) is rejected with a clear error.

## Constraints
- Depends on `auth-session` for the session-cookie-issuing helper — coordinate/merge rather than duplicating JWT-signing code.
- Do not implement the `connect` intent handling itself; only leave the `state`/route shape open for it.
- `mock.html` only needs "Continue with GitHub" / "Continue with Google" buttons wired to fake provider responses (new user, existing linked user, email-conflict-unverified, email-conflict-verified) and a small "Linked accounts" list with link/unlink buttons — no real OAuth redirect.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/oauth-login/mock.html` (must match its scenario dropdown's flows and the linked-accounts panel's states). Capture evidence via `chrome-headless-shell` into `features/oauth-login/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/oauth-login/spec.md
