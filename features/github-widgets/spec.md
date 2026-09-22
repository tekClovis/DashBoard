## Scope
Add `server/src/services/github/` per `docs/Architecture.md` §3 and its widget catalog table:

- Register `ServiceSpec { name: 'github', connection: 'oauth' }`.
- Three `WidgetDefinition`s, all `auth: 'connection'`:
  - `recent_commits` — params `repo`:string pattern `owner/name` (required), `number`:integer 1–20 (required, default 5); `minRefreshSec: 60`.
  - `pull_requests` — params `repo`:string (required), `state`:string enum `open`|`closed`|`all` (required, default `open`); `minRefreshSec: 60`.
  - `security_alerts` — params `repo`:string (required); `minRefreshSec: 300`.
- `fetch(params, ctx)` calls the GitHub REST API with `ctx.accessToken` (Bearer auth) for the given `repo`, returning data shaped for the corresponding `WidgetDataMap['github.*']` entries (add via `declare module` augmentation in `shared/src/widgets.ts`).
- Register via `registry.registerService(...)` / `registry.register(...)` in an `onModuleInit`, wired into the Nest module graph for production.
- Error mapping: GitHub 401 → `FetchError('REAUTH_REQUIRED', ...)`; GitHub 403 with rate-limit headers → `FetchError('RATE_LIMITED', ...)`; GitHub 404 (unknown/inaccessible repo) or malformed `repo` → `FetchError('INVALID_PARAMS', ...)`; other non-2xx or network error → `FetchError('UPSTREAM_ERROR', ...)`.
- If the current user has no `github` `ServiceConnection`, `fetch()` (or the layer that builds `FetchContext`) must surface `FetchError('NOT_CONNECTED', ...)` — verify this is already handled by `timer-realtime`'s `FetchContext` construction; if not, note the gap rather than duplicating connection lookup here.

## Non-goals
- weather/steam/youtube widgets — separate features.
- GitHub OAuth login or the connect handshake itself — already built (`oauth-login`, `connections-api`). This feature only consumes the resulting `accessToken`.
- Token refresh — GitHub OAuth App tokens do not expire (per Architecture §5.2), so no refresh logic here.

## Verification checklist
1. `GET /about.json` lists service `github` with widgets `recent_commits`, `pull_requests`, `security_alerts`.
2. `GET /api/catalog` shows `github` with `connected: false` for a user with no GitHub connection, `connected: true` after connecting.
3. For a connected user, a `recent_commits` instance on a real public repo (e.g. `owner/name` the test fixtures control) yields `widget:data` with `number` commits, most recent first.
4. `pull_requests` with `state: 'closed'` returns only closed PRs for the repo; `state: 'all'` returns both.
5. `security_alerts` returns the repo's alert list shape (empty array is valid for a repo with none).
6. An unconnected user's instance on a `github.*` widget produces `widget:error` with `code: 'NOT_CONNECTED'`.
7. A repo string failing the `owner/name` pattern is rejected at instance-create time by the existing param validator (`catalog-api`), never reaching `fetch()`.
8. A revoked/invalid token produces `widget:error` with `code: 'REAUTH_REQUIRED'`, and the user's `ServiceConnection.status` becomes `REAUTH`.
9. Cache key for a `github.*` instance includes the `:conn:{connectionId}` suffix — two different users' identical params never share a cache entry.

## Constraints
- Do not modify `connections-api`'s OAuth handshake or `oauth-login`'s login flow.
- Decrypt tokens only inside `FetchContext` (already built in `timer-realtime`) — never handle raw tokens elsewhere.
- `mock.html` only needs to demonstrate the three widgets' rendered data shape (commit list, PR list with state badges, alert list) — no new UI chrome.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/github-widgets/mock.html` (built result must match its widget-card flows and states). Capture evidence via `chrome-headless-shell` into `features/github-widgets/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/github-widgets/spec.md
