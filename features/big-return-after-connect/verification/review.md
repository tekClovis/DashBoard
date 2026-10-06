# Review: big-return-after-connect (3rd pass)

Verdict: **FAIL**

`UI: none`, so the evidence is test output saved in this directory.

| # | Checklist item | Verdict | Evidence |
|---|---|---|---|
| 1 | Connect intent lands on `/d/<id>` of the first dashboard | PASS | [unit-oauth.txt](unit-oauth.txt): `oauth.controller.spec.ts` connect cases expect `${APP_URL}/d/d1` and `dashboards.list('u1')`; `test/connections.e2e-spec.ts` asserts `/\/d\/[^/?]+$/` (e2e did not run here, see item 6) |
| 2 | Link intent lands on `/d/<id>` of the first dashboard | PASS | [unit-oauth.txt](unit-oauth.txt): link case expects `${APP_URL}/d/d1`; `test/oauth.e2e-spec.ts` updated |
| 3 | Neither flow ends on `/connections` or `/profile` | PASS | [unit-oauth.txt](unit-oauth.txt): exact-once redirect assertions on `/d/d1` |
| 4 | A failed/denied OAuth still shows an error to the user | **FAIL** | The server redirects to `/connections?error=OAUTH_DENIED`, `/profile?error=OAUTH_DENIED` or `/login?error=OAUTH_DENIED` (`oauth.guard.ts` `redirectDenied`). No web page reads that code: `ConnectionsPage.tsx` never reads `error` (so `CONNECT_FAILED` is ignored too), `ProfilePage.tsx` only handles `IDENTITY_ALREADY_LINKED` and `LoginPage.tsx` only handles `EMAIL_LINK_REQUIRED`. The user is redirected without seeing any error. Steam OpenID cancel (`openid.mode=cancel`) also has no denial path. |
| 5 | Controller unit/e2e tests cover both redirect targets | PASS | [unit-oauth.txt](unit-oauth.txt) (87/87); e2e specs updated in `connections.e2e-spec.ts` and `oauth.e2e-spec.ts` |
| 6 | Unit, e2e, typecheck and lint pass | **FAIL** | [typecheck.txt](typecheck.txt) passes and [lint.txt](lint.txt) passes with warnings only. [unit-all.txt](unit-all.txt): 1 failure, `src/admin/dto/list-users-query.dto.spec.ts`. [e2e.txt](e2e.txt): all 13 suites fail at bootstrap with `Nest can't resolve dependencies of the RolesGuard (?) ... Reflector ... AdminModule` |

## Notes
- The item 6 failures are in admin code this branch does not touch, and they look like a decorator-metadata problem in this environment. They still need to pass on a clean run before merging.
- `dashboardUrl` falls back to `/d/placeholder` when the user has no dashboard. The fallback is the same as in login, but it is not covered by a test.
- To fix item 4, read `?error=OAUTH_DENIED` (and `CONNECT_FAILED`) on the Connections, Profile and Login pages and show a message, as `ProfilePage` already does for `IDENTITY_ALREADY_LINKED`.

## Screenshots
None (`UI: none`).
