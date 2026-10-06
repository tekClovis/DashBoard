# big-thumbnails: verification (re-review after `0fcb688`)

**Verdict: PASS.** All six checklist items pass. In the previous review, item 4 failed because Steam Game news rows had no image. `0fcb688` adds a 64x30 `<Thumb src={item.imageUrl}>` to every news `<Row>` in `web/src/widgets/steam.tsx` and keeps the 128x60 header image. The mock still shows a different layout, but the spec does not require it, so those differences are listed as notes.

How it was tested: unit, e2e, typecheck and lint were run on this branch. For the browser items, the branch's real view components (`getView('youtube'|'steam', …)` from `web/src/widgets/registry.tsx`, with `web/src/index.css`) were built with Vite into a throwaway page outside the repo. The page fed them payloads with real CDN URLs (`i.ytimg.com/vi/{id}/mqdefault.jpg` and `cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg`). It was driven with `agent-browser`: the page was scrolled to trigger `loading="lazy"`, then every `<li>` was measured. The `?broken` variant uses a `null` URL and Steam 404s (apps 1 and 2) for the first rows. Everything that was started was stopped afterwards.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Shared widget types include an image URL field for YouTube videos and Steam games/news items | PASS | `shared/src/widgets.ts`: `SteamRecentGame.imageUrl`, `SteamNewsItem.imageUrl` and `YoutubeVideo.imageUrl` (plus `YoutubeChannelStats.imageUrl`). Shared, server and web all compile: [typecheck.txt](typecheck.txt) |
| 2 | Server unit tests assert the YouTube thumbnail is mapped from `snippet.thumbnails` and the Steam image URL is built from the app id | PASS | `server/src/services/youtube/youtube-widgets.spec.ts` ("maps the best available snippet.thumbnails size to imageUrl…") and `server/src/services/steam/steam.widgets.spec.ts` (`header(appId)` for both widgets). [server-thumbnail-tests.txt](server-thumbnail-tests.txt): 2 files, 53/53 pass |
| 3 | Every row of a YouTube widget shows an `<img>` that loads (naturalWidth > 0) | PASS | [browser-images-loaded.txt](browser-images-loaded.txt): every row loads with naturalWidth 320. Latest videos 5/5 rows (80x45). Trending 5/5 rows (#1 144x81, others 64x36). [widgets-loaded.png](widgets-loaded.png) |
| 4 | Every row of **each** Steam widget shows an `<img>` that loads (naturalWidth > 0) | PASS (fixed) | [browser-images-loaded.txt](browser-images-loaded.txt): every row loads with naturalWidth 460. Recently played 5/5 rows (64x30). Game news 3/3 rows (64x30), plus the 128x60 header. [widgets-loaded.png](widgets-loaded.png). The web unit test `steam.spec.tsx` now asserts the row `<img>` |
| 5 | A missing or broken image falls back gracefully (no broken-image icon, row text still shown) | PASS | [browser-images-broken.txt](browser-images-broken.txt): the `null` URL and Steam 404 rows become `data-state=failed`, with no `<img>` left and an image-off glyph in a fixed-size hatched tile. There are 0 `<img>` elements with naturalWidth 0, and all row titles and metadata are still shown. [widgets-broken.png](widgets-broken.png) |
| 6 | Unit, e2e, typecheck and lint pass | PASS | [unit-tests.txt](unit-tests.txt): server 651/651, web 224/224. [e2e.txt](e2e.txt): 12 files, 114/114. [typecheck.txt](typecheck.txt): shared, server and web all exit 0. [lint.txt](lint.txt): exit 0. It reports only `unbound-method` warnings, all in spec files that this feature did not change |

## Notes (not contract misses)

- **Differences from the mock that the spec does not require** (compare [mock.png](mock.png) with [widgets-loaded.png](widgets-loaded.png)):
  - Game news: the mock shows one header image and no image per row. The branch now shows both, as checklist item 4 requires. The spec and the mock still disagree here, so one of them should be updated.
  - Latest videos: the mock stacks the title (clamped to 2 lines) above the age. The app shows them on one line.
  - Trending #1: the mock shows a featured block, with a big `#1` and then the title and channel stacked beside the image. The app shows #1 inline like the other rows, with a bigger thumbnail.
  - Channel stats: in the mock, the avatar sits beside the channel title and id.
- This re-review did not run the server or Redis again. Since `9172050`, the only code change is one line in `steam.tsx` plus its spec. So the mock-state checks done against the full stack in the previous review were not repeated: grey images under the error band, skeleton image slots, and narrow trending.
- `Thumb` resets its state with `useEffect(() => setState('loading'), [src])` after mount. If a cached image fires `load` before that effect runs, the image would still show but its slot could keep pulsing. This was not seen in testing.
- `i.ytimg.com` answers an unknown video id with a 404 that still has a grey placeholder image body (naturalWidth 120), so the row shows as `loaded` and not as the failed tile. This is how the YouTube CDN behaves, not a bug in the branch.
- Existing issues unrelated to this feature: `TimerService.reconfigure()` is never called. A hard load of `/d/:id` returns Nest 404 JSON.

## Screenshots

Loaded (app):
![widgets-loaded](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/widgets-loaded.png?raw=true)

Broken or missing images (app):
![widgets-broken](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/widgets-broken.png?raw=true)

Mock (Loaded):
![mock](https://github.com/tekClovis/dashBoard/blob/feature/big-thumbnails/features/big-thumbnails/verification/mock.png?raw=true)
