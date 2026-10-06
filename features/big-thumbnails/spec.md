## Scope
Show thumbnail images in YouTube and Steam widgets. Add image URL fields to `YoutubeVideo`, `SteamNewsItem` and `SteamRecentGame` in `shared/src/widgets.ts`. Fill them server-side: YouTube from `snippet.thumbnails` (`server/src/services/youtube/youtube-widgets.ts`), Steam from `https://cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg` (`server/src/services/steam/steam.widgets.ts`). Render them in `web/src/widgets/youtube.tsx` and `web/src/widgets/steam.tsx`, reusing `web/src/widgets/parts.tsx`.

## Non-goals
- New widget types.
- Image caching or proxying.

## Verification checklist
1. Shared widget types include an image URL field for YouTube videos and Steam games/news items.
2. Server unit tests assert the YouTube thumbnail URL is mapped from `snippet.thumbnails` and the Steam image URL is built from the app id.
3. In the browser, every row of a YouTube widget shows an `<img>` that loads (naturalWidth > 0).
4. In the browser, every row of each Steam widget shows an `<img>` that loads (naturalWidth > 0).
5. A missing/broken image falls back gracefully (no broken-image icon, row text still shown).
6. Unit, e2e, typecheck and lint pass.

## Constraints
- Reuse existing widget row components in `web/src/widgets/parts.tsx`.
