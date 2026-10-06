# big-reconnect-redirect: verification

**Verdict: PASS**

This is a re-review after the fix in `ac339ce`, which changed only `server/test/oauth.e2e-spec.ts`. The spec declares `UI: none`, so every item is backed by an automated test on the branch. Every evidence file in this folder was regenerated for this review.

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Password and OAuth login as an existing user with dashboards land on `/d/<id>` of the first dashboard | PASS | OAuth: the e2e tests "logs in the existing identity owner…", "auto-links…" and "creates a new verified user…" now assert `location` contains `/d/${first.id}`, for both GitHub and Google ([e2e-oauth-login.txt](e2e-oauth-login.txt)). The unit test `oauth.controller.spec.ts` "sets a session cookie … and redirects into the app" covers the first existing dashboard ([server-oauth-controller-unit.txt](server-oauth-controller-unit.txt)). Password: `LoginPage.spec.tsx` "navigates home after a successful login", then `RootRedirect.spec.tsx` "sends an authenticated visitor to their first dashboard" ([web-redirect-unit.txt](web-redirect-unit.txt)). |
| 2 | Logging out and back in lands on the same dashboard, not `/d/placeholder` | PASS | The e2e test "lands on the same dashboard when logging in again" (github and google) runs two full login handshakes and sends no session cookie. It asserts both redirects are equal, neither contains `placeholder`, and the user still has exactly one dashboard ([e2e-oauth-login.txt](e2e-oauth-login.txt)). |
| 3 | Visiting `/` while authenticated redirects to the first dashboard | PASS | `RootRedirect.spec.tsx` "sends an authenticated visitor to their first dashboard" ([web-redirect-unit.txt](web-redirect-unit.txt)) |
| 4 | A user with zero dashboards gets a default dashboard and lands on it | PASS | `RootRedirect.spec.tsx` "creates a default dashboard for a user with none and lands on it". `oauth.controller.spec.ts` "creates a default dashboard and lands on it when the user has none". The e2e login tests start with users who have no dashboards and assert a redirect to the dashboard that gets created ([web-redirect-unit.txt](web-redirect-unit.txt), [server-oauth-controller-unit.txt](server-oauth-controller-unit.txt), [e2e-oauth-login.txt](e2e-oauth-login.txt)). |
| 5 | `grep -r placeholder` finds no dashboard-id fallback in `web/src/routes` or `oauth.controller.ts` | PASS | [grep-placeholder.txt](grep-placeholder.txt): the only matches are an input `placeholder=` attribute, a test comment and the react-grid-layout drag placeholder. None is in `oauth.controller.ts`, and none is a dashboard-id fallback. |
| 6 | Unit, e2e, typecheck and lint pass | PASS | Unit: server 655/655 and web 211/211 pass ([unit-all.txt](unit-all.txt)). E2E: 12 files and 116/116 tests pass ([e2e-all.txt](e2e-all.txt)). Typecheck: server and web `tsc` both exit 0 ([typecheck.txt](typecheck.txt)). Lint exits 0 ([lint.txt](lint.txt)). |

## Notes
- The re-login test runs two session-less login handshakes in a row. It does not call `/api/auth/logout` between them. This is equivalent on the server, because the redirect depends only on the user's dashboards, but no test drives the full logout → login sequence end to end.
- In the e2e tests every user starts with zero dashboards. Only the unit tests (mocked) cover picking the first dashboard by `position` among several existing dashboards. No e2e test seeds multiple dashboards.
- `useHomeDashboardId` triggers `create.mutate` from an effect guarded by `create.isIdle`. If that mutation fails, `/` and `/login` stay on "Loading…" with no retry and no error shown.
- `RedirectIfAuthed` creates a default dashboard as a side effect of visiting `/login` or `/register` while authenticated, and no test covers this. `web/src/routes/RedirectIfAuthed.spec.tsx` does not exist.

## Screenshots
None. The spec declares `UI: none`.
