# tests-realtime — review

Verdict: **PASS**. Unit-test-only feature, no UI: evidence is command output, no screenshots.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Connection auth: missing cookie, invalid/revoked token, banned user, valid user | PASS | `realtime.gateway.spec.ts` `handshake auth` (7 tests, also tokenVersion mismatch and lookup throwing) — [npm-test.txt](npm-test.txt) |
| 2 | Subscribe/unsubscribe: ownership rejection, room join/leave, timer start/stop on first/last subscriber | PASS | `widget:subscribe / widget:unsubscribe` block — [npm-test.txt](npm-test.txt), [mutation-1-delete-room-prefix.txt](mutation-1-delete-room-prefix.txt) |
| 3 | Emissions: data and error payload shapes reach only the subscribed room | PASS | `emissions` block (`toStrictEqual` on `widget:data` / `widget:error`, non-subscribed sockets receive nothing) — [npm-test.txt](npm-test.txt) |
| 4 | Disconnect cleanup and admin-triggered user disconnect | PASS | `stops re-checking a socket once it has disconnected`, `stops fetching when the last subscriber disconnects…`, `disconnectUser` block — [mutation-2-handle-disconnect-timer.txt](mutation-2-handle-disconnect-timer.txt) |
| 5 | `instance-lookup.service`: found, not found, not-owned | PASS | `instance-lookup.service.spec.ts` (3 tests) — [mutation-3-instance-ownership.txt](mutation-3-instance-ownership.txt) |
| 90 | `npm test` in `server/` passes | PASS | 27 files, 265 tests passed — [npm-test.txt](npm-test.txt) |
| 91 | `npm run lint` and `npx tsc --noEmit -p tsconfig.json` clean | PASS | 0 errors; the 24 warnings are all in files this branch does not touch (none in the 4 new specs); tsc exit 0 with no output — [npm-lint.txt](npm-lint.txt), [tsc.txt](tsc.txt) |
| 92 | `git diff main --stat` shows only new `*.spec.ts` under `server/src` | PASS | 4 new spec files, 550 insertions, nothing else — [git-diff-stat.txt](git-diff-stat.txt) |
| 93 | Mutation spot-check, 3 reviewer-chosen branches | PASS | see table below; `git status` shows no source changes afterwards |
| 94 | No `any`, no `it.skip`/`it.todo`, no assertion-free tests, no real network/DB/Redis | PASS | grep over the 4 specs finds none; every test has an `expect`; Socket.IO server is `new Server()` unattached, adapter spec attaches to an `http.Server` that is never listened on (`IoAdapter.createIOServer` takes the `httpServer && port === 0` path); Prisma/revocation/fetch are in-memory fakes |
| 95 | Bugs found in src not fixed, listed and pinned | PASS | no src change in the diff; no spec asserts buggy behaviour as correct; no bug claimed, so no `findings.md` / `it.fails` is required |

## Mutation spot-check (item 93)

| Mutation | Spec run | Tests that failed | Output |
|----------|----------|-------------------|--------|
| `realtime.gateway.ts:80` `if (room.startsWith(...))` → `if (!room.startsWith(...))` | `realtime.gateway.spec.ts` | 3: `keeps fetching while one of two subscribers remains, and stops when the last one unsubscribes`; `stops fetching when the last subscriber disconnects without unsubscribing`; `stops the widget timers the disconnected user was the last subscriber of` | [mutation-1-delete-room-prefix.txt](mutation-1-delete-room-prefix.txt) |
| `realtime.gateway.ts:122` `if (timer)` → `if (!timer)` | `realtime.gateway.spec.ts` | 1: `stops re-checking a socket once it has disconnected` | [mutation-2-handle-disconnect-timer.txt](mutation-2-handle-disconnect-timer.txt) |
| `instance-lookup.service.ts:27` `userId !== userId` → `===` | `instance-lookup.service.spec.ts` | 2: `returns only the Timer-facing fields of the caller's own instance`; `returns null for an instance on another user's dashboard` | [mutation-3-instance-ownership.txt](mutation-3-instance-ownership.txt) |

Each file was restored after its run; final `git status --short` lists only the untracked `features/tests-realtime/`.

## Builder's judgement calls

- (a) No spec for `server/src/admin/user-socket-disconnector.ts`: accepted. The file is one interface and one `Symbol`, which the spec's non-goals exclude ("type files, constants … with no logic"); `disconnectUser` is exercised through the gateway spec, typed as `UserSocketDisconnector`.
- (b) Gateway spec on a real unattached Socket.IO server with fake sockets: accepted. No port is bound and no client connects. Room membership, `delete-room`, `in(room).disconnectSockets` and broadcast routing go through the real in-memory adapter, and the real `JwtService`, `InstanceLookupService` and `TimerService` are used, so the mutations above are caught by behaviour rather than by mock-call assertions. The cost is coupling to Socket.IO internals (`nsp.sockets`, `adapter.addAll/del/delAll`, `notifyOutgoingListeners`, `client.writeToEngine`), which a Socket.IO upgrade could break.

## Notes (not contract misses)

- The "missing cookie" test sends a `Cookie` header without the session cookie (`other=1`); a handshake with no `Cookie` header at all is not tested at the middleware level.
- Possible unpinned bug, `realtime.gateway.ts:89-95`: `handleConnection` awaits `client.join` before registering the re-auth interval. If the socket disconnects during that await, `handleDisconnect` finds no timer and the interval registered afterwards is never cleared. With the in-memory adapter `join` is synchronous, so this is likely unreachable today; it would matter with an async adapter (e.g. Redis).
- `handleUnsubscribe` does not check `userId` or ownership; it only leaves a room, so there is no effect on other sockets.
- The mutation runs were first launched in one parallel batch, which interleaved edits and test runs; mutations 1 and 2 were redone one at a time and the saved outputs are from the sequential runs.
- `tsc` was run as the workspace binary `node_modules/.bin/tsc --noEmit -p server/tsconfig.json` (same compiler `npx tsc` resolves to).
