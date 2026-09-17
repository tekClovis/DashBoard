## Scope
Build the dashboard grid that replaces `DashboardPlaceholderPage.tsx`'s body, per `docs/Architecture.md` §9:

- `react-grid-layout` grid, 12 columns on `lg`, responsive: below `md`, widgets stack single-column ordered by `(y, x)` and drag is disabled. `onDragStop`/`onResizeStop` call `PATCH /api/dashboards/{id}/layout` (from `dashboards-api`).
- `WidgetFrame` component (`web/src/components`): chrome around every widget instance — title, loading skeleton (before first `widget:data`), error state + "Reconnect" state (on `widget:error` with `REAUTH_REQUIRED`/`NOT_CONNECTED`, linking to `/services`), and a menu (shadcn `DropdownMenu`) with Configure / Delete / keyboard-accessible Move up/down/left/right (adjusts `x`/`y` and PATCHes layout, per the accessibility requirement in Architecture §9).
- Add/Configure dialog (shadcn `Dialog`), four steps: (1) pick a widget grouped by service from `useCatalog()`, with widgets from unconnected services disabled + a "Connect" link to `/services`; (2) `ParamForm` generated from the widget's `ParamSpec[]` (enum → select, integer → number input with min/max, pattern → inline-validated text input); (3) refresh rate input prefilled with `minRefreshSec`, validated `minRefreshSec..86400`; (4) confirm — calls `POST /api/dashboards/{id}/widgets`. The same dialog, prefilled from the instance, is reused for Configure (`PATCH /api/widgets/{id}`).
- Body of each widget renders from a view registry keyed `'service.widget'`; since no real widget views exist yet, register one generic fallback view that just prints the raw `widget:data` payload as JSON — real views are added later per-widget without touching this feature.
- `aria-live="polite"` on the value/content region only (not the whole card) for widget updates; visible focus rings throughout (already covered by shadcn defaults).

## Non-goals
- Any real per-widget view component (weather chart, commit list, etc.) — the generic JSON fallback view is enough; those are added later alongside their `services/<name>` fetch code.
- The Services/Profile/Admin pages and the socket/query wiring itself — `frontend-shell` (this feature consumes `useWidgetData`, `useDashboards`, `useCatalog` from it).

## Verification checklist
1. Adding a widget through the 4-step dialog (pick weather-like fake widget → fill params → set refresh rate → confirm) creates an instance and it appears on the grid immediately.
2. A widget from an unconnected service is disabled in step 1 with a visible "Connect" affordance; selecting it is not possible.
3. `ParamForm` renders an enum param as a select, an integer param as a bounded number input, and a pattern-constrained string param with inline validation feedback on an invalid value — using one fake widget definition exercising all three.
4. Dragging or resizing a widget on `lg` calls the layout PATCH with the new `x/y/w/h`; reloading preserves the new position.
5. Below the `md` breakpoint, widgets render stacked in a single column ordered by `(y, x)` and drag handles are inert (no drag-triggered layout change).
6. `WidgetFrame` shows a loading skeleton before the first `widget:data` arrives, the JSON-fallback content after, and an error/"Reconnect" card (linking to `/services`) on a `widget:error` with `REAUTH_REQUIRED` or `NOT_CONNECTED`.
7. The widget menu's Configure option reopens the same dialog prefilled with the instance's current params/refreshRate, and saving calls `PATCH /api/widgets/{id}`.
8. The widget menu's Delete option calls `DELETE /api/widgets/{id}` and removes it from the grid.
9. The widget menu's Move up/down/left/right options change grid position via keyboard alone (no mouse) and persist via the layout PATCH.
10. The live-updating value region uses `aria-live="polite"` scoped to the value, not the outer card (inspect the DOM).

## Constraints
- Depends on `frontend-shell` (`SocketProvider`/`useWidgetData`, `useCatalog`, `useDashboards`) and `dashboards-api`/`catalog-api` for the real endpoints/shapes — code against their spec.md contracts if not yet merged.
- Do not build any concrete `service.widget` view beyond the generic JSON fallback.
- `mock.html`: a clickable grid with 2-3 fake widget cards (one loading, one with data, one errored/reconnect), the full 4-step Add dialog, a Configure reopen, drag/resize (can be simplified to click-to-cycle position if a JS grid library isn't wired into the static mock), and keyboard Move buttons in the card menu.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/widget-grid-ui/mock.html` (grid card states, the 4-step Add/Configure dialog, and the menu's Move/Delete actions). Capture evidence via `chrome-headless-shell` into `features/widget-grid-ui/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/widget-grid-ui/spec.md
