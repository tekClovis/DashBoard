## Scope

Restyle `web/src/routes/DashboardPage.tsx`: page head (dashboard title, counters line, Add widget), grid spacing per design-reference §2 (margin [8,8], rowHeight 60), empty canvas with Add widget / Connect services, widget menu (Configure, Size items, Move, Remove), drag guides/placeholder readout and resize visuals, undo-remove bar, and the dashboard-level error states, using the existing layout and dashboards APIs.

## Non-goals

- Add/configure dialog internals (`mockui-add-widget`).
- New dashboard endpoints or layout persistence changes.

## Verification checklist

1. Populated dashboard matches `07-dashboard` (dark+light, 1440+375).
2. Open widget menu matches `08-dashboard-widget-menu`; Size items resize the widget through the existing layout save.
3. Dragging matches `09-dashboard-dragging` and resizing matches `10-dashboard-resizing` (1440, both themes).
4. A dashboard with no widgets matches `11-dashboard-empty`.
5. Dashboard with failing widgets matches `14-dashboard-errors`; reconnecting/offline pages match `12` / `13` with the grid content.
6. Remove shows the undo bar; Undo restores the widget before it is deleted server-side, otherwise the existing delete API is called.
7. Existing dashboard tests pass (markup updates only); `npm test`, `npx tsc --noEmit`, `npm run lint` in `web/` pass.

## Constraints

Depends on: mockui-widget-frame
- Visual reference: `mocks/index.html` (read-only; every state reachable by URL hash, e.g. `#screen=services&services=reauth&theme=light&freeze=1&tw=closed`) and `mocks/design-reference.md`; reference screenshots in `mocks/screenshots/NN-<state>--<theme>-<width>.png`.
- Screenshot evidence is captured with `agent-browser` against the running app, at 1440 and 375 px, in dark and light, next to the matching reference screenshot.
- No server, `shared/` or API contract changes. No new npm dependencies; no new Radix packages.
- Tokens, fonts and primitives come from `mockui-foundation`; do not redefine them per page.
