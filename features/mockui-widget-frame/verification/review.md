## Verification: mockui-widget-frame (PASS)

| # | Checklist item | Result | Evidence |
|---|---|---|---|
| 1 | Each frame state (live, loading, stale, paused, NOT_CONNECTED, REAUTH_REQUIRED, RATE_LIMITED, UPSTREAM_ERROR, INVALID_PARAMS) renders like its panel in `19-widget-states` | PASS | [01-dashboard--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/01-dashboard--light-1440.png?raw=true), [02-states--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/02-states--light-1440.png?raw=true), [03-states--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/03-states--light-375.png?raw=true), [06-states--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/06-states--dark-1440.png?raw=true), [07-states--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/07-states--dark-375.png?raw=true), paused [05-paused--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/05-paused--light-1440.png?raw=true), wide/narrow container queries [04-wide-and-narrow--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/04-wide-and-narrow--light-1440.png?raw=true) [11-narrow-panels--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/11-narrow-panels--dark-1440.png?raw=true) |
| 2 | Lamp shape + colour + text label per §4; green only for live | PASS | [02-states--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/02-states--light-1440.png?raw=true), [05-paused--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/05-paused--light-1440.png?raw=true), [06-states--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/06-states--dark-1440.png?raw=true). Computed styles: live = filled circle `--live`; stale/paused = 1.5 px `--warning` ring; warn = 7 px `--warning` diamond; error = `--destructive` square; waiting = dashed `--muted-foreground` ring; 7% tone tint on warn/error headers. The sweep and ping run only on a live panel; a Configure save went error → loading (no `data-pulse`) → live (`data-pulse` for 900 ms) [09-configure-save-live--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/09-configure-save-live--dark-1440.png?raw=true) |
| 3 | Error bands use the §5 copy; the action links to Services or opens Configure | PASS | [02-states--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/02-states--light-1440.png?raw=true), Configure opens [08-invalid-params-configure-opens--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/08-invalid-params-configure-opens--dark-1440.png?raw=true), Connect GitHub goes to `/services` [10-connect-github-goes-to-services--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/10-connect-github-goes-to-services--dark-1440.png?raw=true) |
| 4 | Each renderer shows channel, stat and detail for its widget type; numbers, times and IDs are mono | PASS | [02-states--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/02-states--light-1440.png?raw=true), [04-wide-and-narrow--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/04-wide-and-narrow--light-1440.png?raw=true), sparkline crosshair + mono readout [12-sparkline-hover--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/12-sparkline-hover--dark-1440.png?raw=true) |
| 5 | Vitest specs cover every frame-state branch (first-match order) and the error copy | PASS | `web/src/components/frame-state.spec.ts` |
| 6 | `npm test`, `npx tsc --noEmit`, `npm run lint` pass in `web/` | PASS | 35 files / 180 tests passed; tsc exit 0; lint exit 0 (1 warning in `src/api/client.ts`, which this branch doesn't touch) |

### Notes (not contract misses)

- live, loading, NOT_CONNECTED and INVALID_PARAMS came from the real server. REAUTH_REQUIRED, RATE_LIMITED, UPSTREAM_ERROR, stale, earlier data under a band and the 12-point sparkline were set by writing `WidgetCacheEntry` values into the app's React Query cache, which is the same write `useWidgetData` makes. paused came from closing the socket in the browser with `/socket.io` blocked. After **Retry now**, every widget resubscribed and recovered.
- The live view keeps the green `--live` sparkline end dot on stale and paused panels. The mock and `19-widget-states` do the same, so this isn't a miss, but it conflicts with §4's "if it isn't live, it isn't green".
- The error copy uses typographic apostrophes (isn’t, didn’t), as the mock does. `design-reference.md` §5 uses straight ones.
- Tailwind `@max-[440px]` / `@max-[380px]` / `@max-[320px]` mean width < N. The mock's `max-width: N` also matches width = N, so the two differ at exactly N px.
- Forecast "Today" compares each date with the browser's local date. The mock uses the first row. These differ when the viewer's timezone isn't the forecast location's.
- `useWidgetData` was changed (it takes a `config` argument, keeps `history`, and resets on a params change). The non-goals exclude changes to payloads, and the payloads didn't change.
- The real weather widget with an unknown city first gave INVALID_PARAMS, then later pushes gave UPSTREAM_ERROR ("failed") for the same instance. This is server-side and out of scope.
- The worktree's `mocks/design-reference.md` has only "shadcn/ui defaults" in it. The full reference from the main checkout was used.
- REAUTH_REQUIRED links to `/services`. The mock adds `services=reauth` to the hash, which is only a prototype state.

### Screenshots

![01-dashboard--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/01-dashboard--light-1440.png?raw=true)

![02-states--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/02-states--light-1440.png?raw=true)

![03-states--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/03-states--light-375.png?raw=true)

![04-wide-and-narrow--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/04-wide-and-narrow--light-1440.png?raw=true)

![05-paused--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/05-paused--light-1440.png?raw=true)

![06-states--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/06-states--dark-1440.png?raw=true)

![07-states--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/07-states--dark-375.png?raw=true)

![08-invalid-params-configure-opens--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/08-invalid-params-configure-opens--dark-1440.png?raw=true)

![09-configure-save-live--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/09-configure-save-live--dark-1440.png?raw=true)

![10-connect-github-goes-to-services--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/10-connect-github-goes-to-services--dark-1440.png?raw=true)

![11-narrow-panels--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/11-narrow-panels--dark-1440.png?raw=true)

![12-sparkline-hover--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-widget-frame/features/mockui-widget-frame/verification/12-sparkline-hover--dark-1440.png?raw=true)
