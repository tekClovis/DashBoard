# Review: fix-first-widget-width

**Verdict: FAIL**

Fix: `web/src/routes/DashboardPage.tsx` now keeps the `useContainerWidth` ref node (`<div ref={containerRef}>`) mounted across the empty, grid and stacked states. Before the fix, the measured node was unmounted when the dashboard went empty, so the grid that mounted later was never observed and got width 0 (about 2px widgets). The new regression tests fail against `main`'s `DashboardPage.tsx` (2 of 9) and pass on the branch.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | First widget on an empty dashboard renders at default width with no reload | PASS | [dashboard-grid-spec.txt](dashboard-grid-spec.txt): "gives the grid the measured container width once widgets appear after an empty dashboard" and "keeps the measured grid container observed and attached" pass. [dashboard-grid-spec-prefix.txt](dashboard-grid-spec-prefix.txt): the same tests fail against `main`'s DashboardPage.tsx. Real app at 1280px: first widget is 405px wide (4 of 12 cols in a 1232px container) with no reload (screenshot 01). |
| 2 | Width still correct after reload, unchanged | PASS | Test "measures the same width when the page loads with widgets already stored (reload)" ([dashboard-grid-spec.txt](dashboard-grid-spec.txt)). Real app after a full page load: 405px (screenshot 02). |
| 3 | Second and third widgets lay out correctly | PASS | Test "lays out a second and third widget after the first one on a formerly empty dashboard" ([dashboard-grid-spec.txt](dashboard-grid-spec.txt)). Real app: three widgets, each 405px wide, stacked at y 0/4/8 (screenshot 03). |
| 4 | Delete all widgets, add one again: full width, no reload | FAIL | No test on the branch removes widgets. The test whose comment claims to cover this ("Covers adding the first widget, deleting all then adding one again") only goes loading, then empty, then one widget, and never goes from widgets to empty. In the real app it works: after removing all 3 widgets and adding one, it renders at 405px (screenshots 04, 05). But `UI: none` requires an automated test. |
| 5 | `smoke.sh` no longer reloads before its check and passes | FAIL | `smoke.sh` is in `.claude/skills/run-dashboard/`, which is untracked, so its change is not on `feature/fix-first-widget-width` and will not ship with this PR. The local copy has no reload command, but its header comment still says "reload". It does not pass: 3 out of 3 runs exit 1 at the first step (`open http://localhost:8080/login` gets a Nest JSON 404 `Cannot GET /login`, so `input[type=email]` is never found). See [smoke.txt](smoke.txt), [smoke-run2.txt](smoke-run2.txt), [smoke-run3.txt](smoke-run3.txt). |
| 6 | Existing tests, typecheck and lint pass | PASS | Web tests 35 files / 214 tests ([web-tests.txt](web-tests.txt)). Server tests 58 files / 649 tests ([server-tests.txt](server-tests.txt)). Web tsc ([web-typecheck.txt](web-typecheck.txt)) and server tsc ([server-typecheck.txt](server-typecheck.txt)) are clean. Web lint ([web-lint.txt](web-lint.txt)) and server lint ([server-lint.txt](server-lint.txt)) exit 0; the server lint warnings were already there. |

## Notes

- The server returns 404 for SPA deep links (`/login`, `/d/<id>`), and only `/` serves `index.html`. The branch does not touch `server/`, so this is probably an existing bug, but it breaks `smoke.sh` and any browser reload on a dashboard URL. For item 2, the reload was done by loading `/`.
- `.claude/skills/run-dashboard/SKILL.md` still lists the "first widget renders about 2px wide ... smoke.sh reloads before asserting" gotcha.
- The fix also wraps the mobile stacked layout in the measured div. This is harmless: the extra wrapper has no classes.
- Measurements were taken from `getBoundingClientRect()` of `[data-widget-id]` in agent-browser at a 1280x577 viewport.

## Screenshots

Empty dashboard:
![empty](https://github.com/tekClovis/dashBoard/blob/feature/fix-first-widget-width/features/fix-first-widget-width/verification/00-empty-dashboard.png?raw=true)

First widget, no reload (405px):
![first](https://github.com/tekClovis/dashBoard/blob/feature/fix-first-widget-width/features/fix-first-widget-width/verification/01-first-widget-no-reload.png?raw=true)

After a full page load (405px):
![reload](https://github.com/tekClovis/dashBoard/blob/feature/fix-first-widget-width/features/fix-first-widget-width/verification/02-after-reload.png?raw=true)

Three widgets:
![three](https://github.com/tekClovis/dashBoard/blob/feature/fix-first-widget-width/features/fix-first-widget-width/verification/03-three-widgets.png?raw=true)

All widgets deleted:
![deleted](https://github.com/tekClovis/dashBoard/blob/feature/fix-first-widget-width/features/fix-first-widget-width/verification/04-all-deleted.png?raw=true)

Re-added after deleting all (405px):
![readded](https://github.com/tekClovis/dashBoard/blob/feature/fix-first-widget-width/features/fix-first-widget-width/verification/05-readded-after-delete-all.png?raw=true)

Smoke run result (screenshot not produced; see smoke.txt).
