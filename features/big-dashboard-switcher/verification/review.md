# Review: big-dashboard-switcher (re-review after d16f587)

**Verdict: PASS.** All six checklist items pass, and so do all the `mock.html` states that were checked. The last review's one miss was the mobile switcher menu. It is fixed, and that was checked in a real browser at 390 px.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | The app shell lists the user's dashboards and highlights the active one | PASS | [01-list-single.png](01-list-single.png), [04-created-active.png](04-created-active.png), [09-renamed-after-reload.png](09-renamed-after-reload.png). The active row has a check mark, a background and `aria-current="page"` |
| 2 | Creating a dashboard adds it to the list and navigates to it | PASS | [03-create-dialog.png](03-create-dialog.png), then [04-created-active.png](04-created-active.png). The URL changed to `/d/7ed34559-…` and "Work" is in the list and active |
| 3 | Switching changes the URL to `/d/<id>` and shows only that dashboard's widgets | PASS | [05-switched-home.png](05-switched-home.png): `/d/0a11f678-…`, HOME-WIDGET shown, WORK-WIDGET absent. [06-switched-work.png](06-switched-work.png): `/d/7ed34559-…`, WORK-WIDGET shown, HOME-WIDGET absent |
| 4 | A renamed dashboard keeps its new name in the list after a reload | PASS | [08-rename-dialog.png](08-rename-dialog.png), then a full reload: [09-renamed-after-reload.png](09-renamed-after-reload.png) lists "My Dashboard" and "Office". A case-insensitive duplicate name is rejected with "You already have a dashboard with this name.": [07-rename-duplicate-error.png](07-rename-duplicate-error.png) |
| 5 | Deleting a dashboard removes it and navigates to another; the last one cannot be deleted | PASS | Deleted the active "Office" from the mobile menu: [10-delete-dialog-mobile.png](10-delete-dialog-mobile.png). The app went to `/d/0a11f678-…`, and the list now has only "My Dashboard": [11-after-delete.png](11-after-delete.png). When only one dashboard is left, the trash button is disabled and opens "This is your only dashboard": [02-only-dashboard-dialog.png](02-only-dashboard-dialog.png) |
| 6 | Unit, e2e, typecheck and lint pass | PASS | [unit-web.txt](unit-web.txt) (36 files / 222 tests), [unit-server.txt](unit-server.txt) (58 / 649), [e2e.txt](e2e.txt) (12 / 114), [build-typecheck.txt](build-typecheck.txt) (`tsc --noEmit` exit 0, `npm run build` exit 0), [lint.txt](lint.txt) (exit 0; one existing warning in `client.ts`, which this branch doesn't touch) |

## Mock states

- PASS: the mobile switcher menu at 390 × 844. The menu is `position: fixed` at left 8 / right 382 / top 52 px, which matches the mock's `.sw-menu { left: 8px; right: 8px; top: 52px }`. `scrollWidth` is 390 for both the document and the body, so there is no horizontal scroll. Both trash buttons sit fully on screen at 341–377 px, and `elementFromPoint` at a trash button's center hits that same button. Tapping it opens the delete dialog. Evidence: [15-mobile-switcher.png](15-mobile-switcher.png), [10-delete-dialog-mobile.png](10-delete-dialog-mobile.png).
- PASS: the brand is hidden on mobile. At 390 px the header brand link has computed `display: none` ([14-mobile-header.png](14-mobile-header.png)).
- PASS: the desktop menu still works at 1280 px. It is an `absolute` 256 px popover anchored to the button ([11-after-delete.png](11-after-delete.png)).
- PASS: "Dashboard not found". A deleted dashboard's URL ([12-deleted-url-not-found.png](12-deleted-url-not-found.png)) and `/d/unknown` ([13-unknown-url.png](13-unknown-url.png)) both show the mock's text and a "Go to My Dashboard" link.
- PASS: the only-dashboard delete dialog ([02-only-dashboard-dialog.png](02-only-dashboard-dialog.png)).

## Notes (not contract misses)

- Each row in the mock's list shows the dashboard's widget count, and the mock's delete dialog says "removes the dashboard and its N widgets". The branch shows neither.
- In the mock, the page `<h1>` is the dashboard's name. The branch still shows the generic "Dashboard" heading.
- When `/api/dashboards` fails, the mock shows a "Couldn't load your dashboards" alert in the main area. The branch shows the error only inside the switcher menu. This was read from the code in the previous review and not exercised live.
- There are no tests for the failure states of create, rename or delete.
- `features/` is untracked on the branch, so `spec.md` and `mock.html` are not committed.
- Verification environment: the main checkout's Docker stack already uses `:8080`. The branch's build ran on `:8081` through a listen-port shim, from a copy outside `.claude/`, against its own postgres, redis and mailpit containers. All of these were stopped afterwards.

## Screenshots

![01-list-single](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/01-list-single.png?raw=true)
![02-only-dashboard-dialog](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/02-only-dashboard-dialog.png?raw=true)
![03-create-dialog](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/03-create-dialog.png?raw=true)
![04-created-active](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/04-created-active.png?raw=true)
![05-switched-home](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/05-switched-home.png?raw=true)
![06-switched-work](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/06-switched-work.png?raw=true)
![07-rename-duplicate-error](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/07-rename-duplicate-error.png?raw=true)
![08-rename-dialog](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/08-rename-dialog.png?raw=true)
![09-renamed-after-reload](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/09-renamed-after-reload.png?raw=true)
![10-delete-dialog-mobile](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/10-delete-dialog-mobile.png?raw=true)
![11-after-delete](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/11-after-delete.png?raw=true)
![12-deleted-url-not-found](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/12-deleted-url-not-found.png?raw=true)
![13-unknown-url](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/13-unknown-url.png?raw=true)
![14-mobile-header](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/14-mobile-header.png?raw=true)
![15-mobile-switcher](https://github.com/tekClovis/dashBoard/blob/feature/big-dashboard-switcher/features/big-dashboard-switcher/verification/15-mobile-switcher.png?raw=true)
