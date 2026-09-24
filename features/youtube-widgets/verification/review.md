# youtube-widgets review (round 5)

**Verdict: PASS.** All 10 checklist items pass, and D4 is **closed**. No path in this feature now puts a token's plaintext, a ciphertext, an id, a server path or stack text into a client-visible message. D1, D2a, D2b and D3 are still fixed, and the per-user refresh dedupe still makes one token exchange for three widgets. No new blocking defect was found. The non-blocking notes are listed below.

Branch `feature/youtube-widgets` is `00ceab3` + `b75e123` + `85c7560` + `fd8a26c` + `708ac8b` + `ef35474`, on top of `main`. `00ceab3` is still only the `}` that closes `GithubSecurityAlert`.

## How it was verified

- **Suites**, run by the reviewer on this worktree:

  | Suite | Command | Result |
  |---|---|---|
  | Server unit | `npm test -w server` | 22 files, 217 tests passed |
  | Server e2e (Testcontainers) | `npm run test:e2e -w server` | 11 files, 107 tests passed. `youtube-widgets.e2e-spec.ts` has 17 tests and all passed, both in the full run and alone. timer-realtime test 7 did not flake. |
  | Web | `npm test -w web` | 20 files, 63 tests passed |
  | Typecheck | `tsc --noEmit` in `server` and `web` | exit 0 |
  | Lint | `npm run lint` | exit 0. There are 0 youtube warnings. The remaining warnings are pre-existing ones in other files. |

- **Probe e2e.** This was a temporary spec with 9 blocks and about 110 cases. It used the same Testcontainers harness and ran the real Timer → FetchService → `fetch()` → Socket.IO path. The spec has been deleted. Its output is in `probe-e2e-output.txt`.
  - Google was **stubbed**. Global `fetch` was rewritten to point at a local `node:http` stub, but the call still went through the **real** `fetch`. This means undici's header validation ran as it does in production. The round-4 probe did not have this property.
  - **No real Google token was used, and no call reached Google.**
  - A case counts as a leak if the frame contains any of the following:
    - the fake `SECRET` marker
    - a stored ciphertext, or any of its iv, tag or ct parts
    - the user id or the connection id
    - `prisma`, `invocation`, a path, `.ts:` or stack text
    - `Headers.append` or `ByteString` text
- **Live stack.**
  - `server/dist/main.js` was rebuilt and run with `NODE_ENV=production` against throwaway `postgres:16-alpine` and `redis:7-alpine` containers. Both containers have been removed.
  - The web bundle (`web/dist`, rebuilt) was served through a temporary `server/public` symlink, which has been removed.
  - Google was stubbed by a `node --import` preload that routes both Google hosts to a local stub through the real `fetch`. The preload logs only paths and token lengths (`probe-stubbed-google-calls.txt`), and it moved `listen(8080)` to a free port.
  - Users and connections were seeded in SQL and encrypted under a throwaway `TOKEN_ENC_KEY`. Sessions were signed with a throwaway `JWT_SECRET`. Both secrets have been discarded.
  - Dashboards and instances were created through the real REST API, so the param validator ran.
  - Screenshots were taken with headless `/usr/bin/google-chrome`, driven by playwright-core 1.63.0. playwright-core was installed in the reviewer's scratchpad, not in the repo.

## Checklist

| # | Result | Evidence |
|---|---|---|
| 1 | PASS | e2e `1. /about.json lists youtube with its three widgets`. `about-production.json` comes from the production build: `youtube: [channel_stats, latest_videos, trending_videos]`. |
| 2 | PASS | e2e `2. /api/catalog shows youtube connected:false, then connected:true…`. Live `GET /api/catalog`: `noconn` returns `{connection:'oauth', connected:false}` and `ok` returns `{connected:true, status:'OK'}`. |
| 3 | PASS | e2e `3.` passes, and `3b.` shows that an unknown channel gives `INVALID_PARAMS`. Live: `card-ok-channel_stats.png` shows 2.4M / 180M / 412. |
| 4 | PASS | e2e `4.`. Live: the stub returns uploads dated 11d, 2d and 6d ago, and the card shows them as 2d / 6d / 11d (`card-ok-latest_videos.png`). The stub log shows `maxResults=3`. |
| 5 | PASS | e2e `5.`. Live: `card-ok-trending_videos.png` shows #1 and #2, from `videos?chart=mostPopular&regionCode=FR&maxResults=2`. |
| 6 | PASS | e2e `6.`. Live `silent`: all 3 widgets got a 401, and between them they made **one** `POST /token`. All 3 cards render (`card-after-silent-refresh-*.png`). The row ends with status `OK` and `expiresAt` set. |
| 7 | PASS | e2e `7.`. Probe `FE REAUTH (token endpoint 400 invalid_grant)` and `(token endpoint 401)`: both give `REAUTH_REQUIRED` and set the row to `REAUTH`. Live: `card-reauth-*.png` and `services-page-reauth.png`, where the badge shows REAUTH. |
| 8 | PASS | e2e `8.`, with 0 YouTube calls. Live: `card-not-connected-*.png` shows the message "No youtube connection for this user." |
| 9 | PASS | e2e `9.` (`fr`, `FRA`, `F1`). Live REST: `fr`, `FRA`, `F1` and `"US\n"` each get 400 "'region' does not match the required pattern", and a missing region gets 400 "'region' is required". The pattern is `^[A-Z]{2}$` (`youtube-widgets.ts:10`). |
| 10 | PASS | e2e `10.`. Live Redis has 6 keys of the form `widget:youtube.<w>:<sha256>:conn:<uuid>` across 2 connections. The probe's Redis has 19 keys of the same form. No key or value contains token material. |

## D4 re-check (`ef35474`): closed

- **Code:**
  - `send()` now throws the fixed "YouTube request failed." (`youtube-api.ts:71`).
  - The refresher's decrypt and fetch `catch` throws the fixed "Google token refresh failed." (`google-token-refresher.ts:91`).
  - `parseTokenResponse` requires `HEADER_SAFE = /^[\x21-\x7E]+$/` for `access_token` and for a rotated `refresh_token` (`:25`, `:36`, `:41`).
- **Grep of every client-visible string** in `server/src/services/youtube/`:
  - The only interpolations left are `HTTP ${res.status}` (`youtube-api.ts:84`, `google-token-refresher.ts:100`) and the user's own `channel_id` (`youtube-widgets.ts:39`; see note 3).
  - No code in the directory reads `err.message` any more.
  - The branch's only change to FetchService is `expiresAt` (`fetch.service.ts:46`), which reaches no message.
- **Tokens from the refresh endpoint** (probe `D4a` and `D4b`). The cases were `\n`, `\r`, NUL, space, `é`, `€`, a trailing tab, 20 kB and 1 MB, for `access_token` on all 3 widgets (newline and NUL) and for a rotated `refresh_token`.
  - Every invalid value gives the fixed `UPSTREAM_ERROR` "Google token endpoint returned an invalid response.", the row is unchanged, and `leak=false`.
  - The 20 kB and 1 MB tokens are header-safe, so they are stored. The stub (default 16 kB header limit) answers 431, and the client sees "YouTube responded with HTTP 431." with no leak. See note 1.
- **Tokens pre-stored through the connect path** (probe `D4c`, via `ConnectionsService.upsertOAuthConnection`). The same values were used, with newline on all 3 widgets.
  - `\n`, `\r`, NUL and `€` are rejected by undici before any network I/O (`ytCalls=0`). The client sees the fixed "YouTube request failed." with `leak=false`.
  - Space, `é` and tab are valid header values, so they are sent and data is served.
  - The long tokens give HTTP 431.
- **Refresh tokens pre-stored with those values** (probe `D4d`) are sent URL-encoded in the POST body, so the exchange works and no text is echoed.
- **`superseded()` handing back a reconnected newline token** (probe `D4e`) gives "YouTube request failed." with no leak.
- **Live, production build:**
  - `d4` is a token-endpoint 200 whose `access_token` contains a newline. It gives the frame `42["widget:error",{"code":"UPSTREAM_ERROR","message":"Google token endpoint returned an invalid response.",…}]`, and the row's `accessTokenEnc` is unchanged. Screenshots: `probe-d4-refreshed-newline-token-*.png`.
  - `d4stored` is a newline token already in the row. It gives `"message":"YouTube request failed."`, and no request reaches the stub. Screenshots: `probe-d4-stored-newline-token-*.png`.
  - All 21 youtube frames across the 7 live users are clean.
- **Legitimate FetchErrors still pass through unchanged** (probe `FE`):
  - `REAUTH_REQUIRED` covers 4 cases: token endpoint 400, token endpoint 401, a second 401 after a good refresh, and no stored refresh token. The row becomes `REAUTH` in each case.
  - `NOT_CONNECTED`.
  - `INVALID_PARAMS` covers an unknown channel, YouTube 400 and YouTube 404.
  - `RATE_LIMITED` covers 429, 403 `quotaExceeded` and 403 `rateLimitExceeded`.
  - `UPSTREAM_ERROR` covers the following, each with its own fixed text:
    - 403 `forbidden`: "HTTP 403"
    - 500 with an HTML body containing a marker: "HTTP 500", and the body is not echoed
    - a destroyed socket
    - token endpoint 503
    - a destroyed token-endpoint socket
- **Internal errors in the refresh path** (probe `INT`) each give the fixed "Google token refresh failed." with the row unchanged. The error text was seeded with a secret marker, a path and `.ts:12`. The cases were:
  - `updateMany` throwing
  - `cipher.encrypt` throwing
  - refresh-token decrypt throwing "Unsupported state…"
  - `findUnique` throwing in the refresher
- **Logs, Redis and frames:**
  - The production server log has 59 lines with 0 hits for the fake tokens (`tok-*`, `rt-*`, `PLAINSECRET`, `EXPIRED`).
  - Redis values have 0 hits in both the live run and the probe.
  - The probe's socket frames: 91 frames, 0 containing `SECRET`.
  - The stub logs lengths only.

## D1, D2a, D2b, D3 and dedupe: still fixed

- **D1:** probe `D1 disconnect mid-refresh` gives `NOT_CONNECTED` "The youtube connection was removed during a token refresh.", the row stays deleted, and there is no leak. e2e `7b` passes.
- **D2a and D2b:** in both probes `D2a/D2b reconnect mid-refresh` (the old grant refused, then granted), data is served with the reconnected token. The row keeps `status OK` and the reconnected access and refresh tokens. e2e `7c` refused and granted both pass. The CAS is in `writeIfCurrent` (`google-token-refresher.ts:119-125`) and `superseded()` (`:131-137`).
- **D3:** each of the following `expires_in` or body values gives the fixed "Google token endpoint returned an invalid response." with the row byte-identical (probe `D3`), and e2e `7d` × 3 pass:
  - `1e13`, `8.64e12`, `1e300`, `Number.MAX_VALUE`, `1e400`
  - raw `NaN` (invalid JSON), `-1`, `0`, `"3600"`
  - missing, HTML, `null`
  - an empty `access_token`, `refresh_token:""`
- **Dedupe:**
  - Probe `DEDUPE`: 3 widgets for the same user with an expired token give data 3/3 with `tokenCalls=1`.
  - Live: exactly one `POST /token` each for `silent`, `reauth`, `d4` and `d3`.
  - The code is at `google-token-refresher.ts:61-69`.

## Other checks

- **Error mapping:** the rows under "Legitimate FetchErrors" above show that 401, 400, 404, 429, 403 with each reason, 5xx and network errors map as the spec requires. Unit tests cover the same mapping (`youtube-widgets.spec.ts`, `google-token-refresher.spec.ts`, 34 tests).
- **Param bounds** (live REST, `probe-e2e-output.txt`):
  - `number` values 0, 11 and 2.5 each get 400, and an omitted `number` also gets 400. `number` 1 and 10 get 201.
  - An empty or missing `channel_id` gets 400.
  - `refreshRate` 599 on `channel_stats` and 899 on `trending_videos` each get 400.
  - Region: see item 9. `US` gets 201.
- **Per-connection cache keys:** `widget:youtube.<w>:<sha256(params)>:conn:<connectionId>`. The key holds no token material.
- **Production registration:**
  - `YoutubeModule.onModuleInit` registers the service and all 3 widgets (`youtube.module.ts:16-19`).
  - The module is imported in `AppModule`.
  - `about-production.json` confirms that the production build lists them.
- **http(s)-only links:**
  - Watch URLs are built server-side with `encodeURIComponent` (`youtube-widgets.ts:54`).
  - The view re-checks the protocol before setting `href` (`web/src/widgets/youtube.tsx:15-18,26`).
  - The web test `renders javascript:/data:/not a url as plain text` passes.
- **Encryption path:** the refresh uses connections-api's `TokenCipherService`, with no second encryption path. The `oauth-login` Google strategy is untouched. The `googleConnectClient` extraction resolves the same values as before.
- **Mock match** (`mock.png` compared with `card-ok-*.png`):
  - The stat formatting is the same: 2.4M / 180M / 412.
  - The latest-videos rows show the title plus "Nd ago", newest first.
  - The trending rows show the title plus `#1`/`#2`.
  - The mock's "token expired" card maps to the existing `WidgetFrame` Reconnect state (`card-reauth-*.png`).
  - No new chrome was added.
- **Committed files:**
  - No file in `verification/` contains a token ciphertext; a scan for the `iv:tag:ct` shape found 0 hits.
  - No file contains a real secret.
  - The only token-like strings are fake markers (`SECRET`) inside the probe case names.
  - The `defect-d4-*` screenshots were removed.

## Defects

None blocking.

## Non-blocking notes

1. **Token length is not bounded.** `parseTokenResponse` accepts a header-safe `access_token` of any length. In the probe, a 1 MB token was encrypted, persisted, and sent on every retry until it expired. Stub result: "HTTP 431", no leak. Against real Google, an oversized header might come back as 400 and be mapped to `INVALID_PARAMS`, which would stop the instance. That path was not verified. A sane length cap, for example 4 kB, would close it.
2. **A bad stored access token never self-heals.** An access token from the connect path that undici rejects (`\n`, NUL, `€`) gives a retryable `UPSTREAM_ERROR` "YouTube request failed." forever. No refresh is attempted, because the failure is not a 401. This leaks nothing, and Google does not issue such tokens.
3. **`channel_id` has no `pattern`.** It is echoed in "Unknown YouTube channel '…'", which is the user's own input, and it is URL-encoded upstream. An `^UC[\w-]{22}$`-style pattern would match Architecture §10's "params validated by ParamSpec".
4. **The Timer's REAUTH write is not CAS-guarded** (`timer.service.ts:137-141`). It runs after the refresher's CAS and is unchanged since round 2. Only a reconnect that lands in the few-millisecond gap between the two writes gets re-flagged as `REAUTH`, which is cosmetic.
5. **A successful refresh does not reset `status` to `OK`.** If a row was flagged `REAUTH` by a second 401 and a later refresh succeeds, the Services page keeps showing `REAUTH`.
6. **A malformed but well-typed 200 can still reach the view.** An object `title` is one example. There is no ErrorBoundary under `web/src`. This was carried over from round 4 and not exercised in the browser.
7. **`number` is both required and defaults to 5.** An omitted `number` gets 400. `ParamForm` pre-fills it, so the UI flow works.
8. **The connect flow does not store `expiresAt`** (outside this branch). Proactive refresh starts only after the first 401-triggered refresh.
9. **A disconnect during the first YouTube call** gives `REAUTH_REQUIRED` "No Google refresh token…" instead of `NOT_CONNECTED`. Both render as Reconnect.
10. **`WidgetDataMap` is edited in place**, not through `declare module` augmentation. This is consistent with github and weather.
11. **Pre-existing issues outside the branch:**
    - A production deep link such as `/d/:id` returns a Nest 404, because the serve-static SPA fallback does not cover it. The UI works when navigated from `/`.
    - The Services page offers only "Disconnect" for a `REAUTH` row (`services-page-reauth.png`).
    - `URL.parse` in `youtube.tsx:16` needs Chrome, Firefox 126+ or Safari 18+.

## Review history

- **Round 1 (`b75e123`): FAIL.** Three defects:
  - D1: a disconnect during a refresh leaked raw Prisma text.
  - D2a: a reconnect during a failed refresh flipped the row to `REAUTH`.
  - D2b: a reconnect during a successful refresh overwrote the new tokens.
- **Round 2 (`85c7560`): FAIL.**
  - D1, D2a and D2b were fixed with a CAS on `refreshTokenEnc`.
  - New D3: an unvalidated token response (missing `expires_in`) leaked Prisma text containing token ciphertexts.
- **Round 3 (`fd8a26c`): FAIL.** D3 was fixed for missing, wrong-typed and non-JSON bodies. It was still reproducible with a finite huge `expires_in` (≥ about 8.64e12 s).
- **Round 4 (`708ac8b`): FAIL.**
  - D3 was closed by the Invalid Date check and the `fixedMessage` wrappers.
  - New D4: `send()` copied the raw `fetch` error into a `FetchError`, which echoed a plaintext access token that was not a valid header value.
- **Round 5 (`ef35474`): PASS.**
  - D4 is closed by the fixed messages in `send()` and in the refresher's catch, and by the header-safe token validation.
  - The probes used real undici header checks for `\n`, `\r`, NUL, space, `é`, `€`, tab, 20 kB and 1 MB tokens, both from the refresh endpoint and pre-stored through the connect path. None leaked.
  - D1, D2a, D2b, D3 and the dedupe still hold.

## Evidence files

- **Mock:** `mock.png`.
- **Connected, with stubbed data:**
  - `card-ok-dashboard-page.png`
  - `card-ok-channel_stats.png`
  - `card-ok-latest_videos.png`
  - `card-ok-trending_videos.png`
- **Silent refresh:**
  - `card-after-silent-refresh-dashboard-page.png`
  - `card-after-silent-refresh-channel_stats.png`
  - `card-after-silent-refresh-latest_videos.png`
  - `card-after-silent-refresh-trending_videos.png`
- **Revoked refresh token:**
  - `card-reauth-dashboard-page.png`
  - `card-reauth-channel_stats.png`
  - `card-reauth-latest_videos.png`
  - `card-reauth-trending_videos.png`
  - `services-page-reauth.png`
- **Not connected:**
  - `card-not-connected-dashboard-page.png`
  - `card-not-connected-channel_stats.png`
  - `card-not-connected-latest_videos.png`
  - `card-not-connected-trending_videos.png`
- **D4 probe, fixed message:**
  - Newline token from the refresh endpoint:
    - `probe-d4-refreshed-newline-token-dashboard-page.png`
    - `probe-d4-refreshed-newline-token-channel_stats.png`
    - `probe-d4-refreshed-newline-token-latest_videos.png`
    - `probe-d4-refreshed-newline-token-trending_videos.png`
  - Newline token pre-stored in the row:
    - `probe-d4-stored-newline-token-dashboard-page.png`
    - `probe-d4-stored-newline-token-channel_stats.png`
    - `probe-d4-stored-newline-token-latest_videos.png`
    - `probe-d4-stored-newline-token-trending_videos.png`
- **D3 probe, fixed message:**
  - `probe-d3-huge-expires-in-dashboard-page.png`
  - `probe-d3-huge-expires-in-channel_stats.png`
  - `probe-d3-huge-expires-in-latest_videos.png`
  - `probe-d3-huge-expires-in-trending_videos.png`
- **Probe output:**
  - `about-production.json`
  - `probe-stubbed-google-calls.txt`
  - `probe-e2e-output.txt`
