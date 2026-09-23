# github-widgets review

**Verdict: PASS.** No blocking defects. All nine checklist items pass. The builder's deliberate deviations hold up against the spec. Non-blocking notes are listed at the end.

Branch reviewed: `feature/github-widgets` (8d878f8, 7ccb390) against `main`, on 2026-09-22.

## Suites (run by the reviewer)

| Command | Result |
|---|---|
| server `vitest run` (unit) | 19 files / 143 tests passed |
| server `vitest run --config vitest.config.e2e.ts` (Testcontainers) | 9 files / 85 tests passed |
| web `vitest run` | 54 tests passed |
| `tsc --noEmit` server, `tsc -b` web | 0 errors |
| `npm run lint` (oxlint, type-aware) | exit 0. The existing warnings are all outside the new files. |

## How the probes were run

- **Real GitHub:** the reviewer's `gh` CLI token (repo scope, no `security_events`) ran against `octocat/Hello-World` through the real `fetch()` functions. The token was never printed. See `probe-real-github.txt`.
- **Stubbed GitHub:** the full stack ran from `dist/main.js` with a `--import` preload that stubs only `api.github.com`. It used a fresh Postgres (5433) and Redis (6380), Vite on 5173, and real Socket.IO clients.
  - Stubbed tokens: `tok-ok`, `tok-other`, `revoked` (returns 401) and `ratelimited` (returns 403 with `x-ratelimit-remaining: 0`).
  - Evidence: `probe-socket-events.txt`, `probe-redis-keys.txt` and `probe-stubbed-github-calls.txt`. The last one logs only the Bearer header's length.
- **Unit probes:** a temporary unit probe (since deleted) covered the error mapping, the `repo`/`number`/`state` validation and token leakage. See `probe-unit-mapping.txt`.

## Checklist

1. **PASS: `/about.json` lists github with its three widgets.**
   - Production build with `NODE_ENV=production`: `about-production.json` shows `github: [recent_commits, pull_requests, security_alerts]` and no fake services.
   - Test: `about.e2e-spec.ts` "lists the github service with its three widgets…".
2. **PASS: `/api/catalog` shows `connected` correctly.**
   - Live: the `unconnected@` user gets `('github', False)`. The `connected@` user gets `('github', True, 'OK')`.
   - Test: `github-widgets.e2e-spec.ts` "2. /api/catalog shows github connected:false, then connected:true…".
3. **PASS: `recent_commits` returns `number` commits, most recent first.**
   - Real GitHub, `octocat/Hello-World` with `number=3`: 3 commits dated 2012-03-06 > 2011-09-14 > 2011-01-26.
   - Live stack: `per_page=5` is sent (`github-widgets.ts:42`).
   - Test: e2e "3. recent_commits yields `number` commits, most recent first".
4. **PASS: `pull_requests` filters by `state`.**
   - Real GitHub: `closed` returned `states=["closed"]` and `all` returned `["open","closed"]`.
   - Live stack: `open` gave 2 open PRs, `closed` gave 1 closed, `all` gave 3 mixed.
   - Test: e2e "4. pull_requests with state %s…".
5. **PASS: `security_alerts` returns the alert list shape.**
   - Stubbed: `{repo, alerts:[{number,summary,severity,package,url}]}`, and `alerts: []` for `octocat/empty`.
   - Real GitHub gave a 403 in both cases: Hello-World because the token lacks the alert scope, and the reviewer's own repo because "Dependabot alerts are disabled". So no real alert data was available.
   - Test: e2e "5. security_alerts returns the alert list shape (empty is valid)".
6. **PASS: an unconnected user gets `NOT_CONNECTED`.**
   - Live: `widget:error {code:"NOT_CONNECTED"}`, and GitHub was never called.
   - The check lives in the existing `FetchService` (`timer/fetch.service.ts:39`), so this branch does not duplicate it.
   - Test: e2e "6. an unconnected user gets widget:error NOT_CONNECTED".
7. **PASS: a malformed `repo` is rejected at create time.**
   - Live `POST /api/dashboards/:id/widgets` returned `400 INVALID_PARAMS` for all of these, and no row or GitHub call was created:
     - `noslash`, `a/b/c`, `owner/..`, `owner/.`, `../etc`, `owner/%2e%2e`
     - `" owner/x"`, `"owner/x "`, `owner/x?y=1`, `owner/x#frag`, `owner/x/../../users`
     - `""` and a missing `repo`
   - `fetch()` checks the pattern again as a second guard (`github-api.ts:15-21`).
   - Test: e2e "7. …rejected at instance create…".
8. **PASS: a revoked token gives `REAUTH_REQUIRED` and flips the connection to `REAUTH`.**
   - Live: `widget:error {code:"REAUTH_REQUIRED"}`, and the `revoked` connection row's `status` became `REAUTH`.
   - Real GitHub: an invalid token maps to `REAUTH_REQUIRED`.
   - Test: e2e "8. a revoked token yields REAUTH_REQUIRED…".
9. **PASS: cache keys are per connection.**
   - Live Redis: `widget:github.recent_commits:3f3fd6…:conn:ea4463b0…` and `…:3f3fd6…:conn:e267bf9a…`. Two users with the same params get separate entries, and GitHub was called once per token.
   - Test: e2e "9. cache keys carry :conn:{connectionId}…".

## Other probes

- **Error mapping** (`github-api.ts:53-61`):

  | GitHub response | Result |
  |---|---|
  | 401 | `REAUTH_REQUIRED` |
  | 403 with `x-ratelimit-remaining: 0` | `RATE_LIMITED` |
  | 403 with `retry-after` | `RATE_LIMITED` |
  | 403 with `x-ratelimit-remaining: 4999` | `UPSTREAM_ERROR` |
  | 429 | `RATE_LIMITED` |
  | 404 | `INVALID_PARAMS` |
  | 409, 422, 500, 502, 301 | `UPSTREAM_ERROR` |
  | Network error | `UPSTREAM_ERROR` |
  | Non-JSON 200 | `SyntaxError`, which the Timer maps to `UPSTREAM_ERROR` |

- **`number` bounds:** 0, 21, 5.5, `"abc"`, -3 and a missing value are all rejected. `"7"` is coerced to 7. Default 5 and range 1–20 are set at `github-widgets.ts:37`.
- **`state` enum:** `merged`, `OPEN` and a missing value are rejected. Default `open` is set at `github-widgets.ts:60`.
- **Token handling:** the token is sent only as `Authorization: Bearer …` to `https://api.github.com/repos/...` (`github-api.ts:35-41`). It does not appear in server logs, Redis keys, Redis values, error messages or `widget:*` payloads. Checked by grep, and the real-GitHub probe reports `noleak`.
- **Nest registration:** `GithubModule.onModuleInit` (`github.module.ts:11-13`) is imported into `AppModule` (`app.module.ts:39`). It is confirmed under `NODE_ENV=production`, where `main.ts` skips the fake widgets.
- **Scope:** the diff touches only `services/github/*`, `app.module.ts`, `shared/src/widgets.ts`, the web view and registry, the feature docs, and two e2e specs. The e2e specs change only because a real github service now exists. OAuth, connections, registry, Timer and FetchService are untouched, and there is no token refresh logic.

## Deliberate deviations

- **429 → `RATE_LIMITED`: accepted.** The spec's catch-all would give `UPSTREAM_ERROR`, but GitHub documents 429 as a rate-limit response. The Timer backs off the same way for both codes, so only the reported code differs.
- **Dependabot-disabled 403 → `UPSTREAM_ERROR`: accepted, and it matches the letter of the spec.** The real 403 from GitHub carries `x-ratelimit-remaining: 4999`. A literal "any rate-limit header" rule would have wrongly returned `RATE_LIMITED`. Keying on `remaining == 0` or `retry-after` is correct.
- **`medium` vs `moderate`: accepted.** The GitHub REST API returns `security_advisory.severity` ∈ {low, medium, high, critical}. `moderate` is only the label in GitHub's web UI and in the mock. The view shows the API value with a yellow badge, which matches the mock's colour.
- **20-item cap on PRs and alerts: accepted.** The spec sets no count, and GitHub's default page size is 30. The truncation is silent (see note 3).

## Defects

None blocking.

## Non-blocking notes

1. **Mock copy for the not-connected state:**
   - Mock: "Connect GitHub to load this widget."
   - Built: "Reconnect required: No github connection for this user." with a "Reconnect" link.
   - The copy comes from the existing `WidgetFrame` (`RECONNECT_CODES`) and `FetchService` message, which are outside this feature's scope. The flow (a reconnect call to action linking to `/services`) matches.
2. **Card headers:** the mock's headers show the repo, the "5 shown" count and the state. The built header is the existing `WidgetFrame` title (`github.recent_commits`). The spec says "no new UI chrome", so this is acceptable.
3. **Silent truncation:** PRs and alerts are cut at 20 with no "more…" indicator.
4. **Dependabot-disabled or insufficient-scope 403:** the card shows "Error: GitHub responded with HTTP 403." and retries forever with backoff capped at 15 minutes. A clearer message would help the user.
5. **Owner pattern:** `[A-Za-z0-9-]+` rejects Enterprise Managed User handles (`alice_acme`).
6. **`shared/src/widgets.ts`:** the builder put the github keys directly into `WidgetDataMap` instead of a `declare module` augmentation. The effect is equivalent, and it is simpler because the web package needs the types too.
7. **Missing `state`:** `fetch()` does not re-check `state`. If params ever bypassed the validator, `state=undefined` would be sent, and GitHub's 422 would map to `UPSTREAM_ERROR`. That cannot happen through the API.

## Screenshots

These are the real widget cards rendered through `DashboardPage` and `WidgetFrame`, in headless Google Chrome using playwright-core:

- `mock.png`: the reference mock.
- `connected-dashboard-page.png`: the full grid.
- `card-recent-commits.png`
- `card-pull-requests-open.png`, `card-pull-requests-closed.png`, `card-pull-requests-all.png`: open, closed and all states with badges.
- `card-security-alerts.png`: high and medium badges.
- `card-security-alerts-empty.png`
- `card-not-connected.png` with `not-connected-dashboard-page.png`
- `card-reauth-required.png` with `reauth-dashboard-page.png`
- `card-rate-limited.png` with `rate-limited-dashboard-page.png`
- `card-invalid-repo-error.png`: a 404 mapped to `INVALID_PARAMS`.
