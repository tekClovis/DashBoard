## Scope
Build the authenticated app shell in `web/src`, per `docs/Architecture.md` §9:

- Routing: `/login`, `/register`, `/confirm`, `/d/:dashboardId` (main page, currently `DashboardPlaceholderPage.tsx`), `/services`, `/profile`, `/admin`. Auth gate (`RequireAuth.tsx`, already scaffolded) based on `GET /api/auth/me` (from `auth-session`); redirect unauthenticated users to `/login`, and authenticated users away from `/login`/`/register`.
- `SocketProvider` (`web/src/realtime`, currently empty): establishes one `socket.io-client` connection carrying the session cookie; exposes connection state via context.
- `useWidgetData(instanceId)` hook: emits `widget:subscribe` on mount, `widget:unsubscribe` on unmount, and writes incoming `widget:data`/`widget:error` (from `timer-realtime`) into the TanStack Query cache under `['widget', instanceId]`.
- TanStack Query hooks (`web/src/api`, alongside the existing `auth.ts`): `useCatalog()` (`GET /api/catalog`), `useDashboards()`, `useConnections()` — thin wrappers, no `refetchInterval` (Timer owns refresh per Architecture).
- Services page: lists services from `useCatalog()`/`useConnections()` with Connect/Disconnect buttons (hitting `connections-api`'s routes and the `oauth-login`/connect redirect).
- Profile page: current user info, linked identities with link/unlink (`oauth-login`), Logout / Logout-everywhere buttons (`auth-session`).
- Top-level nav shell (header/sidebar) linking Home/Services/Profile/Admin (Admin link only shown for `role === 'ADMIN'`).

## Non-goals
- The actual widget grid, WidgetFrame, Add/Configure dialog — `widget-grid-ui` replaces `DashboardPlaceholderPage.tsx`'s content; this feature only needs the route and layout to exist (a placeholder body is fine to leave for that feature to fill).
- Admin page content beyond routing/gating — `admin-ui`.
- Any new shadcn primitives beyond what's already in `web/src/components/ui`; add only what Services/Profile pages need (e.g. a Badge, Card, Dialog if not present) matching the existing button/input/label style.

## Verification checklist
1. Visiting `/d/:id` while unauthenticated redirects to `/login`; visiting `/login` while authenticated redirects to `/d/:id` (or the user's first dashboard).
2. After a successful login, the nav shell renders and `/api/auth/me`'s data (email, role) is reflected somewhere in the shell (e.g. Profile page or header).
3. `SocketProvider` establishes a connection after login and exposes a connected/disconnected state consumable by children; it disconnects on logout.
4. `useWidgetData(instanceId)` subscribes on mount (verify a `widget:subscribe` emit) and unsubscribes on unmount; data pushed via a mocked `widget:data` event appears in the corresponding query-cache entry.
5. Services page lists every catalog service with a Connect button for unconnected ones and a Disconnect button + status badge for connected ones; clicking Connect triggers the connect redirect flow, clicking Disconnect calls the delete endpoint and updates the badge.
6. Profile page lists linked login identities with unlink buttons, disables/hides unlink for the sole remaining login method, and Logout/Logout-all buttons work (Logout-all ends the local session too).
7. The Admin nav link is visible only when `role === 'ADMIN'`, and `/admin` redirects/403s in the UI for a non-admin who navigates there directly.
8. No TanStack Query hook here sets `refetchInterval` (grep-checkable) — realtime data flows only through `useWidgetData`.

## Constraints
- Depends on `auth-session` (`/api/auth/me`, login/logout), `oauth-login` (identities), `connections-api` (services), `catalog-api` (`/api/catalog`), and `timer-realtime` (socket event contract) for real wiring — where a dependency isn't merged yet, code against its documented contract (this spec + the dependency's spec.md) and flag it for reconciliation rather than inventing a different shape.
- Do not touch `web/src/widgets` (empty, reserved for real widget views) or build the grid itself.
- `mock.html`: click through login → shell with nav → Services page (connect/disconnect toggles a badge) → Profile page (link/unlink, logout, logout-all) → Admin link appearing only for a toggled "admin" mock user.

## Verification
Score the work against the numbered checklist above every turn. UI criteria are checked against `features/frontend-shell/mock.html` (login → shell → nav → Services/Profile/Admin-gating flows). Capture evidence via `chrome-headless-shell` into `features/frontend-shell/verification/`.

## Exit condition
Done only when every checklist item passes.

Run this with /goal features/frontend-shell/spec.md
