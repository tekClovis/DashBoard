# Verification: reauth-button (third pass)

**Verdict: FAIL.** The second-pass defect is fixed. Clicking Reauthenticate on GitHub and then Disconnect on Steam while the reauth is pending now ends in `GET /api/oauth/github/start`. Shared builds, and the full web suite (312/312), server suite (727/727), typecheck and lint all pass. Item 3 still fails in the same way when the second click is another row's **Reauthenticate**. Reauth uses one shared `reauthDisconnect` mutation and one `reauthing` state for every row, so the second click replaces the first row's callbacks and pending state. GitHub's disconnect then succeeds, but `startConnect('github')` never runs and no error is shown.

Setup: I ran a production `vite build` of the branch's `web/` from a stub `/api` server on 127.0.0.1:18631. The stub had GitHub `REAUTH`, Steam `OK` and YouTube `REAUTH`, delayed each `DELETE /api/connections/:s` by 1.5-3 s, and could fail chosen services with a 500. `/api/oauth/:p/start` returns a stub page. I could not use the vite dev server because it hit the system's file-watcher limit (ENOSPC), and port 8080 belongs to another stack. Both the stub and the browser session have been stopped.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | A REAUTH row shows "Reauthenticate" and no "Disconnect" button | PASS | [01-services-reauth-and-ok-rows.png](01-services-reauth-and-ok-rows.png), [test-connections-page.txt](test-connections-page.txt) |
| 2 | An OK row still shows "Disconnect" and no "Reauthenticate" | PASS | [01-services-reauth-and-ok-rows.png](01-services-reauth-and-ok-rows.png), [test-connections-page.txt](test-connections-page.txt) |
| 3 | Clicking it calls disconnect, then, once that succeeds, `startConnect` for the same service. If disconnect fails, no connect starts and an error shows | **FAIL** | Passes: [api-request-log.txt](api-request-log.txt) section A (the sequence from the previous review, now fixed), [02-reauth-pending-and-steam-disconnecting.png](02-reauth-pending-and-steam-disconnecting.png), [03-github-oauth-start-reached.png](03-github-oauth-start-reached.png), [06-single-reauth-disconnect-failed.png](06-single-reauth-disconnect-failed.png) (section C). Fails: [api-request-log.txt](api-request-log.txt) section "B (run)", [04-two-reauths-pending.png](04-two-reauths-pending.png), [05-github-disconnected-no-signin.png](05-github-disconnected-no-signin.png) |
| 4 | The button is disabled and reads "Reauthenticating…" while the sequence runs | PASS for one reauth ([02](02-reauth-pending-and-steam-disconnecting.png)). In the failing case the GitHub button goes back to an enabled "Reauthenticate" while its DELETE is still in flight ([04](04-two-reauths-pending.png)). This has the same cause as item 3. | |
| 5 | `ConnectionsPage.spec.tsx` covers items 1-3, and tests, typecheck and lint pass | PASS | [test-connections-page.txt](test-connections-page.txt) (8/8), [test-web.txt](test-web.txt) (42 files, 312/312), [test-server.txt](test-server.txt) (66 files, 727/727), [typecheck-web.txt](typecheck-web.txt), [typecheck-server.txt](typecheck-server.txt), [lint.txt](lint.txt) (exit 0), [build-shared.txt](build-shared.txt) |

## Mock flows (`mock.html`)

| # | Flow / state | Result | Evidence |
|---|--------------|--------|----------|
| M1 | Success: disconnect, then redirect to sign-in | PASS (single reauth, and reauth plus another row's Disconnect) | [03-github-oauth-start-reached.png](03-github-oauth-start-reached.png), [api-request-log.txt](api-request-log.txt) A |
| M2 | Failure: "Could not disconnect GitHub" alert in the row, and focus returns to Reauthenticate | PASS. In the browser, `document.activeElement` was "Reauthenticate". | [06-single-reauth-disconnect-failed.png](06-single-reauth-disconnect-failed.png) |
| M3 | Pending: disabled "Reauthenticating…" with `aria-busy` | PASS for one reauth | [02-reauth-pending-and-steam-disconnecting.png](02-reauth-pending-and-steam-disconnecting.png) |

## Defect (items 3 and 4)

With two REAUTH rows (GitHub and YouTube), click Reauthenticate on GitHub, then Reauthenticate on YouTube while GitHub's request is pending. YouTube's button stays enabled during that time. In this run, YouTube's DELETE fails:

```
21:23:39.975Z DELETE /api/connections/github      <- Reauthenticate GitHub
21:23:39.993Z DELETE /api/connections/youtube     <- Reauthenticate YouTube during the pending GitHub reauth
21:23:42.990Z   -> 200 DELETE github
21:23:42.993Z GET /api/connections
21:23:42.993Z   -> 500 DELETE youtube
(no GET /api/oauth/github/start)
```

Result: GitHub is disconnected, shows "not connected" with a plain Connect button, and has no alert. No sign-in starts. The only error on the page is the one for YouTube. While the requests are in flight, GitHub's button already shows an enabled "Reauthenticate" again (screenshot 04).

Cause: `ConnectionsPage.tsx` gives all rows one `reauthDisconnect = useDisconnect()` and one `reauthing` state. `reauth(service)` passes `onSuccess`/`onError` to `reauthDisconnect.mutate(...)`, and TanStack Query only runs the per-call callbacks of the latest `mutate()`. The commit message names this exact problem. The new test only covers the case where the second click is a plain Disconnect. Two possible fixes: disable every Reauthenticate (and Disconnect) while a reauth is running, or run the sequence with per-call promises (`mutateAsync`) and keep reauth state per service. Either fix should come with a test that clicks two Reauthenticate buttons.

## Notes (not contract misses)
- If both DELETEs succeed in this scenario, the page redirects to YouTube's sign-in, and GitHub is left disconnected with no sign-in. Only one full-page redirect can happen, so the real fix is to block the second click.
- During "Redirecting…" the badge switches to "not connected", because the refetched list shows the service as disconnected. The mock keeps the warning badge.
- The row lookup in the tests depends on `closest('div[class*="flex-wrap"]')`, a Tailwind class name.
- The app does not announce the pending or redirecting steps through a live region, which the mock does. Only the failure uses `role="alert"`.
- Lint reports 33 warnings, all in files this branch does not touch.
- The "Live updates paused / Offline" banners in the screenshots come from the stub backend, which has no socket.io.

## Screenshots

REAUTH rows (GitHub, YouTube) next to an OK row (Steam):
![Rows](https://github.com/tekClovis/dashBoard/blob/feature/reauth-button/features/reauth-button/verification/01-services-reauth-and-ok-rows.png?raw=true)

Previous defect fixed. GitHub shows "Reauthenticating…" and Steam shows "Disconnecting…" at the same time:
![Reauth plus Disconnect](https://github.com/tekClovis/dashBoard/blob/feature/reauth-button/features/reauth-button/verification/02-reauth-pending-and-steam-disconnecting.png?raw=true)

The GitHub sign-in is still reached after Steam's Disconnect is clicked during the reauth:
![OAuth start](https://github.com/tekClovis/dashBoard/blob/feature/reauth-button/features/reauth-button/verification/03-github-oauth-start-reached.png?raw=true)

Defect. Reauthenticate on YouTube during GitHub's reauth: GitHub's button goes back to an enabled "Reauthenticate" while its DELETE is still in flight:
![Two reauths](https://github.com/tekClovis/dashBoard/blob/feature/reauth-button/features/reauth-button/verification/04-two-reauths-pending.png?raw=true)

Defect. GitHub ends up disconnected with no sign-in and no error. Only YouTube's failure is shown:
![GitHub dropped](https://github.com/tekClovis/dashBoard/blob/feature/reauth-button/features/reauth-button/verification/05-github-disconnected-no-signin.png?raw=true)

A single reauth whose disconnect fails: alert in the row, no connect started, focus back on Reauthenticate:
![Disconnect failed](https://github.com/tekClovis/dashBoard/blob/feature/reauth-button/features/reauth-button/verification/06-single-reauth-disconnect-failed.png?raw=true)
