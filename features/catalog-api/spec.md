## Scope
Extend `server/src/catalog` (currently just `WidgetRegistryService` + `/about.json`) with the authenticated catalog endpoint and param validation, per `docs/Architecture.md` §3 and §8:

- `GET /api/catalog` (authenticated) — returns every registered `ServiceSpec` with its `WidgetDefinition`s, each widget's full `ParamSpec[]` (all fields: `name`, `type`, `required`, `default`, `enum`, `min`, `max`, `pattern`, `label` — unlike `/about.json` which only exposes `name`/`type`), plus the current user's per-service connection status (`{ connected, status }`, sourced from `connections-api`'s `ServiceConnection` lookup — read-only join, no duplication of that module's logic).
- A reusable param-validation function/pipe: given a `WidgetDefinition`'s `ParamSpec[]` and a raw params object, validates type, `required`, `enum` membership, integer `min`/`max` bounds, and string `pattern` (regex), returning either the coerced/validated params or a structured validation error. This will be called by `dashboards-api` on widget-instance create/update — build it here as an exported, unit-testable function since `catalog` owns the `ParamSpec` shape.
- No changes to `/about.json`'s existing public shape.

## Non-goals
- Any dashboard/widget-instance CRUD that calls this validator — that's `dashboards-api`.
- Any real widget definitions beyond what's needed to exercise the registry in tests (a fake/test `WidgetDefinition` is fine; do not build weather/github/steam/youtube here).
- Connection status data model — reuse `connections-api`'s service, don't reimplement it.

## Verification checklist
1. `GET /api/catalog` without a session returns 401.
2. `GET /api/catalog` with a session returns every registered service/widget with the full `ParamSpec` shape (including `min`/`max`/`enum`/`pattern` when present) — verify against a widget definition registered with each of those fields set.
3. For a service the current user has connected, that service's entry shows `connected: true` and the correct `status`; for one they haven't, `connected: false`.
4. The param validator accepts a fully-valid params object matching a `ParamSpec[]` (integer in range, string matching pattern, enum member) and returns coerced values (e.g. numeric string → number for `type: 'integer'`).
5. The param validator rejects: a missing `required` param, an out-of-range integer, a string that fails its `pattern`, and a value not in an `enum` — each with a distinguishable error identifying which param failed.
6. The param validator ignores/rejects unknown params not declared in the `ParamSpec[]` (does not silently pass them through).
7. `/about.json`'s existing widget shape (`name`, `description`, `params[].{name,type}` only) is unchanged by this work — existing test/snapshot for it still passes.

## Constraints
- Read `ServiceConnection` status through whatever query/service `connections-api` exposes (coordinate on interface; don't duplicate the encryption/connection logic here).
- Do not add a UI for browsing the catalog — that's part of `widget-grid-ui`'s Add dialog. `mock.html` here only needs to demonstrate the shape of the data (e.g. a simple read-only JSON-ish list view of services/widgets/params with connection badges) since this is primarily an API-shape feature.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/catalog-api/mock.html` (the read-only catalog view's shape). Capture evidence via `chrome-headless-shell` into `features/catalog-api/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/catalog-api/spec.md
