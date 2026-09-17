## Scope
Build out `server/src/timer` (currently an empty module) into the Socket.IO gateway + Timer + Redis-backed fetch cache, per `docs/Architecture.md` §6-§7:

- `RealtimeGateway` (Socket.IO, `@nestjs/websockets`/`@nestjs/platform-socket.io`): handshake reads the session cookie and runs the same check as `JwtGuard` (reject unauthenticated / banned / stale-tokenVersion sockets). Each socket joins room `user:{id}`.
- Client events: `widget:subscribe { instanceId }`, `widget:unsubscribe { instanceId }` — on subscribe, verify the instance belongs to the connecting user (404-equivalent: silently ignore/ack-false for someone else's instance, don't leak existence), join room `instance:{id}`, and call `Timer.activate(instance)`.
- `Timer`: in-memory `Map<instanceId, { def, params, userId, refreshRate, nextDueAt, failures, inFlight }>`. A 1-second tick picks due entries, calls `FetchService.get(def, params, connection)`, and on success emits `widget:data { instanceId, data, fetchedAt }` to room `instance:{id}`; on failure emits `widget:error { instanceId, code, message, retryAt? }` per the error-code table in Architecture §6 (`NOT_CONNECTED`, `REAUTH_REQUIRED`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INVALID_PARAMS`) with the matching retry/backoff/deactivate behavior for each.
- Entries are removed from the active set when their room empties (Socket.IO adapter's `delete-room` event), and reconfigure/delete on an instance (via whatever extension point `dashboards-api` exposes) updates or removes the Timer entry, with a reconfigured instance getting `nextDueAt = now` immediately.
- `FetchService`: Redis-backed cache using key shape `widget:{service}.{widget}:{sha256(canonical sorted params)}[:conn:{connectionId}]` (the `:conn:` suffix present iff `def.auth === 'connection'`), TTL = `minRefreshSec`; an in-flight `Map<cacheKey, Promise>` to dedupe concurrent identical fetches. On a cache miss, calls `def.fetch(params, ctx)` where `ctx` (`FetchContext`) is the first real consumer of `connections-api`'s token-decryption — decrypt only here, never pass raw tokens elsewhere.
- Because no real widget definitions exist yet, use one or two fake `WidgetDefinition`s (fixed/deterministic or randomized fake data, `auth: 'none'` and `auth: 'connection'` variants) registered only under test/dev conditions to exercise the full pipeline end to end. Document clearly that swapping in real weather/github/etc. definitions later requires no changes here.

## Non-goals
- Real upstream API calls (Open-Meteo/GitHub/Steam/YouTube) — later widget work.
- The dashboard grid UI that renders `widget:data` — `widget-grid-ui`/`frontend-shell` own the client-side `SocketProvider`/`useWidgetData`, though this feature's `mock.html` needs a minimal client to demonstrate the event flow.

## Verification checklist
1. A Socket.IO connection without a valid session cookie is rejected at handshake.
2. `widget:subscribe { instanceId }` for an instance owned by the connecting user results in periodic `widget:data` events at (approximately) the instance's `refreshRate`, sourced from the fake `auth: 'none'` widget definition.
3. `widget:subscribe` for an instance NOT owned by the connecting user does not add it to the active set and does not leak whether the id exists.
4. `widget:unsubscribe`, and separately a full socket disconnect with no other subscribers in the room, both stop further `widget:data` events for that instance (verified by absence over one refresh interval).
5. Two different sockets subscribing to the same instance both receive the same `widget:data` events (room broadcast, not per-socket fetch).
6. Two due instances with identical `(service, widget, params)` and no connection scoping trigger exactly one upstream `fetch()` call (dedupe) within the same tick.
7. A fake definition that throws a "rate limited" error causes a `widget:error { code: 'RATE_LIMITED', retryAt }` event and the entry's `nextDueAt` backs off exponentially, capped at 15 minutes.
8. A fake definition that throws "not connected" causes `widget:error { code: 'NOT_CONNECTED' }` once and the entry is deactivated (no further retries/emits) until re-subscribed.
9. A cache hit within the widget's `minRefreshSec` TTL serves from Redis without calling `def.fetch()` again; verify by counting fetch invocations across two due ticks inside the TTL window.
10. The `:conn:{connectionId}` cache-key suffix is present for an `auth: 'connection'` fake definition and absent for an `auth: 'none'` one; two different users' connection-scoped fetches produce different cache keys and never share data.

## Constraints
- Depends on `connections-api` for token decryption inside `FetchContext`, and benefits from `dashboards-api`'s instance CRUD to look up real instances (a minimal local Prisma query is fine if that branch isn't merged yet, as long as the shape matches `WidgetInstance`).
- Do not build any real service module under `server/src/services/*` — fake/test definitions only.
- `mock.html`: a minimal page with a "connect" button that opens a (simulated, no real socket.io) event log showing subscribe → periodic `widget:data` ticks → error states (rate-limited, not-connected) → unsubscribe, so the event contract is visually checkable.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/timer-realtime/mock.html` (the event log's subscribe/data/error/unsubscribe sequence). Capture evidence via `chrome-headless-shell` into `features/timer-realtime/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/timer-realtime/spec.md
