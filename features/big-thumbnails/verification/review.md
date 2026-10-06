# big-thumbnails: verification (re-review)

**Verdict: FAIL.** Checklist item 4 now fails. To match the mock, commit `9172050` moved the Steam Game news image out of the rows and into one header image. The news rows no longer have an `<img>`, but the spec asks for one on every row of each Steam widget. The mock's Loaded layouts for the video rows and the channel avatar also still differ from the branch.

How it was tested: this branch was built and served by Nest on :8081, using a throwaway Postgres DB (`bigthumbs_review`) and Redis db 7 on the existing compose containers. A confirmed user was given YouTube and Steam `ServiceConnection` rows. Widget payloads with real CDN image URLs were put in the server's Redis fetch cache under its `widget:{service}.{widget}:{hash}:conn:{id}` keys. The pages were driven with `agent-browser`. The error state is real: the YouTube cache was cleared and the widgets re-subscribed, and the server answered REAUTH_REQUIRED. Everything that was started was stopped afterwards, and the DB and Redis db were dropped.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Shared widget types include an image URL field for YouTube videos and Steam games/news items | PASS | `shared/src/widgets.ts`: `SteamRecentGame.imageUrl`, `SteamNewsItem.imageUrl`, `YoutubeVideo.imageUrl` (plus `YoutubeChannelStats.imageUrl`). [typecheck.txt](typecheck.txt) |
| 2 | Server unit tests assert the YouTube thumbnail is mapped from `snippet.thumbnails` and the Steam image URL is built from the app id | PASS | `youtube-widgets.spec.ts` (medium, falling back to high, then default, else null; avatar from `thumbnails.default`) and `steam.widgets.spec.ts` (`header(appId)` for both widgets). [server-thumbnail-tests.txt](server-thumbnail-tests.txt): 2 files, 53/53 pass |
| 3 | Every row of a YouTube widget shows an `<img>` that loads (naturalWidth > 0) | PASS | [browser-images-loaded.txt](browser-images-loaded.txt) / [.json](browser-images-loaded.json): Latest videos 5/5 rows and Trending 5/5 rows have naturalWidth 320. [widgets-loaded.png](widgets-loaded.png) |
| 4 | Every row of **each** Steam widget shows an `<img>` that loads (naturalWidth > 0) | **FAIL** | Recently played: 5/5 rows load (naturalWidth 460). **Game news: 0/3 rows have an `<img>`** ("NO THUMB" for every row in [browser-images-loaded.txt](browser-images-loaded.txt)). The only image is a single 128x60 `game-id` header. `web/src/widgets/steam.tsx` `GameNewsView` renders `<Thumb src={items[0]?.imageUrl} …/>` once, above the list, and nothing inside `<Row>`. [widgets-loaded.png](widgets-loaded.png) |
| 5 | A missing or broken image falls back gracefully (no broken-image icon, row text still shown) | PASS | [browser-images-broken.txt](browser-images-broken.txt) and [widgets-broken.png](widgets-broken.png). A `null` URL and Steam 404s (apps 1 and 2) all become a hatched `data-state=failed` tile with an image-off icon in a fixed-size box, and the title is still shown. No `<img>` with naturalWidth 0 is left in the DOM |
| 6 | Unit, e2e, typecheck and lint pass | PASS | [unit-tests.txt](unit-tests.txt): server 651/651, web 224/224. [e2e.txt](e2e.txt): 12 files, 114/114. [typecheck.txt](typecheck.txt): shared, server and web exit 0. [lint.txt](lint.txt): exit 0, warnings only, none in the changed files |

## Mock contract (`features/big-thumbnails/mock.html`)

| Mock flow/state | Result | Evidence |
|---|---|---|
| Error band with previous data: old images turn grey | PASS (fixed) | [browser-images-error-previous-data.txt](browser-images-error-previous-data.txt): every image under "Last data from" has `filter: grayscale(1)` and `opacity: 0.55`. [widgets-error-previous-data.png](widgets-error-previous-data.png) vs [mock-error-previous-data.png](mock-error-previous-data.png) |
| Steam Game news: 128x60 header in a `game-id` block next to the stat, no row thumbnails | PASS (fixed) | [widgets-loaded.png](widgets-loaded.png). This conflicts with checklist item 4, see above |
| Image slots: 80x45 (latest), 144x81 for #1 and 64x36 for the rest (trending), 64x30 (recently played), 40x40 round avatar | PASS | [browser-images-loaded.txt](browser-images-loaded.txt) |
| Failed images: hatched tile with an image-off glyph | PASS | [widgets-broken.png](widgets-broken.png) |
| Loading skeleton keeps the image-slot shapes | PASS (fixed) | [browser-loading-skeleton.json](browser-loading-skeleton.json), [widgets-loading.png](widgets-loading.png) vs [mock-loading.png](mock-loading.png). Socket.io was blocked to hold the waiting state. The slot sizes match. The stat skeleton next to the news header collapses to 0 px wide in both the app and the mock |
| Trending at container width ≤ 340px: ranked thumbnails hidden | PASS (fixed) | [browser-trending-narrow.txt](browser-trending-narrow.txt): with the article 308px wide, #2–#5 are `display:none` and #1 is still 144x81. [widgets-trending-narrow.png](widgets-trending-narrow.png) |
| **Loaded layouts: video rows, trending #1, channel avatar** | **FAIL** | Compare [mock-loaded.png](mock-loaded.png) with [widgets-loaded.png](widgets-loaded.png). (a) In the mock, Latest videos rows stack the title (2-line clamp) above "3h ago". The app shows them on one line. (b) In the mock, Trending #1 is a featured block: big `#1`, then title, then channel, stacked beside the image, and ranked rows stack title over channel. The app shows them inline, so at narrow widths the #1 title is cut to "Me…" ([widgets-trending-narrow.png](widgets-trending-narrow.png)). (c) In the mock, the channel avatar sits beside the channel title and id (`chan-id`). The app puts it on its own line under the title row |

## Notes (not contract misses)

- The spec and mock disagree on Game news: the spec wants per-row images, the mock wants one header. Pick one and update the other before re-implementing.
- `TimerService.reconfigure()` is never called, so changing a widget's refresh rate (PATCH) does not refetch until it is re-subscribed. This existed before this branch.
- `Thumb` resets its state with `useEffect(() => setState('loading'), [src])` after mount. A cached image that fires `load` first could get stuck pulsing. This was not seen in testing.
- `i.ytimg.com` answers a missing video id with a 404 that has a grey placeholder image body, so the row shows `loaded` (naturalWidth 120) and not the failed tile. That is a YouTube CDN behaviour.
- A hard load of a deep link (`/d/:id`) returns Nest 404 JSON (no SPA fallback). This was seen before and is unrelated to this feature.

## Screenshots

Loaded (app):
![widgets-loaded](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/widgets-loaded.png?raw=true)

Loaded (mock):
![mock-loaded](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/mock-loaded.png?raw=true)

Broken or missing images (app):
![widgets-broken](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/widgets-broken.png?raw=true)

Error band with previous data (app):
![widgets-error-previous-data](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/widgets-error-previous-data.png?raw=true)

Error band with previous data (mock):
![mock-error-previous-data](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/mock-error-previous-data.png?raw=true)

Loading skeleton (app):
![widgets-loading](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/widgets-loading.png?raw=true)

Loading skeleton (mock):
![mock-loading](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/mock-loading.png?raw=true)

Trending at a 308px container (app):
![widgets-trending-narrow](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/widgets-trending-narrow.png?raw=true)
