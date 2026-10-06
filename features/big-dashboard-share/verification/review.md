# Verification: big-dashboard-share (second re-review, `a4df07d`)

**Verdict: FAIL.** Checklist item 6 still fails because the branch has no Playwright run. Every other checklist item and mock flow now passes.

I ran the branch as an isolated compose stack (project `verifyshare2`, port 8091) on a **fresh Postgres volume**, then drove it with `agent-browser` as ada (sender), lin (recipient) and eve (third user). All three migrations, including the new `20261006120000_dashboard_share_status`, applied cleanly ([migrate-fresh-db.txt](migrate-fresh-db.txt) has the migrate log, the `\d "DashboardShare"` output with `status "ShareStatus" NOT NULL DEFAULT 'PENDING'`, and `_prisma_migrations`). The API transcript is in [api-checks.txt](api-checks.txt).

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Owner can share to an existing user; unknown user shows an error | PASS | [api-checks.txt](api-checks.txt): lin gets 201, unknown gets 400 `UNKNOWN_USER`, self gets 400, a duplicate gets 409 `ALREADY_SHARED`, a non-owner gets 404. UI: screenshots 02, 03, 04, 05, 06 |
| 2 | Recipient sees the incoming share (name, sender) | PASS | [api-checks.txt](api-checks.txt) `GET /shares/incoming` returns `dashboardName` and `fromEmail`. UI: screenshots 07, 08 |
| 3 | Accepting adds a dashboard with the same widgets and layout | PASS | [api-checks.txt](api-checks.txt): the copy's service/widget/params/refreshRate/x/y/w/h are `IDENTICAL` to the original, 0 widget ids are shared, and a second accept returns 404. UI: screenshots 10, 11, 12 (see the width note) |
| 4 | Editing or deleting the copy doesn't change the original, and vice versa | PASS | [api-checks.txt](api-checks.txt): changing the layout and params, deleting a widget and renaming the copy leave the original unchanged (`ORIGINAL UNCHANGED`). Editing params on the original and renaming it leave the copy unchanged (`COPY UNCHANGED`). Deleting the original keeps lin's copy and its widgets |
| 5 | Non-recipients cannot accept or read a share (403/404) | PASS | [api-checks.txt](api-checks.txt): eve and ada get 404 on accept, eve gets 404 on decline, lin gets 404 declining eve's share, anonymous gets 401, and eve's and ada's incoming lists are empty. The new `GET /dashboards/{id}/shares` gives 404 to non-owners (eve, lin) and 401 to anonymous |
| 6 | End-to-end Playwright run passes (connect, re-login, add weather/YouTube/Steam via search with thumbnails, switch, share and accept) | **FAIL** | No Playwright dependency, config or spec on the branch (`git ls-files \| grep -ci playwright` gives 0, and no `playwright` in any `package.json`). The builder confirms it deliberately skipped this because a new dependency needs the user's approval. The Vitest/supertest e2e suite does not drive a browser |
| 7 | Unit, e2e, typecheck and lint pass | PASS | [unit-server.txt](unit-server.txt) 669/669, [unit-web.txt](unit-web.txt) 235/235, [e2e.txt](e2e.txt) 13 files / 122 tests, [typecheck.txt](typecheck.txt) server and web exit 0, [lint.txt](lint.txt) exit 0 (warnings only) |

### Mock contract (`mock.html`)

| Mock state / flow | Result | Evidence |
|---|---|---|
| `Share` button in the dashboard header | PASS (fixed) | Screenshot 01 |
| `Shared with you` top-bar button with a pending count | PASS (fixed) | Screenshots 01 (no count), 07 (count 1) |
| Share errors: unknown user / duplicate | PASS | Screenshots 03, 05 |
| "Sent" state with "Share with someone else" / "Done" | PASS (fixed) | Screenshots 04, 06. "Share with someone else" returns to an empty form, and "Done" closes the dialog |
| "Shared from this dashboard" list with Waiting / Added a copy / Declined | PASS (fixed) | Screenshots 04 and 06 (Waiting), 15 (lin "Added a copy", eve "Declined"). The statuses persist on the server ([api-checks.txt](api-checks.txt)) |
| Stale "Sent" message next to the duplicate error | PASS (fixed) | Screenshot 05: after sending, then "Share with someone else" and resending to lin, only the "Already shared…" error shows |
| Incoming list, decline confirm (`Decline this share? … isn't told.`, Decline / Keep) | PASS | Screenshots 08, 09, 13. Keep restores the row, and confirming leaves the list empty with the status DECLINED |
| Incoming row "gone" + Dismiss | PASS | Screenshot 14 (ada deleted the dashboard while eve's dialog was open). Dismiss empties the list |

## Notes

- **Accepted copy renders as about 2px slivers until a reload.** Right after accepting, both widgets measure `[2,2]` px (screenshot 10). After a reload they measure `[405,612]` (screenshot 11). `main` fixed this in `fix-first-widget-width`, but the branch is **16 commits behind `main`** and needs a merge or rebase before it ships.
- **Copy and wording differ from the mock.** The field accepts only email ("Recipient email"). The mock says "Email or username", but `User` has no username. The sent state is a green line ("Sent to …") instead of the mock's "Shared with …" band. The status badges are plain muted text, not tinted badges. The generic error says "Couldn't send the dashboard. Try again." The mock says "Couldn't send the share. Check your connection and try again." The empty inbox says "Nothing shared with you right now." without the mock's sub-line.
- **The "Shared with you" count is stale.** The count only updates on page load or when the inbox opens, because the query has no periodic refetch. In the "gone" test the top-bar button showed no count while a share was pending.
- **Re-sharing resets the history.** Re-sharing to someone who already answered reopens the same row as PENDING (same id, unique `dashboardId+toUserId`). An earlier "Added a copy" status is overwritten, so the sender loses that history ([api-checks.txt](api-checks.txt), "re-share" section).
- **A decline that hits a removed share shows the generic error.** If the share was removed, a decline returns 404 and the row shows "Something went wrong" instead of the "no longer available" state. Only accept maps 404 to "gone".
- **Accept can race.** `accept` reads the PENDING row and then updates it in the same transaction without a lock or a conditional update, so two concurrent accepts could both create a copy. A double-click is guarded in the UI because the button is disabled while pending.
- **User enumeration on `POST /dashboards/{id}/share` remains.** An existing address gets 201 and an unknown one gets 400 `UNKNOWN_USER`. The spec asks for this error, so it is a known trade-off.
- The page heading reads "Dashboard" and not the dashboard name. This predates the branch.
- `docs/Architecture.md` §4 and §8 are updated, including the `ShareStatus` enum and `GET /dashboards/{id}/shares`.

## Screenshots

01-owner-header-share-and-inbox
![01-owner-header-share-and-inbox](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/01-owner-header-share-and-inbox.png?raw=true)

02-share-dialog
![02-share-dialog](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/02-share-dialog.png?raw=true)

03-share-unknown-user
![03-share-unknown-user](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/03-share-unknown-user.png?raw=true)

04-share-sent-state
![04-share-sent-state](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/04-share-sent-state.png?raw=true)

05-share-duplicate-no-stale-success
![05-share-duplicate-no-stale-success](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/05-share-duplicate-no-stale-success.png?raw=true)

06-share-sent-second
![06-share-sent-second](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/06-share-sent-second.png?raw=true)

07-recipient-topbar-count
![07-recipient-topbar-count](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/07-recipient-topbar-count.png?raw=true)

08-incoming-shares
![08-incoming-shares](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/08-incoming-shares.png?raw=true)

09-decline-confirm
![09-decline-confirm](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/09-decline-confirm.png?raw=true)

10-accepted-copy
![10-accepted-copy](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/10-accepted-copy.png?raw=true)

11-accepted-copy-after-reload
![11-accepted-copy-after-reload](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/11-accepted-copy-after-reload.png?raw=true)

12-recipient-dashboard-list
![12-recipient-dashboard-list](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/12-recipient-dashboard-list.png?raw=true)

13-after-decline
![13-after-decline](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/13-after-decline.png?raw=true)

14-share-gone
![14-share-gone](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/14-share-gone.png?raw=true)

15-sender-status-list
![15-sender-status-list](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-share/features/big-dashboard-share/verification/15-sender-status-list.png?raw=true)

