## Scope
Add `server/src/services/steam/` per `docs/Architecture.md` §3 and its widget catalog table:

- Register `ServiceSpec { name: 'steam', connection: 'openid' }`.
- Two `WidgetDefinition`s, both `auth: 'connection'`:
  - `recently_played` — params `number`:integer 1–10 (required, default 5); `minRefreshSec: 600`.
  - `game_news` — params `app_id`:integer (required), `number`:integer 1–10 (required, default 5); `minRefreshSec: 900`.
- `fetch(params, ctx)` calls the Steam Web API using the server-side `STEAM_API_KEY` (already validated at boot per Architecture §11) plus the connected user's SteamID64. Per Architecture §5.2, Steam stores only the SteamID64 (no access/refresh token) — read it from the user's `steam` `ServiceConnection.externalAccountId` (via `connections-api`'s existing lookup, not a new query path), not from `ctx.accessToken`.
- Returns data shaped for `WidgetDataMap['steam.recently_played']` / `WidgetDataMap['steam.game_news']` (add via `declare module` augmentation in `shared/src/widgets.ts`).
- Register via `registry.registerService(...)` / `registry.register(...)` in an `onModuleInit`, wired into the Nest module graph for production.
- Error mapping: Steam API error/non-2xx or malformed response → `FetchError('UPSTREAM_ERROR', ...)`; unknown/invalid `app_id` → `FetchError('INVALID_PARAMS', ...)`; user with no `steam` connection → `FetchError('NOT_CONNECTED', ...)`.
- If `STEAM_API_KEY` is not configured on this server instance, the service must still register (so it's listed per Architecture §11: "still listed, but its connect button shows 'not configured'") but any `fetch()` call fails fast with `FetchError('UPSTREAM_ERROR', 'Steam API not configured')`.

## Non-goals
- weather/github/youtube widgets — separate features.
- The Steam OpenID connect handshake itself (`passport-steam`) — already built (`connections-api`'s `steam-connect.strategy.ts`). This feature only consumes the resulting SteamID64.

## Verification checklist
1. `GET /about.json` lists service `steam` with widgets `recently_played`, `game_news`.
2. `GET /api/catalog` shows `steam` with `connected: false` for a user with no Steam connection, `connected: true` after connecting via OpenID.
3. For a connected user with a public Steam profile, `recently_played` returns up to `number` recently-played games.
4. `game_news` for a valid `app_id` returns up to `number` news items for that app.
5. An unconnected user's instance on a `steam.*` widget produces `widget:error` with `code: 'NOT_CONNECTED'`.
6. An invalid/unknown `app_id` produces `widget:error` with `code: 'INVALID_PARAMS'`.
7. With `STEAM_API_KEY` unset, the service still appears in `/about.json`/`/api/catalog`, but a `fetch()` attempt yields `widget:error` with `code: 'UPSTREAM_ERROR'` (not a crash or 500 on catalog load).
8. Cache key for a `steam.*` instance includes the `:conn:{connectionId}` suffix.

## Constraints
- Do not modify `connections-api`'s Steam OpenID handshake or add a token-decryption path for Steam (it has none).
- Fetch the SteamID64 through whatever accessor `connections-api` already exposes for a `ServiceConnection`'s `externalAccountId`; don't add a parallel Prisma query.
- `mock.html` only needs to demonstrate the two widgets' rendered data shape (recently-played list, news-item list) — no new UI chrome.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/steam-widgets/mock.html` (built result must match its widget-card flows and states). Capture evidence via `chrome-headless-shell` into `features/steam-widgets/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/steam-widgets/spec.md
