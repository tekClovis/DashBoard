# steam-widgets review (round 2)

Branch `feature/steam-widgets` at `d280f2d`: `45f4237` (feature) plus `d280f2d` (D1 fix), on top of merge-base `0d46a0b`. This is an independent review. I did not rely on the builder's claims or on round 1's evidence; everything below was re-run.

## Verdict: PASS

- All 8 checklist items pass.
- Scope, Non-goals and Constraints hold.
- Round 1's D1 is fixed in `d280f2d`. It is fixed on the server and on the web, and every bypass variant I tried is covered.
- No blocking defects remain. The non-blocking notes are listed below.

## Commands run

| Check | Result |
|---|---|
| `npm test` (server unit + web) | server: 19 files, 134 tests passed. web: 18 files, 55 tests passed. |
| `npm run test:e2e` (Testcontainers) | 9 files, 82 tests passed, including `steam-widgets.e2e-spec.ts` 7/7 |
| `tsc --noEmit` on server and web | exit 0 for both |
| `npm run lint` (oxlint) | exit 0 with warnings only. The branch adds one: `server/test/steam-widgets.e2e-spec.ts:243` (unbound-method). |

## Probe setup

**Server**
- Production build: `npm run build -w server`, then `NODE_ENV=production node dist/main.js`, so no fake widgets are registered.
- It ran against throwaway `postgres:16-alpine` and `redis:7-alpine` containers, migrated with `prisma migrate deploy`.

**Stub**
- No real Steam key exists, so a `--import` preload replaced `globalThis.fetch` for `api.steampowered.com` only. The probe key was an 18-character dummy.
- The stub logged each request with the key redacted to its length.
- The two hang cases were served by a real local HTTP socket, so undici's own abort path was exercised.
- The same preload remapped `listen(8080)` to 8091, because another worktree's stack held 8080. No app code was changed.

**Web**
- The real Vite dev app, with its proxy pointed at 8091.
- Screenshots were taken in headless Chrome (`/usr/bin/google-chrome` driven by playwright-core). External navigations were blocked.

**Steam connection**
- The steam connection was created by inserting the `ServiceConnection` row directly, with the same fields `ConnectionsService.upsertSteamConnection` writes. The real OpenID handshake needs steamcommunity.com.
- e2e test `2.` drives that upsert through the service.

**Real Steam, keyless, for upstream semantics only**
- `GetNewsForApp?appid=999999999` → `403`.
- `appid=620` → 200, and every item url is `https://steamstore-a.akamaihd.net/...`.

## Checklist

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `/about.json` lists `steam` with `recently_played` and `game_news` | PASS | Production boot: `services:[{name:"steam",widgets:[recently_played{number:integer}, game_news{app_id:integer,number:integer}]}]`, and steam is the only service. e2e `1. /about.json lists steam…` |
| 2 | Catalog shows `connected:false`, then `true` after connecting | PASS | Probe: before `{connected:false,connection:"openid",status:"OK"}`, after `{connected:true,status:"OK"}`. `DELETE /api/connections/steam` → 200 and then `connected:false`. Unauthenticated → 401. e2e `2.` |
| 3 | `recently_played` returns up to `number` games | PASS | `number:5` → 3 games; `number:2` → 2 games (`slice(0,count)`, `steam.widgets.ts:50`). The stub log shows `steamid=76561198000000001&count=5`. The SteamID comes from `ctx.externalAccountId` (`steam.widgets.ts:42,98-101`), which `FetchService` fills from the connection row it already loads (`fetch.service.ts:35,46`). e2e `3 + 8.` |
| 4 | `game_news` returns up to `number` items | PASS | `app_id:620, number:2` → 2 items `{id,title,url,feedLabel,date(ISO)}`. e2e `4.` |
| 5 | Unconnected user → `NOT_CONNECTED` | PASS | Both widgets emit `widget:error {code:"NOT_CONNECTED", message:"No steam connection for this user."}` with no `retryAt`. e2e `5.` |
| 6 | Unknown `app_id` → `INVALID_PARAMS` | PASS | `app_id:999999999` → `INVALID_PARAMS "Unknown Steam app_id 999999999"` with no retry. The 403 mapping is at `steam.widgets.ts:76,125`, and it matches real Steam's 403. e2e `6.` |
| 7 | `STEAM_API_KEY` unset: still listed, fetch → `UPSTREAM_ERROR` | PASS | Real process with the variable unset: `/about.json` 200 lists steam, `/api/catalog` 200 lists steam. Both widgets emit `UPSTREAM_ERROR "Steam API not configured"` with `retryAt`. The stub log recorded zero upstream calls (fails fast, `steam.widgets.ts:122`). No 5xx, and nothing error-level in the server log. e2e `7.` |
| 8 | Cache key has the `:conn:{connectionId}` suffix | PASS | Redis `--scan`: 5 keys `widget:steam.{recently_played,game_news}:<sha>:conn:96c818af-…`, equal to the `ServiceConnection.id`. Reconnecting created a new id (`2d49260e-…`), so reconnected users get new keys. |

## Other probes

### D1 fix (`d280f2d`), verified independently

**Server** (`steam.widgets.ts:83,103-110`): `new URL(url).protocol ∈ {http:, https:}`, checked before `slice`.

I stubbed `app_id:700` to return 13 items, ignoring `count`. These 9 were dropped:

| Input url | Why it was dropped |
|---|---|
| `JAVASCRIPT:alert(1)` | protocol is `javascript:` (WHATWG lower-cases the scheme) |
| `"  javascript:…"` (leading spaces) | leading whitespace is stripped, then `javascript:` |
| `"\u0001\u0000\tjavascript:…"` (leading control characters) | leading control characters are stripped, then `javascript:` |
| `java\tscript:…` (embedded tab) | the tab is removed, then `javascript:` |
| `//evil.example/x` | `new URL` throws (no base) |
| `https:` (no host) | throws |
| `vbscript:msgbox(1)` | `vbscript:` |
| `data:text/html,<script>…` | `data:` |
| `url: null` | throws |

Kept:
- The two real `https://` and `http://` items.
- `https:evil.example` and `" https://ok.example"`. Both are genuinely http(s), so nothing script-capable gets through.

**Web** (`steam.tsx:181`): `/^https?:\/\//i` is stricter than the server check.
- In the real browser (`03-d1-probe.png`), those two borderline items render as `<span>`. Only the two good items are `<a>`, with `href` `https://store.steampowered.com/news/g1` and `http://…/g2`.
- Clicking every row raised no dialog and made no non-http navigation.
- Running the same regex over the full bypass list, plus `http:\\evil` and `https:/\evil`, turns only `http(s)://…` prefixes into links.
- The web check also covers any pre-fix payload still in Redis (TTL up to 900 s).

Tests: unit `game_news › drops items whose url is not http(s)` and web `renders a non-http(s) news url as plain text, not a link`.

### Does dropping items break anything?

- Nothing breaks.
- The filter runs before `slice`, so the output is still at most `number` items.
- An all-dropped response renders the existing "No news for this game." empty state.
- Real Steam urls are https, so in practice nothing is dropped.
- Side effect: Steam is asked for exactly `count=number`, so any dropped item makes the list shorter (see note 3).

### Parameter bounds

These all return 400:
- `number` 0, 11, `"x"`, 2.5, or missing
- `app_id` missing, 0, or -3
- `refreshRate` 599 on `recently_played` and 899 on `game_news`

An unknown extra param is stripped: `201` is returned with params `{app_id,number}`. The `/api/catalog` ParamSpecs match Architecture §3: `number` integer 1–10, required, default 5; `app_id` integer, required, min 1; `minRefreshSec` 600 and 900.

### Upstream failures

Every case gives `UPSTREAM_ERROR` with `retryAt`.

| Case | Message | Time |
|---|---|---|
| 500 | "Steam API responded 500." | — |
| Malformed body | "Malformed Steam API response." | — |
| Network error | "fetch failed" | — |
| Headers never sent | "The operation was aborted due to timeout" | 10.98 s |
| Body stalls after headers | "Malformed Steam API response." | 10.98 s, so the timeout covers the body read too |
| JSON `null` | raw `TypeError` text | — |
| `[null]` item | raw `TypeError` text | — |
| Invalid date | raw "Invalid time value" | — |

### Key secrecy

I searched for the probe key string in:
- both server logs
- every Redis key and value
- every socket payload and probe output

It appeared in none of them. The key only appears in the outbound Steam URL (`steam.widgets.ts:123`), and no path puts that URL into an error message.

### Production registration

`SteamModule` is imported in `AppModule` (`app.module.ts:39`). It registers `{name:'steam',connection:'openid'}` and both widgets in `onModuleInit` (`steam.module.ts:17-21`). Verified with `NODE_ENV=production`.

### Scope and constraints

- No changes to `connections-api` or the OpenID handshake.
- No token decryption for Steam; `accessTokenEnc` is null, so it stays `undefined`.
- No new Prisma query. `FetchContext.externalAccountId` comes from the row `FetchService` already reads, and connections-api exposes no `externalAccountId` accessor.
- `d280f2d` touches only the 4 steam files.
- Out-of-feature edits follow from registering a real service:
  - the `FetchContext` field and the `FetchService` line
  - `about.e2e` now allows any `services` array
  - `catalog.e2e` changed `toEqual` → `toContainEqual`

## UI vs mock

All screenshots are my own, from headless Chrome of the real app shell and widget grid (`/d/:id`):

- `00-mock.png`: `mock.html`.
- `01-built-connected.png`:
  - `recently_played` shows Half-Life 2 3.2 hrs, Portal 2 1.5 hrs, Stardew Valley 6.8 hrs.
  - `game_news` 620 shows "Community update: new Workshop maps" 2d ago and "Patch notes 1.12" 9d ago.
  - The `app_id 999999999` card shows "Error: Unknown Steam app_id 999999999".
- `02-built-not-connected.png`: after disconnecting, every Steam card shows the existing `WidgetFrame` "Reconnect required: No steam connection for this user. / Reconnect" state.
- `03-d1-probe.png`: the D1 bypass probe card. It shows 4 rows; only the two GOOD rows are links.

All four mock states are present, with the same data shape and ordering. The card title (`steam.recently_played`) and the error/reconnect wording come from the existing `WidgetFrame` chrome. The spec says "no new UI chrome", so this is expected.

Stale files: the builder's `01-built-widgets.png` stays deleted (it had no app shell or grid), and round 1's `03-xss-probe.png` was replaced by `03-d1-probe.png`.

## Defects

None open.

## Non-blocking notes

1. **Direct edit instead of `declare module`.** The spec says the `WidgetDataMap` keys should be added "via `declare module` augmentation". The builder edited the interface body directly and rewrote its comment (`shared/src/widgets.ts`). It works the same way and matches the sibling widget branches. Expect merge conflicts in that file.
2. **Raw error text reaches the client.** Non-`FetchError` exceptions show their raw message to the user, e.g. `Cannot read properties of null (reading 'url')`, "Invalid time value", or "fetch failed". The code is still `UPSTREAM_ERROR` and nothing leaks.
3. **Dropped items shorten the list.** Steam is asked for `count=number`, so any item the filter drops leaves the list short even when more valid items exist. Example: `app_id 701`, `number:3`, with 2 non-http items first → 1 item shown. This is still "up to `number`", and real Steam urls are https.
4. **No "not configured" flag in the catalog.** It does not expose whether `STEAM_API_KEY` is set, so Architecture §11's "not configured" connect button can't be shown for Steam yet. This is not in this spec's checklist.
5. **New lint warning** at `server/test/steam-widgets.e2e-spec.ts:243` (unbound-method).
6. **Pre-existing, not from this branch.** The server needs `GITHUB_CLIENT_ID` and `GOOGLE_CLIENT_ID` set to boot. The probe used dummies.

## Review history

- **Round 1 (`45f4237`): FAIL.** D1: the upstream Steam news `url` reached `<a href>` with no scheme allow-list (`steam.tsx:29`, `steam.widgets.ts:86`).
- **Round 2 (`d280f2d`): PASS.** D1 is fixed and confirmed:
  - the server drops items whose url is not http(s)
  - the web renders a link only for an `http(s)://` prefix
  - every bypass variant above is covered, and there are regression tests on both sides
