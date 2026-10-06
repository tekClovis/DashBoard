# big-youtube-search: verification (re-review)

**Verdict: PASS.** All six checklist items and the mock's flows and states pass on `feature/big-youtube-search` @ `7cb35f8`. The two misses from the previous review are fixed:
- the picked channel keeps its avatar after Confirm → Back → Back (`7cb35f8`);
- the flaky timer e2e test now passes, because the fix from `main` was cherry-picked (`2edb765`).

How it was run: I built the app with the `run-dashboard` flow and served it from Nest on :8091, because :8080 was taken by another stack. Postgres, Redis and Mailpit came from this worktree's compose project. Google's HTTP boundary (`www.googleapis.com` and `oauth2.googleapis.com`) was faked with a `node --import` preload, and the app code was not changed. In the fake API, queries containing `err` return HTTP 500 and `zzqxv` matches nothing. The user was created with `seed-user.sh` and given a `youtube` ServiceConnection row in the DB.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Search endpoint returns several channels (id, title, thumbnail) for a channel-name query | PASS | [api-search.txt](api-search.txt): `q=tele` returns 3 channels with `id`/`title`/`thumbnail`, `zzqxv` returns `[]`, `q=t` returns 400, `err` returns 502 `UPSTREAM_ERROR`, a request with no session returns 401. Tests: [unit-youtube-search-verbose.txt](unit-youtube-search-verbose.txt), [e2e-youtube-verbose.txt](e2e-youtube-verbose.txt) |
| 2 | Channel field is a search input; no raw channel-ID text field remains | PASS | [01](01-settings-search-field.png): the a11y tree for the Settings step is `searchbox "Channel"` plus `spinbutton "Videos"`, with no channel-ID textbox |
| 3 | Typing a name lists matching channels with title and avatar | PASS | [03](03-searching.png) shows "Searching for “tele”…" and [04](04-results.png) shows 3 results, each with avatar, title and id. Test: [unit-web-search-verbose.txt](unit-web-search-verbose.txt) |
| 4 | Picking and saving creates a widget whose params hold the channel id, and the widget shows its videos | PASS | [07](07-picked.png) picked, [09](09-confirm.png) confirm step (`Telemetry Daily channel_id=UC_tele2`), [saved-widget-params.txt](saved-widget-params.txt) DB row `{"number": 5, "channel_id": "UC_tele2"}`, [12](12-widget-videos-after-reload.png) widget lists `UU_tele2` uploads |
| 5 | No results or API error shows a clear message in the dialog | PASS | [05](05-no-results.png) "No channels match “zzqxv”", [06](06-api-error.png) "Couldn’t search for channels … Try again in a moment." with a **Try again** button |
| 6 | Unit, e2e, typecheck and lint pass | PASS | Unit: [unit-server.txt](unit-server.txt) 662/662, [unit-web.txt](unit-web.txt) 219/219. e2e: [e2e.txt](e2e.txt) 116/116, and the timer file passed 3 of 3 re-runs ([1](e2e-timer-rerun-1.txt), [2](e2e-timer-rerun-2.txt), [3](e2e-timer-rerun-3.txt)). Typecheck: [server](typecheck-server.txt), [web](typecheck-web.txt), no output and exit 0. Lint: [lint.txt](lint.txt) exits 0, warnings only, none in this feature's files |
| 7 | Mock flows and states (`mock.html`) | PASS | Idle, searching, results, no results, API error, picked, and the confirm step with the title beside `channel_id` all match. After Confirm → Back → Back, the picked card keeps its avatar, and **Change** stays a compact button on the right ([10](10-back-to-settings.png) vs the mock's [mock-picked-state.png](mock-picked-state.png)). A unit test covers this: "keeps the avatar of a remembered pick" in [unit-web-search-verbose.txt](unit-web-search-verbose.txt) |

## Notes (not contract misses)

- **Merge risk:** the branch is still cut from `a87c2a4`, which is before `big-weather-search` merged. `main` already has its own `SearchPicker.tsx`, `api/search.ts`, `ParamSpec.search` and `SearchResult`/`SearchResponse` DTOs with different shapes. Merging needs a careful rebase that keeps one picker, which the spec's constraint asks for ("reuse the search-picker pattern from big-weather-search if already merged").
- When you configure an existing widget, the dialog doesn't know the channel. It shows the bare id as the title (`UC_tele2 / UC_tele2`), with no avatar and a stretched **Change** button ([13](13-configure-existing.png)). The mock renders an unknown channel the same way (no thumb, same `auto / 1fr / auto` grid), so this is cosmetic.
- The mock shows a "Search by channel name" hint under the label in the picked state. The app shows its hint ("Type at least 2 letters…") only while searching.
- The mock's result rows show a subscriber count. The endpoint returns only id, title and thumbnail, as the spec asks.
- The error text says "quota or network" for every failure, including 409 `NOT_CONNECTED` / `REAUTH_REQUIRED`. In practice step 1 blocks services that aren't connected.
- Old issues on this base that `main` has already fixed:
  - The first widget on an empty dashboard renders about 2px wide until reload ([11](11-widget-added.png)).
  - Deep links such as `/d/<id>` return Nest's JSON 404 when the built SPA is served from Nest.

## Screenshots

01 Settings step: channel search field
![01](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/01-settings-search-field.png?raw=true)

02 Next without a pick
![02](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/02-next-without-pick.png?raw=true)

03 Searching
![03](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/03-searching.png?raw=true)

04 Results with title and avatar
![04](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/04-results.png?raw=true)

05 No results
![05](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/05-no-results.png?raw=true)

06 API error
![06](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/06-api-error.png?raw=true)

07 Channel picked
![07](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/07-picked.png?raw=true)

08 Refresh step
![08](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/08-refresh-step.png?raw=true)

09 Confirm step
![09](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/09-confirm.png?raw=true)

10 Back to Settings: avatar kept (fixed)
![10](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/10-back-to-settings.png?raw=true)

Mock: picked state
![mock](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/mock-picked-state.png?raw=true)

11 Widget added (old 2px-width bug on this base)
![11](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/11-widget-added.png?raw=true)

12 Widget showing the picked channel's videos
![12](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/12-widget-videos-after-reload.png?raw=true)

13 Configure existing widget
![13](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/13-configure-existing.png?raw=true)
