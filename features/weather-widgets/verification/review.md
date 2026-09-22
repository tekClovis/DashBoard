# weather-widgets review: `feature/weather-widgets` (2ec489b)

## Verdict: PASS

All 8 checklist items pass, and so do every constraint and non-goal. Round 1's D1 (the geocoding query was not normalized like the cache key) is fixed in 2ec489b. I checked the fix against the real stack and real Open-Meteo, not only through the new unit test. No new blocking defects were found. The remaining items are non-blocking notes.

## Suites (run by reviewer on 2ec489b)

| Command | Result |
|---|---|
| `npm test -w server` | 19 files, 129 tests pass (one more than round 1: the new whitespace-collapse test) |
| `npm run test:e2e -w server` (testcontainers, real Open-Meteo) | 9 files, 80 tests pass |
| `npm test -w web` | 18 files, 53 tests pass |
| `tsc --noEmit` in server and in web | exit 0 |
| `npm run lint` | exit 0, 0 errors. New warnings are the same kinds the repo already has: `weather.widgets.spec.ts:91,104,125` unbound-method and `test/weather.e2e-spec.ts:152` no-base-to-string |

## Checklist

| # | Result | Evidence |
|---|---|---|
| 1 | PASS | `GET /about.json` returns `weather` → `current_weather` params `[{city,string},{units,string}]` and `forecast` params `[{city,string},{days,integer}]`. Each widget has only name/description/params. Checked with a probe and with `about.e2e-spec.ts` "serves the subject-required shape, with only name/description/params[].{name,type} per widget". |
| 2 | PASS | `GET /api/catalog` returns `{name:'weather', connection:'none', connected:true, status:'OK'}` for a user with no rows. `ConnectionsService.list` hard-codes the weather entry (`server/src/connections/connections.service.ts:36`, unchanged on this branch), so ServiceConnection rows cannot change it. Covered by `catalog.e2e-spec.ts` "returns weather as connected:true with no ServiceConnection row". |
| 3 | PASS | Probe: REST `POST /api/dashboards/:id/widgets`, then Socket.IO `widget:subscribe`. About 1 s later: `widget:data {location:'Tokyo, Japan', temperature:21.5, unit:'°C', condition:'Partly cloudy'}`. Also `weather.e2e-spec.ts` "3/5. current_weather pushes real data". |
| 4 | PASS | Probe (Tokyo): days 1, 5, 7 and `"5"` → 1, 5, 7 and 5 entries `{date,min,max,condition}`. Days 0, 8, 2.5, -1 and a missing value → 400 INVALID_PARAMS. `weather.e2e-spec.ts` "4. forecast with days: 5 returns 5 days". |
| 5 | PASS | Tokyo metric 21.5 °C, imperial 70.7 °F (21.5×1.8+32 = 70.7). The request carries `temperature_unit=celsius`/`fahrenheit` (unit test "current_weather returns Celsius for metric and Fahrenheit for imperial"). `units: 'kelvin'` → 400. |
| 6 | PASS | Probe: `"New   York"` (created first), `"new\tyork"`, `" NEW YORK "`, `"new york"` and `"new york"`, then `"Rio  de\t\tJaneiro"` and `"rio de janeiro"`. All returned data. Exactly 2 geocoding requests were made (`name=new+york` and `name=rio+de+janeiro`). Keys: `geo:new york` and `geo:rio de janeiro`, TTL 86395. `weather.e2e-spec.ts` "6/8" covers two users sharing one call. |
| 7 | PASS | `zzzznotacity` → `widget:error {code:'INVALID_PARAMS', message:"Could not resolve city 'zzzznotacity'."}` with no `retryAt`, for both current_weather and forecast. No `geo:*` key is written. `weather.e2e-spec.ts` "7." |
| 8 | PASS | All `widget:weather.*` keys have the form `widget:weather.current_weather:<sha256>` with no `:conn:`. `auth:'none'` takes the non-connection path in `FetchService.get`. `weather.e2e-spec.ts` "6/8" asserts `not.toContain(':conn:')`. |

### Upstream error mapping (probe, fetch stubbed inside the real app)
- Geocoding 503 → `UPSTREAM_ERROR "Open-Meteo responded 503."` with `retryAt`.
- Geocoding OK and forecast 500 → `UPSTREAM_ERROR` with `retryAt`.
- TimeoutError → `UPSTREAM_ERROR "Open-Meteo unreachable: …timeout"` with `retryAt`.
- 429 → `RATE_LIMITED`. 200 with an HTML body → `UPSTREAM_ERROR` (Timer fallback). 400 → `UPSTREAM_ERROR`.
- An unknown city is the only path that yields INVALID_PARAMS.

### Constraints and non-goals
- Production registration: PASS. `AppModule` imports `WeatherModule` (`server/src/app.module.ts:39`). The built `node dist/main.js` with `NODE_ENV=production` returns `/about.json` services `['weather']`, with the fakes excluded.
- `git diff main...` touches nothing in `server/src/connections/*`, `widget-registry.service.ts`, `timer.service.ts`, `fetch.service.ts` or `fake-widgets.ts`: PASS. The only `timer/` edits are test-only: `makeFakeRedis` moved into `test-helpers.ts`.
- No API key or config var: PASS. The diff contains no `process.env`, `ConfigService` or key names, and `.env.example` is unchanged.
- `fake-widgets.ts` kept and still registered outside production (`server/src/main.ts:25`): PASS.
- `refreshRate` below `minRefreshSec` is rejected (current 60 → 400 for range 300–86400, forecast 300 → 400 for range 900–86400).

## Round-1 D1 re-verification
- `server/src/services/weather/open-meteo.ts:33`: `normalizeCity()` is now the single normalization. `geoCacheKey()` (`:37`) and the upstream `name` (`Geocoder.resolve` → `lookup`, `:55` and `:66`) both use it.
- The order-dependent repro no longer reproduces. `"New   York"` created first now returns data instead of INVALID_PARAMS, and the query sent is `name=new+york`.
- Lowercasing the query does not hurt resolution. Curl against Open-Meteo gave identical top hits for `İstanbul`/`i̇stanbul`, `SÃO PAULO`/`são paulo`, `ÅLESUND`/`ålesund` and `Ærøskøbing`/`ærøskøbing`.
- Regression test: `weather.widgets.spec.ts` "geocodes the whitespace-collapsed city name, sharing one lookup across spellings" (`New   York` and `new\tyork` → one call with `name=new york`).

## Defects
None blocking.

## Non-blocking notes
- `units`/`days` are declared `required: true` with a `default`. `validateParams` checks `required` first, so the default is never applied over REST: a POST without `units` → 400 `'units' is required`. This matches the spec literally. The web ParamForm pre-fills the defaults (`web/src/components/ParamForm.tsx:38`).
- The weather types sit directly in the base `WidgetDataMap` (`shared/src/widgets.ts`) instead of using the `declare module` augmentation the spec's Scope names. The result is equivalent, since the web client imports the same types, but the file's documented convention changed.
- `city: "   "` passes create-time validation and fails at runtime with `INVALID_PARAMS "Could not resolve city ''."`. The INVALID_PARAMS message now echoes the lowercased, normalized name rather than the user's input.
- The `widget:` cache key hashes the raw `city`, so `"Paris"` and `" paris "` get separate widget-data entries. Only the geo lookup is shared, which is all the spec requires.
- UI chrome differs from the mock, and it comes from the existing `WidgetFrame`, which this branch does not change (the spec leaves chrome to widget-grid-ui):
  - The header shows `weather.current_weather`, not city/units/refresh.
  - The error body is `Error: Could not resolve city 'zzzznotacity'.`. The mock shows `INVALID_PARAMS: could not resolve city`, but WidgetFrame never shows the code.
  - Forecast tiles use the theme's `bg-accent` (grey) rather than the mock's light blue.
- These states match the mock: the data card (big rounded temperature with unit, muted condition line), the forecast tiles (weekday plus rounded max temperature, with the condition in `title`), the skeleton, and the error state.

## Screenshots
Taken with headless Chrome through Playwright, against the real server (`NODE_ENV=production`), the Vite SPA and real Open-Meteo. All of them replace the round-1 captures.
- `mock.png`: the reference mock.
- `real-dashboard.png`: the full grid with all five weather cards.
- `real-current-metric.png`: Paris, metric, 19°C, Clear sky.
- `real-current-imperial.png`: `"  paris "`, imperial, 66°F, Clear sky.
- `real-forecast-5days.png`: Paris, 5 tiles, Tue–Sat.
- `real-forecast-7days.png`: `"New   York"` (the D1 repro input), 7 tiles, Tue–Mon.
- `real-loading-skeleton.png`: socket blocked, skeleton state.
- `real-error-invalid-params.png`: zzzznotacity error state.

## Review history
- Round 1 (198da95): FAIL. D1: the geocoding query sent `city.trim()` while the cache key collapsed internal whitespace, so `"New   York"` got INVALID_PARAMS or data depending on which variant filled `geo:new york` first.
- Round 2 (2ec489b): PASS. D1 was fixed by the shared `normalizeCity()`, confirmed on the real stack. No new defects.
