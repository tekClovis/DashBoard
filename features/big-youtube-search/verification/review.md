# big-youtube-search: verification

**Verdict: PASS.** I checked `feature/big-youtube-search` @ `8bee307`. All six checklist items pass, and so do the mock's channel-search states (idle, searching, results, no results, API error, picked). The avatar regression from the last review is fixed. Channel avatars are now round: 32×32 in the result rows and 40×40 in the picked card, which I measured in the DOM.

**How it was run:**
- I built the worktree with `npm run build` and served it from Nest with the SPA in `server/public`. The build hardcodes :8080, so a `node --import` preload moved it to :8093.
- Postgres and Redis came from the running compose stack, with a throwaway `yt_review` database (dropped afterwards).
- The same preload faked Google's HTTP boundary (`www.googleapis.com`, `oauth2.googleapis.com`). In the fake, queries containing `err` return HTTP 500 and `zzqxv` matches nothing. `UC_tele4` has no thumbnail, and the other avatars are square 88×88 https images.
- No app code was changed.
- The user's email was confirmed directly in the database, and I added a `youtube` ServiceConnection row for them.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Search endpoint returns several channels (id, title, thumbnail) for a channel-name query | PASS | [api-search.txt](api-search.txt): `q=tele` returns 200 with 4 channels holding `id`/`title`/`thumbnail`. The channel without an avatar has no `thumbnail` key. `zzqxv` returns 200 `[]`, `q=t` returns 400 `INVALID_QUERY`, an upstream 500 becomes 502 `UPSTREAM_ERROR`, and a request with no session returns 401. Upstream call: `/youtube/v3/search?part=snippet&type=channel&q=…&maxResults=8`. Tests: [unit-youtube-search-verbose.txt](unit-youtube-search-verbose.txt), plus the two `search.` cases in [e2e.txt](e2e.txt) |
| 2 | Channel field is a search input; no raw channel-ID text field remains | PASS | [01](01-settings-search-field.png): the a11y tree for the Settings step is `combobox "Channel"` + `spinbutton "Videos"`. Configuring an existing widget shows the picker card, not a textbox ([13](13-configure-existing.png)) |
| 3 | Typing a channel name lists matching channels with title and avatar | PASS | [03](03-searching.png) shows the searching state. [04](04-results.png) shows 4 options with title and id, plus a round 32px avatar for each of the 3 channels that have one. Mobile and dark theme: [16](16-mobile-dark-results.png). Tests: [unit-web-search-verbose.txt](unit-web-search-verbose.txt) |
| 4 | Picking a channel and saving creates a widget whose params hold that channel's id, and the widget shows its videos | PASS | [07](07-picked.png) shows the pick (40px round avatar). [09](09-confirm.png) shows the confirm step as `Telemetry Daily channel_id=UC_tele2`. [10](10-back-to-settings.png): after Back, Back the pick is kept. [11](11-widget-added.png) and [12](12-widget-videos.png) show Latest videos listing the `UU_tele2` uploads (all 5 links are in the DOM). [15](15-channel-stats-widget.png) shows Channel stats for `UC_lofi1`, picked with the keyboard (ArrowDown + Enter). DB rows are in [saved-widget-params.txt](saved-widget-params.txt) |
| 5 | No results or API error shows a clear message in the dialog | PASS | [05](05-no-results.png): "No channels match “zzqxv”. Check the spelling, or try another channel." [06](06-api-error.png): "Channel search is unavailable. Try again in a moment." with **Retry**. Clicking Retry sends the request again (1 → 2 upstream calls) |
| 6 | Unit, e2e, typecheck and lint pass | PASS | Unit: [unit-server.txt](unit-server.txt) 706/706 (64 files), [unit-web.txt](unit-web.txt) 277/277 (39 files). e2e: [e2e.txt](e2e.txt) 130/130 (13 files). Typecheck: [server](typecheck-server.txt) and [web](typecheck-web.txt) both exit 0. Lint: [lint.txt](lint.txt) exits 0, with 31 warnings and none in this feature's files |
| – | Mock flows and states (`mock.html`) | PASS | Results: [04](04-results.png) vs [mock](mock-results-state.png). Picked: [07](07-picked.png) vs [mock](mock-picked-state.png). No results: [05](05-no-results.png) vs [mock](mock-empty-state.png). Error: [06](06-api-error.png) vs [mock](mock-error-state.png). Searching: [03](03-searching.png) vs [mock](mock-loading-state.png). Change clears the pick and focuses an empty search input, and Next is then blocked with "Pick a channel from the results." The confirm step puts the title before `channel_id=`, as the mock does |

## Notes (not contract misses)

- **Copy differs from the mock** because the feature reuses the shared `SearchPicker` (spec constraint):
  - The picked state has no "Channel selected. Its ID is saved with the widget." status line.
  - There is no "Search by channel name" hint under the label.
  - The status reads "Searching…" / "4 channels. Pick one."
  - The loading skeleton has no round avatar placeholder.
- **The mock's result rows show subscriber counts.** The spec limits the endpoint to id, title and thumbnail.
- **A channel without an avatar gets no placeholder slot** in the list, so its title is not aligned with the other rows ([04](04-results.png), 4th row). The mock keeps a fixed 32px slot, with an image-off icon when the image fails to load.
- **Reconfiguring to an avatar-less channel saves cleanly**, with no stale `channel_image` ([14](14-picked-no-avatar.png), [saved-widget-params.txt](saved-widget-params.txt)). Widgets saved before this feature hold only `channel_id`, so the dialog shows the bare id as their title.
- **Quota:** each settled query (250 ms debounce, 2+ letters) is a `search.list` call, which costs 100 YouTube quota units.
- **Not verified against the real API:** YouTube's `search.list` is known to HTML-escape `snippet.title` (for example `&amp;`), and the server passes the title through unchanged.
- **One error message for every failure:** `channel_image` is restricted to `^https://`. The error copy is the same for 409 `NOT_CONNECTED`/`REAUTH_REQUIRED` and for 429, even though "try again" doesn't help in those cases.
- **Not this feature:**
  - The Latest videos widget header shows the channel id (`UC_tele2`), where the mock shows the channel title.
  - Hard-reloading a deep link (`/d/<id>`) returns Nest's JSON 404 when the SPA is served from Nest.
- **Lockfile mismatch:** `package-lock.json` pins `web/node_modules/vitest` at 5.0.1, but `web/package.json` asks for `^4.1.2`.

## Screenshots

01 Settings step: channel search field
![01-settings-search-field](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/01-settings-search-field.png?raw=true)

02 Next without a pick
![02-next-without-pick](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/02-next-without-pick.png?raw=true)

03 Searching
![03-searching](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/03-searching.png?raw=true)

Mock: searching
![mock-loading-state](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/mock-loading-state.png?raw=true)

04 Results with round avatars
![04-results](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/04-results.png?raw=true)

Mock: results
![mock-results-state](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/mock-results-state.png?raw=true)

05 No results
![05-no-results](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/05-no-results.png?raw=true)

Mock: no results
![mock-empty-state](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/mock-empty-state.png?raw=true)

06 API error
![06-api-error](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/06-api-error.png?raw=true)

Mock: API error
![mock-error-state](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/mock-error-state.png?raw=true)

07 Channel picked
![07-picked](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/07-picked.png?raw=true)

Mock: picked
![mock-picked-state](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/mock-picked-state.png?raw=true)

08 Refresh step
![08-refresh-step](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/08-refresh-step.png?raw=true)

09 Confirm step
![09-confirm](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/09-confirm.png?raw=true)

10 Back to Settings keeps the pick
![10-back-to-settings](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/10-back-to-settings.png?raw=true)

11 Widget added
![11-widget-added](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/11-widget-added.png?raw=true)

12 Widget showing the channel's videos
![12-widget-videos](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/12-widget-videos.png?raw=true)

13 Configure existing widget
![13-configure-existing](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/13-configure-existing.png?raw=true)

14 Picked channel without avatar
![14-picked-no-avatar](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/14-picked-no-avatar.png?raw=true)

15 Channel stats widget
![15-channel-stats-widget](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/15-channel-stats-widget.png?raw=true)

16 Mobile, dark: results
![16-mobile-dark-results](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/16-mobile-dark-results.png?raw=true)

17 Mobile, dark: picked
![17-mobile-dark-picked](https://github.com/tekClovis/dashBoard/blob/feature/big-youtube-search/features/big-youtube-search/verification/17-mobile-dark-picked.png?raw=true)

