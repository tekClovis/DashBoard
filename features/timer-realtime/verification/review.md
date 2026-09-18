# timer-realtime — review

Reviewed by an independent reviewer (not the builder). Branch `feature/timer-realtime`,
merge-base with `main` = `6cdd6a7`. **Important note on scope**: the task named commit
`4adc386` as the build to review, but while this review was in progress the branch head
advanced to a new commit `b7f6326` ("fix: restrict RealtimeGateway CORS origin and
periodically re-check session validity"), whose message says it was made in response to
"an automated security review of the timer-realtime commit". That commit fixes exactly the
defect this review independently found in `4adc386` (see item 1 below). Both states are
documented; the verdict is based on the current branch tip (`b7f6326`), which is what would
actually be merged.

## Method
- `git diff 6cdd6a7..feature/timer-realtime` for the true diff (diffing against current
  `main` tip is misleading — `main` has since merged `dashboards-api`, which this branch
  predates, so a naive diff falsely shows dashboards-api files being deleted).
- Read every new/changed file in `server/src/timer/`, `server/src/auth/session-user.ts`,
  `shared/src/socket.ts`, `server/src/main.ts`.
- Ran, myself, rather than trusting the builder's counts:
  - `tsc --noEmit` → clean.
  - `vitest run` (unit) → **113/113 pass**.
  - `vitest run --config vitest.config.e2e.ts` (full e2e suite, real Postgres+Redis via
    testcontainers, real `socket.io-client`) → **49/49 pass**, including
    `timer-realtime.e2e-spec.ts` (10/10) and, critically, `catalog.e2e-spec.ts` unmodified
    and still asserting an exact `services` array from `/api/catalog` — this is a real
    regression check for fake-widget leakage, and it passed.
  - `oxlint --type-aware src/ test/` → exit 0, only pre-existing `unbound-method` warnings
    (present in both timer specs and pre-existing `auth.controller.spec.ts`), no errors.
- Rendered `features/timer-realtime/mock.html` in a real browser (Playwright) and clicked
  through subscribe → data → RATE_LIMITED → NOT_CONNECTED → unsubscribe. Screenshot at
  `features/timer-realtime/verification/mock-event-log.png`. Per the spec's Non-goals, there
  is no real frontend for this feature (SocketProvider/useWidgetData belong to
  `widget-grid-ui`/`frontend-shell`) — `mock.html` is a static, simulated event log, not a
  real socket.io client, and I did not fake screenshots of anything beyond that.

## Checklist

1. **Handshake rejects a socket with no valid session cookie.** PASS.
   `realtime.gateway.ts` `afterInit` installs `server.use(...)` middleware that calls
   `authenticate()` → `resolveSessionUser()` (shared with `JwtGuard`, checks signature,
   revocation, ban, tokenVersion) and calls `next(new Error(...))` on failure, so the client
   only ever sees `connect_error`. Verified live: e2e test 1 (`connect()` with no cookie)
   rejects.
   **However**, in the original build (`4adc386`) the gateway decorator was
   `@WebSocketGateway({ cors: { origin: true, credentials: true } })` — this reflects
   *any* request's `Origin` header and allows credentialed (cookie-bearing) cross-origin
   Socket.IO connections. Session cookie is `sameSite: 'lax'`
   (`server/src/auth/session-cookie.ts:8`), which blocks a *browser* from attaching it to a
   cross-site WebSocket/XHR handshake initiated by another site's JS in current browsers —
   but relying on `SameSite=Lax` alone, with `origin: true` at the CORS layer, is exactly the
   kind of "belt missing, suspenders only" gap the fix commit's own message calls out
   ("the cookie's `sameSite: 'lax'` alone isn't a reliable substitute for a real origin
   check"). Fixed in `b7f6326`: `RealtimeGateway`'s decorator no longer sets `cors` at all
   (default = no CORS headers = same-origin only), and a new `SocketIoAdapter`
   (`server/src/timer/socket-io.adapter.ts`) pins the real server's CORS `origin` to
   `APP_URL` from `ConfigService`, wired in `main.ts:19`. That commit also adds a
   60s-interval re-check of revocation/ban/tokenVersion per connected socket
   (`REAUTH_INTERVAL_MS`, `realtime.gateway.ts:39,86-93`), closing a second gap: originally
   a socket was authenticated once at handshake and never re-checked, so a since-banned or
   logged-out-everywhere user's live socket would keep receiving `widget:data` indefinitely.
   Verified the fix doesn't regress anything: full unit (113/113) and e2e (49/49) suites
   still pass on `b7f6326`, `tsc` clean. Note: neither the CORS restriction nor the 60s
   re-auth loop has direct test coverage (the e2e harness uses a plain `IoAdapter`, not
   `SocketIoAdapter`, and 60s is too long to wait in a test) — worth a follow-up test, not a
   blocker.

2. **Owned-instance subscribe → periodic `widget:data` at ~refreshRate from an `auth:'none'` fake def.** PASS. `timer.service.ts` ticks every 1s, `run()` fetches via `FetchService.get`, emits `widget:data` to room `instance:{id}` on success, sets `nextDueAt = now + refreshRate*1000`. e2e test 2 confirms ≥2 events over 2.2s at refreshRate=1s with correct payload shape.

3. **Subscribe to an unowned instance: not added to active set, no existence leak.** PASS. `InstanceLookupService.findOwned` returns `null` uniformly whether the instance doesn't exist or belongs to another user (`instance-lookup.service.ts:27`), and `handleSubscribe` returns `{ ok: false }` in both cases without joining the room or calling `Timer.activate`. e2e test 3 confirms `ack === { ok: false }` and zero `widget:data` events for an attacker subscribing to another user's instance.

4. **`widget:unsubscribe` and a bare disconnect (no other subscribers) both stop further `widget:data`.** PASS. Both paths converge on Socket.IO's room-membership bookkeeping: `unsubscribe` calls `client.leave(...)`, a disconnect implicitly leaves all rooms; either way, once `instance:{id}` is empty the adapter's `delete-room` event fires (`realtime.gateway.ts:74-78`) and calls `this.timer.deactivate(instanceId)`. e2e test 4 exercises both paths independently and confirms no further events over one refresh interval.

5. **Two sockets on the same instance get identical broadcast `widget:data` (not per-socket fetch).** PASS. Emission is `this.server.to('instance:{id}').emit(...)` (room broadcast, one fetch per due tick regardless of subscriber count). e2e test 5 confirms both sockets' first event is `toEqual`.

6. **Two due instances, identical `(service, widget, params)`, no connection scoping → exactly one `fetch()` in the tick.** PASS. `FetchService.dedupedFetch` reserves the in-flight `Map` entry synchronously (before any `await`), so two `tick()`-driven calls in the same synchronous pass share one promise — confirmed by code inspection and by e2e test 6 (`calls === 1` for two instances sharing a cache key).

7. **`RATE_LIMITED` → `widget:error{code,retryAt}` + exponential backoff capped at 15 min.** PASS, and matches Architecture §6's table formula `nextDueAt = now + min(refreshRate·2^failures, 15min)` exactly (`timer.service.ts:127-132`, using `entry.failures` post-increment). e2e test 7 and unit test in `timer.service.spec.ts` both confirm the error event, growing gap between retries, and (via fake timers) that a 15-min-plus advance keeps firing rather than growing unbounded.

8. **`NOT_CONNECTED` → single `widget:error`, entry deactivated, no further retries.** PASS. `handleFailure` treats every code outside `{RATE_LIMITED, UPSTREAM_ERROR}` as terminal: deletes from `this.active` then emits once. e2e test 8 and the matching unit test both confirm exactly one error event and zero further `fetch()` calls.

9. **Cache hit inside `minRefreshSec` TTL serves without a second `def.fetch()` across two due ticks.** PASS. `fetchAndCache` checks Redis before calling `def.fetch`, caches with `EX: def.minRefreshSec`. e2e test 9 (refreshRate=1s, minRefreshSec=30s) shows ≥2 `widget:data` events but `calls === 1`.

10. **`:conn:{connectionId}` suffix present iff `auth:'connection'`, and two users never share connection-scoped data.** PASS. `widgetCacheKey` appends `:conn:{connectionId}` only when passed a `connectionId`, and `FetchService.getConnectionScoped` only calls it with one for `auth === 'connection'` defs. e2e test 10 uses two real users with two `ServiceConnection` rows and confirms each receives only their own `userId` back — no cross-talk.

## Other checks called out by the task

- **Fake-widgets isolation**: confirmed for real, not just by inspection. `fake-widgets.ts` is registered only from `main.ts`'s `bootstrap()` (guarded by `NODE_ENV !== 'production'`), never imported by `timer.module.ts`. Ran `catalog.e2e-spec.ts` (which builds `AppModule` via `Test.createTestingModule`, the same path every e2e file uses) and its exact-match assertion on `/api/catalog`'s `services` array still passes — if `fake`/`fake-connected` had leaked in via `TimerModule`, that assertion would fail. It didn't.
- **Ownership scoping / info leak**: covered above (item 3); no timing- or payload-based distinction between "doesn't exist" and "not yours."
- **Race conditions in dedupe / room-empty**: dedupe is synchronous-reservation (item 6); room-empty relies on the Socket.IO adapter's own `delete-room` event, which is accurate for both explicit-leave and disconnect paths (item 4). One minor, non-blocking note: `TimerService.run()`'s early returns (`if (!this.active.has(instanceId)) return;`) don't reset `entry.inFlight` on the stale (now-detached) entry object if an instance is deactivated and immediately reactivated while a fetch is in flight — but since `activate()` always allocates a fresh entry object rather than reusing the old one, the stale flag is inert (garbage), not a live bug. Not worth a fix, flagging for awareness only.
- **UI/mock.html**: backend-only feature; no real frontend exists in this branch (by design — see spec's Non-goals). `mock.html` is a static simulated event log, verified by actually clicking through it in a browser (screenshot: `features/timer-realtime/verification/mock-event-log.png`), showing subscribe → periodic `widget:data` → `RATE_LIMITED` error → `NOT_CONNECTED` error (which also auto-unsubscribes in the mock) → unsubscribe, matching the spec's Constraints section.

## Overall verdict: **PASS**

All 10 checklist items pass against the current branch tip (`b7f6326`), verified by
independently running the full unit (113/113) and e2e (49/49) suites myself, plus `tsc`
and lint. The one real defect found — permissive Socket.IO CORS
(`cors: { origin: true, credentials: true }`) in the original build commit `4adc386`,
`server/src/timer/realtime.gateway.ts:32` at that revision, paired with no post-handshake
re-validation of session state — has already been fixed on this branch in `b7f6326`
(`server/src/timer/socket-io.adapter.ts`, `server/src/main.ts:19`,
`server/src/timer/realtime.gateway.ts:39,86-101`), and that fix does not regress any
checklist item or test.

Residual, non-blocking notes for a future pass:
- No direct test exercises the CORS-origin restriction or the 60s re-auth disconnect path
  (e2e harness still uses plain `IoAdapter`).
- `reconfigure()` in `timer.service.ts` is a real, correct extension point but is unwired and
  untested on this branch, since `dashboards-api`'s PATCH/DELETE hooks aren't merged here yet
  (explicitly out of scope per spec's Constraints) — needs revisiting once that branch lands,
  to make sure the eventual merge doesn't silently drop this wiring.

## Post-review fix (commit `0d9e02d`)
A second automated security pass, run after this review's verdict above, flagged a
resource-leak/DoS in `b7f6326`'s own fix: `authenticate()` calls in both the handshake
middleware and the new reauth interval had no `.catch`, so a rejected promise (e.g. a
transient DB error) became an unhandled rejection — which terminates the whole Node process
by default, not just the affected socket. The reauth interval also had no guard against a
slow check still being in flight when the next tick fired. Fixed in `0d9e02d`: both paths now
catch and treat a failed re-check as inconclusive (not a disconnect reason), and the interval
skips a tick while a check is still pending. Re-ran after the fix: 113/113 unit, 49/49 e2e,
`tsc` clean, lint clean (same pre-existing warnings only).
