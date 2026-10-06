# Review: big-steam-search

Branch `feature/big-steam-search` (head `fa4a055`). The app was run with the `run-dashboard` skill (`start.sh`, Nest serving the built SPA on :8080). I seeded a confirmed user plus a Steam `ServiceConnection` row, which is the same upsert the OpenID callback performs. The real Steam store and news APIs were used throughout. For the API-error state, `agent-browser network route --abort` blocked `/api/steam/search`.

**Verdict: PASS**

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | The search endpoint returns several games (app id, name, image) for "portal" | PASS | [endpoint-portal.txt](endpoint-portal.txt): `GET /api/steam/search?q=portal` returned HTTP 200 with 10 `{appId, name, image}` results (Portal 2 620, Portal 400, …). Without a session it returns 401, and an unknown term returns `{"results":[]}`. |
| 2 | In the add-widget dialog, the Steam game field is a search input; no numeric app-ID field remains | PASS | [01-game-field-idle.png](01-game-field-idle.png): the a11y snapshot shows `combobox "Game"` and `spinbutton "Number"` only. No App ID field is left. |
| 3 | Typing a game name lists matching games with name and image | PASS | [02-results-portal.png](02-results-portal.png): typing "portal" lists 10 games, each with a capsule image, name and `App <id>`. |
| 4 | Picking a game and saving creates a widget whose params hold that game's app id, and the widget shows its news | PASS | [04-picked.png](04-picked.png), [05-confirm.png](05-confirm.png) (`Portal 2 app_id=620`), [db-widget-params.txt](db-widget-params.txt) (`{"app_id": 620, "number": 5, "game_name": "Portal 2", "game_image": …}`), [06-widget-news.png](06-widget-news.png) (live widget `app_id=620` with Portal 2 news). |
| 5 | No results or API error shows a clear message in the dialog | PASS | [03-no-results.png](03-no-results.png) shows "No games match “zzqxnotagame”. Check the spelling, or try another game." [07-api-error.png](07-api-error.png) shows "Game search is unavailable. Try again in a moment." with a Retry button. [08-retry-recovers.png](08-retry-recovers.png) shows Retry recovering once the route is restored. |
| 6 | Unit, e2e, typecheck and lint pass | PASS | [unit-server.txt](unit-server.txt) (60 files / 656 tests), [unit-web.txt](unit-web.txt) (37 / 224), [e2e-server.txt](e2e-server.txt) (12 / 116), [lint-typecheck.txt](lint-typecheck.txt) (`npm run lint` exit 0, warnings only; `tsc --noEmit` server and web exit 0). |

Other mock flows I checked:
- Validation when Next is clicked without a pick: [09-next-without-pick.png](09-next-without-pick.png) shows "Pick a game from the results."
- Configuring an existing widget opens on the picked chip: [10-configure-existing.png](10-configure-existing.png).
- Change, then search, then pick, then save: [11-configure-change-search.png](11-configure-change-search.png), [12-configure-confirm.png](12-configure-confirm.png), [13-configure-saved.png](13-configure-saved.png). After saving, the params hold `app_id: 220` (Half-Life 2), shown in [db-widget-params-after-configure.txt](db-widget-params-after-configure.txt).

## Notes (not contract misses)

- The wording differs from the mock in a few places:
  - The chip button says "Change" where the mock has "Change game".
  - The error reads "Game search is unavailable. Try again in a moment." with a "Retry" button. The mock has the title "Steam search isn’t responding", the line "Your settings are kept", and a "Try again" button.
  - The idle hint is "Type a game name to see matches." where the mock has "Type at least 2 characters." The one-character hint does match.
  - The status line says "10 games. Pick one." where the mock says "10 games found. Pick one."
- The loading skeleton ("Searching…") exists in `SearchPicker.tsx`, but I did not screenshot it because the store answers too fast.
- A legacy `game_news` widget saved with only `app_id`, with no `game_name` or `game_image`, shows as "App <id>" with no thumbnail when reconfigured. The mock derives the thumbnail from the app id.
- `SearchPicker` is generic. Its pickers are registered in `PICKERS` in `ParamForm.tsx`, so big-weather-search can reuse it.
- The widget adds two hidden params, `game_name` and `game_image`. They are stored in `params` and appear in `/about.json` and the catalog with `hidden: true`.
- This was not introduced by this branch: deep links such as `/login` and `/d/<id>` return a Nest 404 JSON when the built SPA is served from Nest. Reloading from `/` works.
- The verification directory could not be wiped first because deletion was not permitted. Every file now in it was regenerated during this review.

## Screenshots

01 Game field, idle
![01](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/01-game-field-idle.png?raw=true)

02 Results for "portal"
![02](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/02-results-portal.png?raw=true)

03 No results
![03](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/03-no-results.png?raw=true)

04 Game picked
![04](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/04-picked.png?raw=true)

05 Confirm step
![05](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/05-confirm.png?raw=true)

06 Widget showing Portal 2 news
![06](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/06-widget-news.png?raw=true)

07 API error
![07](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/07-api-error.png?raw=true)

08 Retry recovers
![08](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/08-retry-recovers.png?raw=true)

09 Next without a pick
![09](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/09-next-without-pick.png?raw=true)

10 Configure existing widget
![10](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/10-configure-existing.png?raw=true)

11 Configure: change and search
![11](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/11-configure-change-search.png?raw=true)

12 Configure: confirm
![12](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/12-configure-confirm.png?raw=true)

13 Configure: saved, Half-Life 2 news
![13](https://github.com/tekClovis/dashBoard/blob/feature/big-steam-search/features/big-steam-search/verification/13-configure-saved.png?raw=true)
