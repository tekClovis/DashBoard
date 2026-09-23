## Scope
Add `server/src/services/youtube/` per `docs/Architecture.md` §3 and its widget catalog table:

- Register `ServiceSpec { name: 'youtube', connection: 'oauth' }`.
- Three `WidgetDefinition`s, all `auth: 'connection'`:
  - `channel_stats` — params `channel_id`:string (required); `minRefreshSec: 600`.
  - `latest_videos` — params `channel_id`:string (required), `number`:integer 1–10 (required, default 5); `minRefreshSec: 600`.
  - `trending_videos` — params `region`:string pattern ISO-3166 alpha-2 (required), `number`:integer 1–10 (required, default 5); `minRefreshSec: 900`.
- `fetch(params, ctx)` calls the YouTube Data API v3 with `ctx.accessToken` (Bearer auth). Per Architecture §5.2, the connection was made with `access_type=offline`, so on a 401 the fetch layer must refresh using the stored (encrypted) refresh token and retry once before failing — coordinate with whatever refresh mechanism `connections-api`/`FetchContext` already exposes; if none exists yet for refresh, implement it as the encrypted-refresh-token exchange against Google's token endpoint, re-encrypting and persisting the new access token/expiry on `ServiceConnection`.
- Returns data shaped for `WidgetDataMap['youtube.channel_stats']` / `['youtube.latest_videos']` / `['youtube.trending_videos']` (add via `declare module` augmentation in `shared/src/widgets.ts`).
- Register via `registry.registerService(...)` / `registry.register(...)` in an `onModuleInit`, wired into the Nest module graph for production.
- Error mapping: 401 after a failed refresh → `FetchError('REAUTH_REQUIRED', ...)` and set `ServiceConnection.status = 'REAUTH'`; YouTube quota/429 → `FetchError('RATE_LIMITED', ...)`; unknown `channel_id` or invalid `region` → `FetchError('INVALID_PARAMS', ...)`; other non-2xx/network error → `FetchError('UPSTREAM_ERROR', ...)`.

## Non-goals
- weather/github/steam widgets — separate features.
- Google OAuth login or the connect handshake itself — already built (`oauth-login`, `connections-api`'s `google-connect.strategy.ts`). This feature only consumes and, when needed, refreshes the resulting tokens.

## Verification checklist
1. `GET /about.json` lists service `youtube` with widgets `channel_stats`, `latest_videos`, `trending_videos`.
2. `GET /api/catalog` shows `youtube` with `connected: false` for a user with no YouTube connection, `connected: true` after connecting via Google OAuth.
3. For a connected user, `channel_stats` on a valid `channel_id` returns subscriber/view/video counts.
4. `latest_videos` returns up to `number` videos, most recent first, for the given channel.
5. `trending_videos` returns up to `number` trending videos for the given `region`.
6. An expired access token triggers a silent refresh (using the stored encrypted refresh token) and the original request succeeds without surfacing an error to the client.
7. A refresh that itself fails (revoked refresh token) produces `widget:error` with `code: 'REAUTH_REQUIRED'`, and `ServiceConnection.status` becomes `REAUTH`.
8. An unconnected user's instance on a `youtube.*` widget produces `widget:error` with `code: 'NOT_CONNECTED'`.
9. An invalid `region` (fails ISO-3166 pattern) is rejected at instance-create time by the existing param validator, never reaching `fetch()`.
10. Cache key for a `youtube.*` instance includes the `:conn:{connectionId}` suffix.

## Constraints
- Do not modify `oauth-login`'s Google login flow.
- Store any refreshed token using the same AES-256-GCM encryption service `connections-api` already built — don't add a second encryption path.
- `mock.html` only needs to demonstrate the three widgets' rendered data shape (channel stat cards, video list, trending list) — no new UI chrome.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/youtube-widgets/mock.html` (built result must match its widget-card flows and states). Capture evidence via `chrome-headless-shell` into `features/youtube-widgets/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/youtube-widgets/spec.md
