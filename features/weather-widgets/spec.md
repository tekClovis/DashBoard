## Scope
Add `server/src/services/weather/` per `docs/Architecture.md` §3 and its widget catalog table:

- Register `ServiceSpec { name: 'weather', connection: 'none' }`.
- Two `WidgetDefinition`s, both `auth: 'none'`:
  - `current_weather` — params `city`:string (required), `units`:string enum `metric`|`imperial` (required, default `metric`); `minRefreshSec: 300`.
  - `forecast` — params `city`:string (required), `days`:integer 1–7 (required, default 3); `minRefreshSec: 900`.
- Geocoding: `city` → lat/lon via Open-Meteo's geocoding API, cached in Redis under `geo:{normalized city}` with TTL 24h (normalize case/whitespace so `"Paris"`/`"paris "` share a cache entry).
- Both widgets' `fetch()` call Open-Meteo's forecast API with the resolved lat/lon and return data shaped for `WidgetDataMap['weather.current_weather']` / `WidgetDataMap['weather.forecast']` (add these to `shared/src/widgets.ts` via the `declare module` augmentation pattern used in `fake-widgets.ts`).
- Register via `registry.registerService(...)` / `registry.register(...)` in an `onModuleInit`, wired into the Nest module graph so it runs in production (unlike `fake-widgets.ts`, which is test-only).
- Unknown/unresolvable city → throw `FetchError('INVALID_PARAMS', ...)`. Upstream 5xx/timeout → `FetchError('UPSTREAM_ERROR', ...)`.

## Non-goals
- github/steam/youtube widgets — separate features.
- Any change to `WidgetRegistryService`, Timer, or FetchService internals — this only registers definitions against the existing registry built in `catalog-api`/`timer-realtime`.
- Removing `fake-widgets.ts` — leave it as test fixture.

## Verification checklist
1. `GET /about.json` lists service `weather` with widgets `current_weather` and `forecast`, each showing only `name`/`description`/`params[].{name,type}`.
2. `GET /api/catalog` (authenticated) shows `weather` with `connected: true` for every user regardless of `ServiceConnection` rows (no-connection service).
3. Creating a `current_weather` instance with a valid `city` and subscribing over Socket.IO yields a `widget:data` event with real temperature/condition data within one Timer tick after cache miss.
4. Creating a `forecast` instance with `days: 5` returns 5 days of forecast data in the payload.
5. `units: 'imperial'` returns Fahrenheit values; `units: 'metric'` returns Celsius, for the same city.
6. Two widget instances (any users) with the same `city` within 24h reuse the same `geo:{city}` Redis key (verify via cache inspection or a spy) — no duplicate geocoding call.
7. An unresolvable `city` (e.g. `"zzzznotacity"`) produces a `widget:error` with `code: 'INVALID_PARAMS'`, not a crash or `UPSTREAM_ERROR`.
8. Widget cache key for a `weather.*` instance has no `:conn:` suffix (public data, shared across users).

## Constraints
- No API key needed for Open-Meteo; do not add a config var for it.
- Do not touch `server/src/connections/*` — weather never uses a `ServiceConnection`.
- `mock.html` only needs to demonstrate the two widgets' rendered data shape (a card showing temp/condition, a card showing a multi-day forecast) — this is primarily an API-shape feature, no new UI chrome (that's `widget-grid-ui`'s job).

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/weather-widgets/mock.html` (built result must match its widget-card flows and states). Capture evidence via `chrome-headless-shell` into `features/weather-widgets/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/weather-widgets/spec.md
