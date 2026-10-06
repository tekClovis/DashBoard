# big-weather-search: verification

Branch `feature/big-weather-search` @ `ad9a797`. I tested it against the full stack (`docker compose up --build`) in headless Chromium with agent-browser, using a real Open-Meteo upstream.

## Checklist

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Search endpoint returns more than one candidate for "Paris", each with name, country and coordinates | PASS | [api-search.txt](api-search.txt) (live `GET /api/weather/search?q=Paris` returns 10 candidates with name/region/country/lat/lon), [e2e-weather.log](e2e-weather.log) (`city search > 1.`) |
| 2 | Typing "Paris" in the add-widget dialog lists more than one candidate with region/country | PASS | [04-paris-results.png](04-paris-results.png): 10 rows, for example "Île-de-France Region, France" and "Texas, United States", each with coordinates |
| 3 | Picking a candidate and saving creates a widget showing that city's weather | PASS | [06-picked.png](06-picked.png), [07-confirm.png](07-confirm.png), [09-widget-after-reload.png](09-widget-after-reload.png) (Paris, Texas: "Paris, United States", 25.1 °C, Clear sky), [e2e-weather.log](e2e-weather.log) (`3/4.`) |
| 4 | Saved params hold the chosen candidate's coordinates (no re-resolve of `results[0]`) | PASS | [api-saved-widget.txt](api-saved-widget.txt) (`latitude: "33.66094", longitude: "-95.55551"`, the Texas candidate, not the first result), [e2e-weather.log](e2e-weather.log) (no geocoding call, forecast uses the stored latitude) |
| 5 | Empty query or no results shows a clear empty state, not an error | PASS | [11-no-results.png](11-no-results.png) ("No cities match “Atlantisxyz”."), [12-empty-query.png](12-empty-query.png) ("Type a city name to see matches."), [api-search.txt](api-search.txt) (`q=` and `q=zzzznotacity` return `200 {"results":[]}`) |
| 6 | Unit, e2e, typecheck and lint pass | PASS | [unit-server.log](unit-server.log) (659/659), [unit-web.log](unit-web.log) (225/225), [e2e-server.log](e2e-server.log) (118/118), [typecheck-web.log](typecheck-web.log) and [typecheck-server.log](typecheck-server.log) (exit 0, no output), [lint.log](lint.log) (exit 0, warnings only, all pre-existing) |

### Mock states

| State | Result | Evidence |
|-------|--------|----------|
| Idle | matches | [01-settings-idle.png](01-settings-idle.png) |
| One character ("Keep typing: at least 2 characters.") | matches | [02-one-char.png](02-one-char.png) |
| Searching (3 skeleton rows and "Searching…") | matches | [03-searching.png](03-searching.png) |
| Several matches (name, place, coordinates) | matches | [04-paris-results.png](04-paris-results.png) |
| Next without a pick ("Pick a city from the results.") | matches | [05-next-without-pick.png](05-next-without-pick.png) |
| City picked (chip with Change) | matches | [06-picked.png](06-picked.png) |
| Confirm step (`city=Paris, Texas, United States`, latitude, longitude) | matches | [07-confirm.png](07-confirm.png) |
| Configure pre-fills the saved pick, and Change brings the search back | matches | [10-configure-prefilled.png](10-configure-prefilled.png) |
| No results | matches | [11-no-results.png](11-no-results.png) |
| Search failed, with Retry (request aborted in the browser) | matches; Retry then lists Lyon candidates | [13-search-failed.png](13-search-failed.png) |

## Notes (not contract misses)

- The builder reported tsc errors in `ParamForm.tsx`. They came from a stale `@dashboard/shared` build. After a fresh `npm run build -w shared`, `tsc --noEmit` passes for both web and server.
- The first widget added to an empty dashboard renders as a thin sliver until the page is reloaded ([08-widget-saved.png](08-widget-saved.png)). This bug predates this branch and is tracked in `features/fix-first-widget-width`.
- Copy differs slightly from the mock:
  - The field hint "Search by name, then pick the right match." is missing.
  - The results hint says "N cities. Pick one." where the mock says "… Pick one to save its exact location."
  - The picked chip has no cloud-sun glyph.
- On the confirm step, coordinates are shown at full precision (`33.66094`). The mock shows its own sample data with 4 decimals. This is consistent with what gets saved.
- The `region`, `country`, `latitude` and `longitude` params are `hidden` ParamSpecs. They are still listed in `/api/catalog` and `/about.json`.
- `SearchPicker` is generic (`search`, `toOption`, `nouns`) and is registered through `PICKERS`, so big-youtube-search and big-steam-search can reuse it.

## Screenshots

![idle](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/01-settings-idle.png?raw=true)
![one char](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/02-one-char.png?raw=true)
![searching](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/03-searching.png?raw=true)
![paris results](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/04-paris-results.png?raw=true)
![next without pick](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/05-next-without-pick.png?raw=true)
![picked](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/06-picked.png?raw=true)
![confirm](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/07-confirm.png?raw=true)
![saved, before reload](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/08-widget-saved.png?raw=true)
![widget](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/09-widget-after-reload.png?raw=true)
![configure prefilled](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/10-configure-prefilled.png?raw=true)
![no results](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/11-no-results.png?raw=true)
![empty query](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/12-empty-query.png?raw=true)
![search failed](https://github.com/tekClovis/dashBoard/blob/feature/big-weather-search/features/big-weather-search/verification/13-search-failed.png?raw=true)
