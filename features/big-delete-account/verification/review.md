# Verification: big-delete-account (`5af870a`)

**Verdict: PASS.** This is a re-review after the fix commit `5af870a`. Both earlier FAILs are fixed:

- **e2e 429:** `users-delete.e2e-spec.ts` now runs `redis.flushdb()` in `beforeEach`. The full `npm run test:e2e` passed twice in a row: 14 files, 134/134 tests ([e2e.txt](e2e.txt), [e2e-rerun-verbose.txt](e2e-rerun-verbose.txt)). The e2e config sets `fileParallelism: false`, so the flush can't race other files.
- **Account-deleted notice:** `ProfilePage` now calls `navigate('/login', { state: { accountDeleted: true } })`, and `LoginPage` shows the mock's success notice. Compare screenshot 06 (the app) with 08 (the mock).

I ran the branch as an isolated compose stack (project `verifydel2`, `http://localhost:8093`, fresh Postgres, dummy OAuth credentials) and drove it with `agent-browser`. Test users were seeded with SQL: `ada` (USER, the one deleted), `lin` (USER, the share recipient), `boss` (the only ADMIN) and `tmp` (used for the raw-header check). Ada had 2 dashboards, a widget, a service connection, a GitHub identity, an email token, 2 outgoing shares (`lin` accepted "Shared" and left "Pending" pending) and 1 incoming share. The API and DB transcript is in [api-checks.txt](api-checks.txt). The network and socket log is in [ui-network.txt](ui-network.txt).

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | "Delete account" action opens a confirmation dialog; cancelling leaves the account intact | PASS | Screenshots 01, 02, 04. After Cancel, `ada` is still in the DB (count 1). Unit: `ProfilePage.spec.tsx > delete account > opens a dialog and cancelling does not delete` ([unit-feature-verbose.txt](unit-feature-verbose.txt)) |
| 2 | Confirm stays disabled until the typed text matches the email exactly | PASS | Screenshot 02 (empty, disabled), 03 (`ADA@example.com`, disabled), 05 (exact match, enabled). A trailing space and a truncated email also kept it disabled (agent-browser snapshot). Unit: `keeps confirm disabled until the typed text matches the email exactly` |
| 3 | Confirming calls `DELETE /users/me`, returns 204, clears the session cookie, lands on login | PASS | [ui-network.txt](ui-network.txt): `DELETE /api/users/me -> 204`, then `/auth/me -> 401`, and the browser cookie jar is empty afterwards. Raw headers in [api-checks.txt](api-checks.txt): `204` + `Set-Cookie: session=; Path=/; Expires=Thu, 01 Jan 1970`. The page ends at `/login` with the "Your account was deleted" notice (screenshot 06) |
| 4 | No `User`/`Dashboard`/`WidgetInstance`/`ServiceConnection`/`AuthIdentity`/`EmailToken`/`DashboardShare` rows left (query) | PASS | [api-checks.txt](api-checks.txt): the before query gives 1/2/1/1/1/1/3, the after query gives 0 for every table, and there are no orphan widgets or shares. e2e `3-5.` makes the same checks |
| 5 | Old password login fails; old cookie gets 401 on `/auth/me`; sockets disconnected | PASS | [api-checks.txt](api-checks.txt): login returns 401 `INVALID_CREDENTIALS`, and the old cookie gets 401 on `/auth/me`. [ui-network.txt](ui-network.txt): a separate socket.io client on ada's session logged `socket disconnected, reason: io server disconnect` when she deleted the account. e2e `3-5.` waits for the client `disconnect` event and passes in the full run |
| 6 | Accepted copy stays with recipient; pending shares disappear from incoming | PASS | [api-checks.txt](api-checks.txt): after the deletion `lin` still has "Shared" with its widget, and `lin`'s incoming list goes from `[Pending]` to `[]`. e2e `6.` passes |
| 7 | 401 without session; only the caller's account, no id parameter | PASS | [api-checks.txt](api-checks.txt): an anonymous `DELETE /users/me` returns 401. `DELETE /users/me/<id>` and `DELETE /users/<id>` both return 404, and `lin` is still in the DB. The controller takes the id from `@CurrentUser()` only. e2e `7.` passes |
| 8 | Only remaining admin gets 409 `LAST_ADMIN` and the UI shows the error | PASS | The API returns `{"error":"LAST_ADMIN"} 409` ([api-checks.txt](api-checks.txt)). Screenshot 07 shows the error alert, the URL stays `/profile`, and `boss` is still ADMIN in the DB ([ui-network.txt](ui-network.txt)). e2e `8.` and unit `refuses with 409 LAST_ADMIN` pass |
| 9 | Unit tests (service success + last-admin, ProfilePage dialog) and e2e for the endpoint | PASS | `users.service.spec.ts` (3 tests), `ProfilePage.spec.tsx > delete account` (4 tests), `LoginPage.spec.tsx` deletion-notice tests (2), `test/users-delete.e2e-spec.ts` (4 tests). See [unit-feature-verbose.txt](unit-feature-verbose.txt) and [e2e-rerun-verbose.txt](e2e-rerun-verbose.txt) |
| 10 | Unit, e2e, typecheck and lint pass | PASS | Unit: [unit-server.txt](unit-server.txt) 712/712, [unit-web.txt](unit-web.txt) 285/285. e2e: [e2e.txt](e2e.txt) and [e2e-rerun-verbose.txt](e2e-rerun-verbose.txt) both 134/134, exit 0. Typecheck: [typecheck.txt](typecheck.txt) server and web exit 0. Lint: [lint.txt](lint.txt) exit 0 (warnings only, none in the changed files) |

### Mock contract (`mock.html`)

| Mock state / flow | Result | Evidence |
|---|---|---|
| Profile "Danger zone" card with the description and a "Delete account" button | PASS | Screenshots 01 and 11 (mobile) |
| Delete dialog: open, empty | PASS | Screenshot 02. The title, body text and "Type `<email>` to confirm" label match the mock |
| Delete dialog: email typed | PASS | Screenshot 05 |
| Delete dialog: last admin error | PASS (wording differs, see note 1) | Screenshot 07 vs the mock in 09 |
| Delete dialog: deleting (input and Cancel disabled, "Deleting…") | PASS | Screenshot 10. I delayed the DELETE fetch in the page to capture it. Escape did not close the dialog while the request was pending |
| Cancel closes the dialog (and reopening starts empty) | PASS | Screenshot 04. On reopen the field was empty and the earlier error was gone |
| Confirm leads to the login page with "Your account was deleted" | PASS | Screenshot 06 (the app) vs 08 (the mock) |

## Notes (not contract misses)

1. The last-admin alert title is "Account not deleted", with "You're the only admin. Promote another user…" in the body. The mock uses "You're the only admin" as the title, puts the promote text in the body and shows an error icon.
2. The mock stacks the danger-zone text above a full-width button on mobile. The app keeps them side by side (screenshot 11 vs 12). It is still usable.
3. The mock dialog uses `role="alertdialog"` and puts initial focus on Cancel. The branch uses the default `Dialog` (`role="dialog"`).
4. The last-admin error stays visible while the user edits the field. It clears on the next confirm or when the dialog is reopened.
5. The last-admin count excludes banned admins (`bannedAt: null`). That matches the intent but the spec doesn't state it.
6. Under real concurrency the serializable transaction can throw Prisma `P2034`, and nothing maps it, so it becomes a 500. Two concurrent deletes of the same user would also give a `P2025` 500. Both are edge cases.
7. The deletion notice comes from router history state, so reloading `/login` right after a deletion may show it again. I did not test this.
8. `features/big-delete-account/` (spec, mock) is not committed on the branch (`features` is gitignored). I read the spec from the main checkout.
9. To run e2e in the worktree, I had to add a temporary `node_modules` symlink to the main checkout, because `testcontainers.ts` resolves `../../node_modules/.bin/prisma`. I removed it afterwards.

## Screenshots

01. Profile with the Danger zone
![01](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/01-profile-danger-zone.png?raw=true)

02. Dialog open, empty, confirm disabled
![02](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/02-dialog-open-empty.png?raw=true)

03. Wrong case typed, confirm disabled
![03](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/03-dialog-wrong-case-disabled.png?raw=true)

04. After Cancel
![04](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/04-after-cancel.png?raw=true)

05. Exact email typed, confirm enabled
![05](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/05-dialog-email-typed-enabled.png?raw=true)

06. After delete: login page with the account-deleted notice
![06](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/06-after-delete-login-notice.png?raw=true)

07. Only admin: delete refused
![07](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/07-last-admin-error.png?raw=true)

08. Mock: login after account deletion
![08](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/08-mock-login-after-deletion.png?raw=true)

09. Mock: last admin error
![09](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/09-mock-last-admin-error.png?raw=true)

10. Dialog while deleting
![10](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/10-dialog-deleting.png?raw=true)

11. Profile on mobile (390px)
![11](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/11-profile-mobile.png?raw=true)

12. Mock: profile on mobile
![12](https://github.com/tekClovis/dashBoard/blob/feature/big-delete-account/features/big-delete-account/verification/12-mock-profile-mobile.png?raw=true)
