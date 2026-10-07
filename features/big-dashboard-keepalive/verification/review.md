# big-dashboard-keepalive: verification (re-review 2)

**Verdict: PASS**

Branch `feature/big-dashboard-keepalive` @ `03447bc`. The spec says `UI: none`, so every item is backed by an automated test on the branch. There are no screenshots.

This re-review checks the two FAILs from last time:
- **Item 6:** a new test, "applies a widget reconfigured while hidden", covers a widget reconfigured while the dashboard is hidden.
- **Item 9:** the `AppShell.spec.tsx` logout test now answers `/shares` with `{ shares: [] }`. The full web suite passed **25 of 25 runs**, 10 idle and 15 under full CPU load (12 × `yes` on 12 cores). No run had an unhandled error. Before the fix, 2 of 16 runs failed.

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Dashboard → Services → back (sidebar + browser Back): no skeleton, no re-layout, same data | PASS | `KeepAlive.spec.tsx` "returns without a refetch, a resubscribe or an unsubscribe", "returns with the browser Back button: same DOM, no skeleton, no new request" ([keepalive-tests.txt](keepalive-tests.txt)) |
| 2 | Same for Profile and Admin (as admin) | PASS | "survives Profile and Admin (as admin) the same way" ([keepalive-tests.txt](keepalive-tests.txt)) |
| 3 | No new `GET /dashboards/:id/widgets`, no `widget:subscribe` on return | PASS | "returns without a refetch, a resubscribe or an unsubscribe" counts fetch calls and socket emits ([keepalive-tests.txt](keepalive-tests.txt)) |
| 4 | Scroll position kept | PASS | "restores the scroll position on return" ([keepalive-tests.txt](keepalive-tests.txt)) |
| 5 | Realtime pushes keep arriving while hidden | PASS | "keeps writing realtime pushes into the cache while hidden" ([keepalive-tests.txt](keepalive-tests.txt)) |
| 6 | Edits made elsewhere show up; deleting the kept dashboard leaves no hidden instance or subscriptions | PASS | "shows widget edits made while hidden (added widget, removed widget)", "applies a widget reconfigured while hidden: reset to waiting and resubscribed", "shows a rename or an accepted share made while hidden", "drops the kept dashboard when it is deleted elsewhere: no hidden instance, widgets unsubscribed" ([keepalive-tests.txt](keepalive-tests.txt)) |
| 7 | Logout tears down the kept dashboard | PASS | "tears the dashboard down on logout" ([keepalive-tests.txt](keepalive-tests.txt)) |
| 8 | Hidden content is `hidden`/`inert`; Services/Profile/Admin behave as before | PASS | "keeps the dashboard mounted, hidden and inert, on another shell page"; the existing page specs pass ([web-unit-tests.txt](web-unit-tests.txt)) |
| 9 | Unit tests cover keep-alive and teardown; existing unit, e2e, typecheck and lint pass | PASS | Web unit: 290/290 tests, exit 0 in all 25 repeat runs ([web-unit-repeat.txt](web-unit-repeat.txt), [web-unit-tests.txt](web-unit-tests.txt)). Typecheck exit 0 ([web-typecheck.txt](web-typecheck.txt)). Lint exit 0 ([web-lint.txt](web-lint.txt)). Server e2e: 130/130, exit 0 ([server-e2e-main.txt](server-e2e-main.txt)), see notes. |

## Notes (not contract misses)

- **Server e2e ran on main, not on the branch.** It can't run in this worktree: `server/test/testcontainers.ts` calls `<worktree>/node_modules/.bin/prisma`, and the worktree has no `node_modules` of its own. I ran it in the main checkout instead. `git diff main feature/big-dashboard-keepalive -- server shared` is empty, so the result applies to the branch.
- **Item 3 was checked without Playwright.** The item says to check "in Playwright network/WS logs", but the repo has no Playwright setup. The unit tests' fetch and socket-emit counts were used instead.
- **Item 1's "no grid re-layout" has no direct test.** It relies on the `lastWidth` guard in `DashboardView`, and jsdom never measures a width, so no test exercises that guard. The same-DOM-node checks show there's no remount, but they can't show there's no re-layout.
- **The reconfigure test calls `invalidateQueries` directly.** That stands in for what the Configure mutation does; it doesn't drive the Configure dialog. The test then checks the resubscribe (2 subscribes, 1 unsubscribe) and that the widget's data was reset.
- **"Edits made elsewhere" only covers edits made in this app.** Return-without-refetch (item 3) means an edit made in another browser tab only shows up through socket pushes or React Query's focus refetch. It doesn't show up just from going back to the dashboard. The spec accepts this trade-off.
- **Pending widget removals are sent later.** With keep-alive, leaving the page no longer runs the unmount commit for a pending removal. The DELETE is sent when the 8 s undo timer ends instead. The end result is the same.
- **One lint warning, not from this branch.** It's in `src/api/client.ts:17` (`no-misused-spread`), a file this branch doesn't touch.
- **The spec isn't in the worktree.** `features/big-dashboard-keepalive/spec.md` exists only in the main checkout (`features/` is gitignored).

## Screenshots

None, because the spec says `UI: none`.
