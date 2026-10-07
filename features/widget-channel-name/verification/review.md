# widget-channel-name: verification

Verdict: **PASS**. All 4 checklist items pass, and both mock states (title available, no title with id fallback) match.

How it was checked:
- `shared` was rebuilt in the worktree first. The worktree has no `node_modules`, so `@dashboard/shared` resolved to the main checkout's stale `dist`. A temporary link pointed it at the worktree's `shared/`. `tsc --listFiles` confirmed `worktree/shared/dist/widgets.d.ts` was the file checked, and the link was removed afterwards.
- UI: the branch ran as its own Docker Compose stack (`wcn-verify`, port 18080), built from the worktree `Dockerfile`. Only the `www.googleapis.com` boundary was faked, through a `--import` preload script, the same way `server/test/youtube-widgets.e2e-spec.ts` does it. Channel `UCq9ZtLabs7x2Kf8wTelemQ` returns snippet title "Telemetry Labs". Channel `UCnoTitle00000000000000` returns no snippet. The admin logged in through the UI, and screenshots were taken with `agent-browser`. The stack, its volumes, the image and the browser session were all removed afterwards.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | ChannelStatsView shows the channel title and no raw channel id in the channel line | PASS | [dashboard-light.png](dashboard-light.png) (top-left card: "Telemetry Labs", no `UC…`), [web-youtube-spec.txt](web-youtube-spec.txt) (`channel_stats: title (not the id) channel…`, channel line text is exactly `Google for Developers`) |
| 2 | LatestVideosView shows the channel title, payload typed in the shared package | PASS | [dashboard-light.png](dashboard-light.png) (middle card: "Telemetry Labs" from the real server payload), `shared/src/widgets.ts` `'youtube.latest_videos': { channelId; channelTitle: string \| null; videos }`, [shared-build.txt](shared-build.txt), [web-typecheck.txt](web-typecheck.txt), [server-typecheck.txt](server-typecheck.txt) (empty = 0 errors), [server-youtube-spec.txt](server-youtube-spec.txt) (`latest_videos … channelTitle: 'Google for Developers'`, requests `part=snippet,contentDetails`) |
| 3 | With no title available the id is shown as fallback | PASS | [dashboard-light.png](dashboard-light.png) and [dashboard-dark.png](dashboard-dark.png) (bottom-left channel stats and right latest videos: `UCnoTitle00000000000000` in mono), [web-youtube-spec.txt](web-youtube-spec.txt) (both `falls back to the channel id when there is no title` tests), [server-youtube-spec.txt](server-youtube-spec.txt) (`latest_videos reports a missing channel title as null`) |
| 4 | Specs updated; web and server tests, typecheck and lint pass | PASS | [web-tests.txt](web-tests.txt) (42 files / 309 tests passed), [server-tests.txt](server-tests.txt) (66 files / 728 passed), [server-youtube-e2e.txt](server-youtube-e2e.txt) (YouTube e2e 19/19 passed), [web-typecheck.txt](web-typecheck.txt), [server-typecheck.txt](server-typecheck.txt), [web-lint.txt](web-lint.txt), [server-lint.txt](server-lint.txt) (exit 0, 0 errors) |

## Notes (not contract misses)

- Channel-line styling differs from the mock. The mock draws the channel stats title as a bold 0.875rem label beside the 40px avatar. The app shows it as the small muted channel line above the avatar. `mocks/index.html` already had this layout before this feature, so the branch did not introduce it.
- The server's `channel_stats` maps a missing snippet to `title: ''`, and the web treats that as falsy and falls back. No server unit test covers `channel_stats` with a missing snippet. Only `latest_videos` has the null-title test. The end-to-end run above shows the fallback works.
- `server/test/youtube-widgets.e2e-spec.ts` was not extended to assert `channelTitle` in the `latest_videos` event. It still passes.
- `toVideo` gained a stray `snippet?.thumbnails?.default` even though `snippet` is non-optional there. It is harmless but inconsistent with the two `snippet.thumbnails?.…` beside it.
- Payloads cached in Redis before deploy have no `channelTitle`. They render the id until the next refresh, about 10 minutes at the minimum rate.
- Lint warnings: web 1, server 32. None are in files this branch touches.
- `features/` is in `.gitignore`, so this folder needs `git add -f` to land on the branch.
- The e2e harness hardcodes `<repo>/node_modules/.bin/prisma` (`server/test/testcontainers.ts`). It fails in a worktree without its own `node_modules`. A temporary symlink was used and then removed.

## Screenshots

App, light theme. Title available (left top, middle) and id fallback (left bottom, right):

![dashboard light](https://github.com/tekClovis/dashBoard/blob/feature/widget-channel-name/features/widget-channel-name/verification/dashboard-light.png?raw=true)

App, dark theme:

![dashboard dark](https://github.com/tekClovis/dashBoard/blob/feature/widget-channel-name/features/widget-channel-name/verification/dashboard-dark.png?raw=true)

Mock, "Title available":

![mock title](https://github.com/tekClovis/dashBoard/blob/feature/widget-channel-name/features/widget-channel-name/verification/mock-title.png?raw=true)

Mock, "No title (id fallback)":

![mock no title](https://github.com/tekClovis/dashBoard/blob/feature/widget-channel-name/features/widget-channel-name/verification/mock-no-title.png?raw=true)
