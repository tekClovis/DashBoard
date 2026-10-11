# Verification: security (second pass)

**Verdict: PASS**

Both FAILs from the first pass are fixed in 8720809.

- **Build:** `npm run build -w server` exits 0 ([server-build.txt](server-build.txt)). The web build also passes ([web-build.txt](web-build.txt)). `docker compose up --build` now builds the image and boots the server, and all the live evidence below comes from that container.
- **NOT_CONNECTED UI:** the app now shows the mock's destructive alert, with the icon, the title "GitHub isn't connected", the add/edit context line and the "Connect GitHub" link, in both the Add and Configure dialogs.

I re-ran everything else and found no regressions.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Creating or updating a connection-auth widget without a connection returns 409 NOT_CONNECTED; with a connection it succeeds | PASS | [item1-dashboards.txt](item1-dashboards.txt) (49/49, including create/update 409 and the success cases). Live: [add-not-connected.png](add-not-connected.png), [edit-not-connected.png](edit-not-connected.png), [add-connected-success.png](add-connected-success.png) |
| 2 | Web: the NOT_CONNECTED error shows a Connect link to the right service | PASS | [item2-web-connect.txt](item2-web-connect.txt) (2/2; the test asserts the title, the context line and href `/api/oauth/github/start?intent=connect`). Live: same href read from the DOM in both dialogs. Matches the mock: [mock-add-not-connected.png](mock-add-not-connected.png) vs [add-not-connected.png](add-not-connected.png), and [mock-edit-not-connected.png](mock-edit-not-connected.png) vs [edit-not-connected.png](edit-not-connected.png) |
| 3 | The OAuth callback for a banned or deleted session user does not link and returns an error | PASS | [item3-oauth-guard.txt](item3-oauth-guard.txt) (67/67: banned/deleted on the link and connect callbacks; the start leg goes through resolveSessionUser) |
| 4 | Re-registering an unverified email keeps the old hash and resends the email; the response is identical for new, unverified and verified emails | PASS | [item4-5-auth-controller.txt](item4-5-auth-controller.txt) (32/32). Live: [live-register.txt](live-register.txt) (hash md5 unchanged across re-registration, mails 1 then 2, `{"ok":true}` 201 for new, unverified and verified, no mail sent for verified). UI: [register-verified-email.png](register-verified-email.png) |
| 5 | Login for an unknown email runs bcrypt.compare against a dummy hash | PASS | [item4-5-auth-controller.txt](item4-5-auth-controller.txt) |
| 6 | Session-user resolution rejects an unverified user | PASS | [item6-session-user.txt](item6-session-user.txt) |
| 7 | Demoting or banning the last active admin is refused; with 2 admins, concurrent demotes leave at least 1 (serializable) | PASS (weak) | [item7-admin.txt](item7-admin.txt). The last-admin refusal is covered for demote and for ban. Concurrency is only checked with mocks: the test asserts `isolationLevel: 'Serializable'` and that P2034 maps to 409. No test runs two demotes against real Postgres |
| 8 | A Steam callback with a missing or mismatched nonce, or a replayed response_nonce, is rejected | PASS | [item8-steam.txt](item8-steam.txt) (63/63: missing cookie, missing query nonce, mismatch, return_to nonce mismatch, unsigned response_nonce, replay with TTL) |
| 9 | Google disconnect calls revoke with the refresh token; connect stores expiresAt | PASS | [item9-google.txt](item9-google.txt) (33/33: revoke posts the refresh token; expiresAt is derived from `expires_in`; the verify wrapper keeps arity 5). The typecheck break is gone: [server-build.txt](server-build.txt) |
| 10 | `npm test` and oxlint pass; about.json is unchanged | PASS | [npm-test.txt](npm-test.txt) (server 822/822, web 329/329, exit 0), [lint.txt](lint.txt) (exit 0; warnings only, no errors), [about-unchanged.txt](about-unchanged.txt) (no diff vs main in `server/src/catalog` or `server/src/services`; live `/about.json` services listed) |

## Notes

- **Account pre-hijacking (security finding). It is real, but the spec requires this behaviour, so it is not a contract FAIL and the fix needs a spec change.** The sequence: an attacker registers `victim@x` with their own password. The real owner registers later. The password is kept, as item 4 requires, and only the confirmation is resent. The owner clicks the link, which verifies the account, and the account now accepts the attacker's password and rejects the owner's. I reproduced this live again: [live-prehijack.txt](live-prehijack.txt) (owner's password 401, first registrant's password 200 after confirmation). Possible spec changes:
  - clear or rotate the password at confirmation;
  - make confirmation require setting a password;
  - drop the stored password and bump tokenVersion when someone re-registers an unverified row.
- **e2e (testcontainers): 140/143 pass** ([e2e.txt](e2e.txt)). The same 3 `connections.e2e-spec.ts` failures as in the first pass. They come from boot-and-timer's `configured` field, which the expectations were never updated for. This file was edited on the branch, but the failures were not fixed. This is not a checklist item.
- How I reached NOT_CONNECTED live: the picker disables widgets the user has no connection for. So I inserted a GitHub `ServiceConnection` row, opened the dialog, deleted the row, then submitted. This simulates a disconnect in another tab. The success screenshot was taken after restoring the row. The widget shows "access expired" because the token is fake, which is expected.
- `live-register.txt`: the seeded admin was not present, so the first "verified" attempt hit the per-IP register rate limit (429). I cleared the rate-limit key and repeated the verified case with grace@example.com after confirming it.
- Register "Check your email" copy differs slightly from the mock: "we sent" vs "we've sent", and the existing "Send a new link" button instead of the mock's "Back". This is cosmetic and does not change the generic response.
- Register timing: a new email pays for a bcrypt hash and an existing one does not, so timing still reveals which emails exist. This is outside the checklist.
- Google re-consent without a new refresh token overwrites `refreshTokenEnc` with null, so revoke falls back to the access token. This existed before the branch.
- `passport-steam` / `@types/passport-steam` are still in package.json but are unused.

## Screenshots

App, Add widget, NOT_CONNECTED:
![add-not-connected](https://github.com/tekClovis/dashBoard/blob/feature/security/features/security/verification/add-not-connected.png?raw=true)

Mock, Add widget, NOT_CONNECTED:
![mock-add-not-connected](https://github.com/tekClovis/dashBoard/blob/feature/security/features/security/verification/mock-add-not-connected.png?raw=true)

App, Configure widget, NOT_CONNECTED:
![edit-not-connected](https://github.com/tekClovis/dashBoard/blob/feature/security/features/security/verification/edit-not-connected.png?raw=true)

Mock, Configure widget, NOT_CONNECTED:
![mock-edit-not-connected](https://github.com/tekClovis/dashBoard/blob/feature/security/features/security/verification/mock-edit-not-connected.png?raw=true)

App, Add widget with a connection (success):
![add-connected-success](https://github.com/tekClovis/dashBoard/blob/feature/security/features/security/verification/add-connected-success.png?raw=true)

App, register with an already-verified email (generic response):
![register-verified-email](https://github.com/tekClovis/dashBoard/blob/feature/security/features/security/verification/register-verified-email.png?raw=true)

Mock, register sent:
![mock-register-sent](https://github.com/tekClovis/dashBoard/blob/feature/security/features/security/verification/mock-register-sent.png?raw=true)
