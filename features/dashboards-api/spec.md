## Scope
Build out `server/src/dashboards` (currently an empty module) into full Dashboard + WidgetInstance CRUD, per `docs/Architecture.md` §4 and §8:

- `GET /api/dashboards`, `POST /api/dashboards` (`{ name }`, auto-assigns next `position`), `PATCH /api/dashboards/{id}` (`name`, `position`), `DELETE /api/dashboards/{id}`.
- On user signup (hook into whatever `auth-session`/register flow creates the `User`), auto-create a first `Dashboard` named e.g. "My Dashboard" at `position: 0`. (If `auth-session` is already built, wire directly; otherwise add a TODO hook point and note the dependency.)
- `POST /api/dashboards/{id}/widgets` — create a `WidgetInstance`: body `{ service, widget, params, refreshRate, x, y, w, h }`. Validates `service`/`widget` exist in the registry (`catalog-api`'s registry lookup), validates `params` against that widget's `ParamSpec[]` using `catalog-api`'s validator, and validates `minRefreshSec ≤ refreshRate ≤ 86400`.
- `PATCH /api/widgets/{id}` — reconfigure `params`/`refreshRate` (same validation as create).
- `DELETE /api/widgets/{id}`.
- `PATCH /api/dashboards/{id}/layout` — bulk `[{ id, x, y, w, h }]` update after a drag/resize, scoped to instances belonging to that dashboard and user.
- Every `{id}` lookup scoped by `userId` in the query itself (owned-by-someone-else = 404, not 403), per Architecture §8.

## Non-goals
- The Socket.IO/Timer side that reacts to instance create/update/delete (activating/deactivating the in-memory active set) — `timer-realtime` owns that; this feature just needs to leave a clear extension point (e.g. an injectable notifier/event emitter that `timer-realtime` can subscribe to) rather than hard-wiring Timer calls.
- Any frontend grid/dialog UI — `widget-grid-ui`.
- Real widget definitions — depends on `catalog-api`'s registry + validator for whatever definitions exist (test fixtures are fine).

## Verification checklist
1. `POST /api/dashboards` creates a dashboard owned by the caller with an auto-assigned `position`; `GET /api/dashboards` lists only the caller's dashboards.
2. `PATCH /api/dashboards/{id}` on a dashboard owned by another user returns 404.
3. `POST /api/dashboards/{id}/widgets` with valid `service`/`widget`/`params`/`refreshRate` creates a `WidgetInstance` and returns it with an id.
4. Same call with `params` that fail `ParamSpec` validation (missing required, out of range, bad pattern) returns a 400 with a structured, per-param error and creates no row.
5. Same call with `refreshRate` below the widget's `minRefreshSec` or above 86400 returns 400.
6. Same call with an unknown `service`/`widget` pair returns 400 (not a 500).
7. `PATCH /api/widgets/{id}` updates `params`/`refreshRate` with the same validation as create; a request against another user's instance returns 404.
8. `DELETE /api/widgets/{id}` removes the instance; scoped to the owner (404 for others').
9. `PATCH /api/dashboards/{id}/layout` with a batch of `{id,x,y,w,h}` updates all listed instances in one call; an id belonging to another user or a different dashboard in the same batch is rejected (whole batch fails, or that entry is skipped — pick one behavior and assert it) rather than silently applied.
10. A new user's signup results in exactly one auto-created `Dashboard`.

## Constraints
- Depends on `catalog-api` (registry lookup + param validator) and, for the auto-dashboard-on-signup hook, `auth-session`. If those aren't merged yet when this is built, stub the interface (e.g. a local copy of the validator's function signature) and note it needs reconciling — but prefer building on the real thing if the branch is available.
- `mock.html`: a simple dashboard list + "add widget instance" form (service/widget/params/refreshRate fields, no ParamForm generation needed) and a plain list (not a drag grid — that's `widget-grid-ui`) of instances with delete buttons, enough to click through create/validate-error/delete.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/dashboards-api/mock.html` (create/validate-error/delete flow). Capture evidence via `chrome-headless-shell` into `features/dashboards-api/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/dashboards-api/spec.md
