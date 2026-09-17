## Scope
Build out `server/src/admin` (currently an empty module) and the `/admin` page, per `docs/Architecture.md` §5.3:

- `RolesGuard` + `@Roles('ADMIN')` decorator, applied to all `/api/admin/*` routes (on top of the existing `JwtGuard` from `auth-session`).
- `GET /api/admin/users` — list/search users (by email substring, paginated).
- `PATCH /api/admin/users/{id}` — ban/unban (`bannedAt`), promote/demote (`role`). Banning or role-changing bumps `tokenVersion` and disconnects that user's active sockets (calling into whatever `timer-realtime`'s gateway exposes for that, e.g. `disconnectSockets(userId)`).
- `DELETE /api/admin/users/{id}` — delete a user (cascades per Prisma schema).
- Guard rule: an admin cannot ban, demote, or delete themself — reject with a clear error.
- `/admin` page (`web/src`): a table of users (email, role, banned state, created date) with search, and per-row Ban/Unban, Promote/Demote, Delete actions; the acting admin's own row has those actions disabled.

## Non-goals
- Any general accessibility audit beyond this page and `widget-grid-ui`'s (each feature covers its own UI's accessibility) — a general project-wide accessibility pass and README are tracked outside this batch.
- Anything about widget instances/dashboards themselves — admin here only manages users.

## Verification checklist
1. `GET /api/admin/users` as a non-admin returns 403; as an admin returns a paginated user list.
2. `PATCH /api/admin/users/{id}` with `{ bannedAt: <now> }` bans the target: their `tokenVersion` is bumped and a subsequent request with their old session cookie is rejected (401, via `JwtGuard`).
3. Same call unbanning (`bannedAt: null`) allows the user to log in again with fresh credentials.
4. `PATCH /api/admin/users/{id}` with `{ role: 'ADMIN' }` promotes a user; `{ role: 'USER' }` demotes one, also bumping `tokenVersion`.
5. An admin calling ban/demote/delete on their own `id` is rejected with a clear error and no mutation occurs.
6. `DELETE /api/admin/users/{id}` removes the user and (per schema cascade) their dashboards/instances/connections/identities/tokens.
7. The `/admin` page is reachable and renders the user table only for an authenticated admin; a non-admin hitting the route in the UI sees a 403/redirect, not the table.
8. In the UI, searching by email substring filters the visible rows; Ban/Unban and Promote/Demote buttons reflect the row's current state after the action completes; the signed-in admin's own row shows disabled destructive actions.

## Constraints
- Depends on `auth-session` (`JwtGuard`, `tokenVersion` mechanics) and `frontend-shell` (nav/route gating, showing the Admin link only for `role === 'ADMIN'`) — build the guard/decorator generically enough that `frontend-shell`'s existing gating logic doesn't need duplicating server-side rules by hand.
- Do not implement `disconnectSockets` itself if `timer-realtime` isn't merged yet — stub the call behind an injectable interface so it can be wired later without changing this feature's routes.
- `mock.html`: a user table with a search box, role/ban badges, and Ban/Unban/Promote/Demote/Delete buttons per row (one row representing "yourself" with disabled destructive actions), all against fake in-memory data.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/admin-ui/mock.html` (search, per-row actions, self-row disabling). Capture evidence via `chrome-headless-shell` into `features/admin-ui/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/admin-ui/spec.md
