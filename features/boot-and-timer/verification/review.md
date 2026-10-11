# Review: boot-and-timer (second pass)

**Verdict: PASS.** The first pass failed item 3 because the Profile page's **Link** buttons stayed enabled when OAuth was not configured. Commit `6f72de8` fixes this. With a provider unconfigured, its Link button is now disabled and shows a "not configured" hint. With the provider configured, the button is enabled. When one provider is configured and the other is not, each row follows its own flag. No other item regressed.

Reviewed `feature/boot-and-timer` at `6f72de8`, which adds 4 commits on top of `prod-smtp` (`ec5a269`). `6f72de8` only touches `web/src/routes/ProfilePage.tsx` and its spec. All evidence was regenerated for this pass. The live checks used a fresh `git clone` of the branch with no `.env`, run with `docker compose` (project `bootreview2`). The stack was torn down afterwards (`down -v --rmi local`) and the browser was closed.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Fresh clone, no .env: build + up boots; GET :8080/about.json returns 200 with valid JSON | PASS | [boot-fresh-clone.txt](boot-fresh-clone.txt) |
| 2 | JWT_SECRET/TOKEN_ENC_KEY unset: server starts and logs a warning; sessions and token encryption work in that run | PASS | [secrets-unset-live.txt](secrets-unset-live.txt): 2 WARN lines, then register, confirm (via Mailpit), login and `/api/auth/me` 200 (401 without the cookie). It ends with an AES-GCM round-trip using the generated key. [oauth-empty-live.txt](oauth-empty-live.txt) covers the empty-string variant. |
| 3 | OAuth ids empty: server starts; the matching login and Connect buttons are disabled with a "not configured" hint; enabled when set (plus every mock state) | PASS | Boot: [oauth-empty-live.txt](oauth-empty-live.txt). Unconfigured: [login-unconfigured.png](login-unconfigured.png), [services-unconfigured.png](services-unconfigured.png), [profile-unconfigured.png](profile-unconfigured.png) (both Link buttons `disabled`, each with a "not configured" hint). Configured: [login-configured.png](login-configured.png), [services-configured.png](services-configured.png), [profile-configured.png](profile-configured.png) (both Link buttons enabled). Mixed, GitHub on and Google off: [login-mixed.png](login-mixed.png), [services-mixed.png](services-mixed.png), [profile-mixed.png](profile-mixed.png). Mock references: [mock-login-unconfigured.png](mock-login-unconfigured.png), [mock-services-unconfigured.png](mock-services-unconfigured.png), [mock-profile-unconfigured.png](mock-profile-unconfigured.png). New unit test in `ProfilePage.spec.tsx`, run as part of [npm-test.txt](npm-test.txt). |
| 4 | Fake widgets absent from /about.json and the catalog unless ENABLE_FAKE_WIDGETS=true | PASS | [fake-widgets-live.txt](fake-widgets-live.txt): with the flag on, `fake` and `fake-connected` are present. With the flag unset, they are absent in both production and development. `fake-widgets.spec.ts` in [unit-timer.txt](unit-timer.txt) also covers this. |
| 5 | Spec: two instances of one widget, different params, different data at the same tick | PASS | [unit-timer.txt](unit-timer.txt): `gives two instances of one widget their own params at the same tick` |
| 6 | Spec: editing refreshRate and params changes the interval and the next fetch's params, without a restart | PASS | [unit-timer.txt](unit-timer.txt): `instance.updated applies new params and refreshRate to the live entry without a restart` |
| 7 | Spec: deleting stops the timer and sockets leave `instance:<id>`; a tick already scheduled for the old entry does nothing | PASS | [unit-timer.txt](unit-timer.txt): `instance.deleted deactivates the entry and makes every socket leave its room`, `a fetch already in flight when the instance is deleted emits nothing`, `a fetch in flight for the old entry is dropped after reconfigure, even if the id is active again` |
| 8 | Spec: fetchedAt on a cache hit equals the original fetch time | PASS | [unit-timer.txt](unit-timer.txt): `reports the original fetch time, not now, on a cache hit`, `emits the fetch result's fetchedAt, not the emit time` |
| 9 | `npm test` and oxlint pass; about.json stays valid (type ∈ {integer,string}) | PASS | [npm-test.txt](npm-test.txt): server 781/781, web 327/327. [lint.txt](lint.txt): exit 0, warnings only. The type check is in [boot-fresh-clone.txt](boot-fresh-clone.txt). |

## Notes (not contract misses)

- **Profile fix behaviour:** a provider that is already linked keeps its Unlink button even when it is unconfigured. This matches the mock, where GitHub is linked with `gh=off` and still shows Unlink. While `/api/oauth/providers` is loading, Link stays enabled (`configured === undefined`). The login page behaves the same way.
- **Hint styling:** the built Profile and Login pages show the hint as lowercase "not configured" text beside the button. The mock shows "Not configured" with a status dot under the button and wires it up with `aria-describedby`. On Profile, the disabled button's accessible name is just "Link", because the hint is not linked to it. On Services, the hint is a status badge.
- **Steam on Services:** with `STEAM_API_KEY` unset, the page shows Steam as "not configured" and disables its button. The mock does not tie Steam to the provider toggles. This goes beyond the spec, but it is reasonable.
- **Docs are stale:** Architecture §8.6 still says the server refuses to start without JWT_SECRET, and nothing documents `ENABLE_FAKE_WIDGETS`. No checklist item asks for docs changes.
- **Files outside Scope:** the branch also touches files the Scope does not name, such as `env.validation.ts`, `fetch.service.ts`, `timer.module.ts`, the oauth/connections controllers, `provider-config.ts` and `shared/src/dto.ts`. Each one is needed to implement a Scope bullet.
- **Compose version:** the `docker-compose` v1 binary is not installed here, so the boot check used `docker compose` (5.1.3). `env_file: [{path, required: false}]` needs Compose 2.24 or later.
- **Redis cache format:** the cache value changed to `{data, fetchedAt}`. Entries written by the previous build read back as `undefined` until they expire, which takes at most `minRefreshSec`. This only matters during a rolling upgrade.
- **Commits:** all 4 subjects match `[C.NE][<scope>] <type>: …` and have no body. The package files are unchanged against `prod-smtp`.

## Screenshots

Profile, providers unconfigured (built app): both Link buttons are disabled with "not configured"

![profile unconfigured](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/profile-unconfigured.png?raw=true)

Profile, GitHub configured and Google not (built app)

![profile mixed](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/profile-mixed.png?raw=true)

Profile, both configured (built app)

![profile configured](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/profile-configured.png?raw=true)

Login, providers unconfigured (built app)

![login unconfigured](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/login-unconfigured.png?raw=true)

Login, GitHub configured and Google not (built app)

![login mixed](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/login-mixed.png?raw=true)

Login, both configured (built app)

![login configured](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/login-configured.png?raw=true)

Services, providers unconfigured (built app)

![services unconfigured](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/services-unconfigured.png?raw=true)

Services, GitHub configured and Google not (built app)

![services mixed](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/services-mixed.png?raw=true)

Services, both configured (built app; Steam has no API key)

![services configured](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/services-configured.png?raw=true)

Mock, Profile with `gh=off&go=off`

![mock profile](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/mock-profile-unconfigured.png?raw=true)

Mock, Login with `gh=off&go=off`

![mock login](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/mock-login-unconfigured.png?raw=true)

Mock, Services with `gh=off&go=off`

![mock services](https://github.com/tekClovis/dashBoard/blob/feature/boot-and-timer/features/boot-and-timer/verification/mock-services-unconfigured.png?raw=true)
