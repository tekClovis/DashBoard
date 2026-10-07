# Architecture

## 1. Introduction and goals

A dashboard web app. Users add widgets from services (weather, GitHub, Steam, YouTube) to their dashboards, and a server-side Timer fetches each watched widget on its refresh rate and pushes the result to the browser over Socket.IO.

Top quality goals:

1. **Security of credentials.** Sessions and third-party tokens never reach JavaScript or an API response, and data stays separate between users.
2. **Upstream quota economy.** Only instances that a browser is watching are fetched, through a shared Redis cache.
3. **Extensibility.** Adding a widget = one definition on the server + one view on the client.

## 2. Constraints

- Solo project. The subject requires at least **2 services / 3 widgets** (X = 1). The plan ships a core tier that clears this with margin, then adds stretch services in order.
- The subject requires a public `/about.json` (see [§ 8.1](#81-widget-registry)) and only `integer` / `string` param types, the only types `about.json` allows.
- The grader runs `docker-compose up` and must be able to log in immediately (see the admin seed in [§ 8.3](#83-identity-and-permissions)).
- Only free upstream APIs that need no card or paid plan.
- TypeScript end to end, Node >= 24.

## 3. Context and scope

```mermaid
flowchart LR
  B[Browser<br/>React SPA] -- "HTTPS REST /api/*<br/>Socket.IO /socket.io" --> S
  G[Grader] -- "GET /about.json" --> S
  subgraph compose[docker-compose]
    S[server :8080<br/>NestJS + built SPA]
    P[(postgres)]
    R[(redis)]
    M[mailpit<br/>SMTP :1025, UI :8025]
  end
  S --> P
  S --> R
  S -- SMTP --> M
  S -- HTTPS --> U[Upstream APIs<br/>Open-Meteo, GitHub,<br/>Steam, YouTube]
  S -- "OAuth 2.0 / OpenID 2.0" --> O[GitHub, Google, Steam<br/>identity providers]
```

### REST API

All routes are under `/api` and require the JWT cookie unless marked public. Bodies are validated by the global `ValidationPipe` (class-validator, whitelist, forbidNonWhitelisted, transform). Widget `params` are validated against the registry's `ParamSpec`s (type, required, enum, min/max, pattern) on create and update, in the service rather than the DTO.

| Method | Path | Purpose |
|---|---|---|
| GET | `/about.json` *(public, root)* | Subject endpoint |
| POST | `/auth/register`, `/auth/login`, `/auth/resend` *(public)* | Local auth |
| GET | `/auth/confirm?token=` *(public)* | Email confirmation |
| POST | `/auth/forgot-password`, `/auth/reset-password` *(public)* | Password reset: request a link, set a new password |
| POST | `/auth/logout`, `/auth/logout-all` | Clear the cookie; `logout-all` also bumps tokenVersion |
| GET | `/auth/me` | Current user + linked identities |
| DELETE | `/auth/identities/{provider}` | Unlink a login identity |
| GET | `/oauth/{provider}/start?intent=login\|link\|connect`, `/oauth/{provider}/callback` *(public; `link` and `connect` need a session)* | OAuth/OpenID flows (github, google, steam) |
| GET | `/catalog` | Services + widgets + full `ParamSpec`s + the user's connection status per service |
| GET | `/steam/search`, `/weather/search`, `/youtube/channels/search` | Server-side search behind the widget pickers; under 2 characters, steam and weather return no results and youtube gives 400 `INVALID_QUERY` |
| GET / DELETE | `/connections`, `/connections/{service}` | List / disconnect |
| GET / POST / PATCH / DELETE | `/dashboards`, `/dashboards/{id}` | Dashboard CRUD (name, position) |
| GET | `/dashboards/{id}/widgets` | List the dashboard's instances `{ widgets: [...] }` |
| POST | `/dashboards/{id}/widgets` | Add instance `{ service, widget, params, refreshRate, x, y, w, h }` |
| PATCH | `/dashboards/{id}/layout` | Bulk `[{ id, x, y, w, h }]` after a drag or resize; all-or-nothing, one foreign id fails the batch with 404 |
| POST | `/dashboards/{id}/share` | Share with another user `{ email }`; unknown email is 400 `UNKNOWN_USER`, an already-pending share is 409 `ALREADY_SHARED` |
| GET | `/dashboards/{id}/shares` | Shares sent from my dashboard `{ shares: [{ id, toEmail, status }] }` |
| GET | `/shares/incoming` | Pending shares sent to me `{ shares: [{ id, dashboardName, fromEmail, widgetCount, createdAt }] }` |
| POST / DELETE | `/shares/{id}/accept`, `/shares/{id}` | Add a personal copy (returns the new dashboard) / decline. Only the recipient; anyone else gets 404 |
| PATCH / DELETE | `/widgets/{id}` | Reconfigure (`params`, `refreshRate`) / delete |
| DELETE | `/users/me` | Delete my own account (cascades to everything I own, clears the session cookie, drops my sockets); 204. The only admin gets 409 `LAST_ADMIN` |
| GET / PATCH / DELETE | `/admin/users`, `/admin/users/{id}` | Admin (see [§ 8.3](#83-identity-and-permissions)) |

Every `{id}` lookup is scoped by `userId` in the query itself, so an instance owned by someone else is a 404, not a 403.

### Socket events

Defined in `shared/src/socket.ts` (`SOCKET_EVENTS`).

| Direction | Event | Payload |
|---|---|---|
| client → server | `widget:subscribe`, `widget:unsubscribe` | `{ instanceId }` |
| server → client | `widget:data` | `{ instanceId, data, fetchedAt }` |
| server → client | `widget:error` | `{ instanceId, code, message, retryAt? }` |

Unknown or foreign instance ids both yield `{ ok: false }` on subscribe.

## 4. Solution strategy

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS + Prisma | Modules map 1:1 to services, so `/about.json` and widget routes stay organized as the service count grows. TypeScript end to end lets widget param types be shared with the frontend. |
| Frontend | React + Vite | Largest ecosystem for the two hard UI problems here: a draggable widget grid and accessible modals for widget config. |
| Styling & UI | Tailwind CSS + shadcn/ui | Tailwind's responsive variants (`sm:`, `md:`) satisfy the responsive-UI requirement quickly; shadcn/Radix give accessible dialogs and menus. |
| Widget grid | react-grid-layout | Drag, resize and responsive breakpoints out of the box, and the layout is plain JSON saved per user in the database. |
| Database | PostgreSQL + Redis | Postgres models users → linked accounts → widget instances relationally, with a JSONB column for each widget's params; Redis caches upstream responses so free-tier quotas survive multiple users and refresh cycles. |
| Auth | Passport.js + bcrypt + Nodemailer | Passport's GitHub/Google strategies back login, and GitHub/Google/Steam strategies back widget OAuth. |
| Timer | Server tick loop + WebSocket | Matches the subject's "each widget communicates its refresh rate to the Timer" literally: one interval walks the watched instances and pushes results over Socket.IO. |
| Architecture style | One process, single origin on port 8080 | NestJS serves the built SPA, the API and Socket.IO, so there is no CORS or cross-site cookie handling. |
| Extension point | One widget registry | Everything that knows about widgets reads it (see [§ 8.1](#81-widget-registry)). |
| Testing | Vitest + Supertest + Testcontainers | See [Testing.md](./Testing.md). |

## 5. Building block view

### 5.1 Level 1

npm workspaces, no extra tooling.

```
/
├── docker-compose.yml
├── docker-compose.dev.yml  # dev overrides for postgres/redis/mailpit
├── Dockerfile              # deps → build shared → build web → build server → runtime
├── .env.example            # every variable, no secrets
├── shared/src/             # plain TS types, no runtime deps
├── server/
│   ├── prisma/             # schema.prisma + migrations
│   ├── test/               # e2e suites
│   └── src/
│       ├── core/           # config, prisma, redis, mail, http helpers
│       ├── auth/           # local + OAuth login, session, email confirmation, password reset
│       ├── users/
│       ├── admin/
│       ├── connections/    # per-user service subscriptions (OAuth/OpenID)
│       ├── catalog/        # WidgetRegistry, /about.json, /api/catalog
│       ├── dashboards/     # dashboards + widget instances CRUD, sharing
│       ├── timer/          # scheduler, fetch service, Socket.IO gateway
│       └── services/       # weather, github, steam, youtube
└── web/src/
    ├── api/                # TanStack Query hooks
    ├── lib/                # layout, theme, time, validation helpers
    ├── realtime/           # SocketProvider, useWidgetData
    ├── widgets/            # one view component per widget + view registry
    ├── components/         # WidgetFrame, ParamForm, AddWidgetDialog, shadcn/ui
    └── routes/             # login, register, confirm, dashboard, services, profile, admin
```

```mermaid
flowchart TB
  subgraph server
    boot[bootstrap<br/>main.ts, app.module.ts, prisma]
    core[core]
    auth[auth + oauth]
    au[admin, users]
    conn[connections]
    cat[catalog]
    dash[dashboards]
    tim[timer]
    svc[services]
  end
  subgraph web
    wboot[bootstrap<br/>main.tsx]
    routes[routes]
    comp[components]
    widgets[widgets]
    api[api]
    rt[lib + realtime]
  end
  shared[shared]
  boot --> core & auth & au & conn & cat & dash & tim & svc
  auth --> core & conn
  au --> auth & tim
  svc --> cat & core
  dash --> cat & core
  tim --> cat & auth
  cat --> auth & conn
  conn --> core & auth
  wboot --> routes & api
  routes --> comp & api & rt & widgets
  comp --> api & widgets & rt
  rt --> api
  server -.-> shared
  web -.-> shared
```

| Module | Responsibility |
|---|---|
| `server/src/main.ts`, `app.module.ts`, `prisma/` | Starts Nest on port 8080, sets the global `api` prefix (except `about.json`) and `ValidationPipe`, the `SocketIoAdapter`, `ServeStaticModule` for `server/public`, and defines the Prisma data model. |
| `core` | Global `CoreModule`: env validation, `PrismaService`, the `REDIS` client, `MailService`, `clientAddress`, `readCookie`. |
| `auth` | Email/password accounts, confirmation, password reset, session cookie, revocation, role guard, OAuth login/link (`OAuthModule` also hosts the connect routes), admin seed. |
| `admin`, `users` | Admin user management and self-service account deletion. |
| `connections` | `ServiceConnection` CRUD, token encryption, connect state, provider-side revocation, connect-scoped strategies. |
| `catalog` | In-memory widget registry, `/about.json`, `/api/catalog`, `validateParams`. |
| `dashboards` | Dashboards, widget instances, layout, sharing; emits `instance.created\|updated\|deleted` through `DashboardEventsService`. |
| `timer` | Socket.IO gateway, the 1 s Timer, `FetchService` with Redis cache. |
| `services` | One Nest module per service (github, steam, weather, youtube) that registers its widgets. |
| `server/test` | E2E suites against real Postgres/Redis (see [Testing.md](./Testing.md)). |
| `shared` | Type-only contract (plus `PASSWORD_PATTERN` and `SOCKET_EVENTS`): catalog, DTOs, socket events, `WidgetDataMap`. |
| `web/src/main.tsx` | Mounts the app inside `QueryClientProvider` and `BrowserRouter` and declares the routes. |
| `web/src/routes` | Auth screens and guards, `AppShell` and the authenticated pages. |
| `web/src/components` | Widget panels, the add/configure wizard, dashboard switching and sharing, `ui/` primitives. |
| `web/src/widgets` | One view per widget, plus the `service.widget` → view registry. |
| `web/src/api` | Typed REST client as TanStack Query hooks. |
| `web/src/lib`, `web/src/realtime` | Grid layout rules, theme, time and validation helpers; `SocketProvider` and `useWidgetData`. |

### 5.2 Level 2: server `auth`

- `JwtService` signs and verifies a minimal HS256 token (`sub`, `role`, `tv`, `jti`, `exp`) with `JWT_SECRET`; lifetime `SESSION_TTL_SEC` = 7 days.
- `JwtGuard` + `@CurrentUser()` set and read `req.user`; `RolesGuard` + `@Roles()` need `JwtGuard` first and fail closed.
- `resolveSessionUser` (`session-user.ts`) is shared by `JwtGuard` and the realtime gateway.
- `TokenRevocationService` revokes a single `jti` in Redis with a TTL; `logout-all` bumps `User.tokenVersion` instead.
- `VerificationService` / `PasswordResetService` store sha256 token hashes, 24 h / 1 h TTL.
- `OAuthLoginService` holds the login/link rules; `oauth-state.ts` the signed, cookie-bound state.
- `setSessionCookie` / `clearSessionCookie`; `AdminSeedService`.
- Rate limits are Redis counters inside `AuthController`.
- Register writes the default Dashboard directly to avoid a module import cycle (see the `auth.module.ts` comment).

### 5.3 Level 2: server `connections`

- `ConnectionsService`: `list`, `disconnect`, `findForRevoke`, `upsertOAuthConnection` (encrypts tokens), `upsertSteamConnection`; `CONNECTABLE_SERVICES` = github, steam, youtube.
- `TokenCipherService`: `encrypt` / `decrypt` (see [§ 8.3](#83-identity-and-permissions)).
- `oauth-state.ts`: HMAC-SHA256 state, 10 min expiry, double-submit CSRF cookie `oauth_csrf`; Steam carries state in the `oauth_state` cookie.
- `revokeAtProvider`: best-effort GitHub/Google revoke.
- Strategies `github-connect`, `google-connect`, `steam-connect`; `githubConnectClient` / `googleConnectClient` pick the `*_CONNECT_*` env with fallback to the login credentials.
- Weather is always reported connected; it has no row.

### 5.4 Level 2: server `dashboards`

- `DashboardsService`: list, create, createDefault, update, remove, listWidgets, addWidgetInstance, updateWidgetInstance, removeWidgetInstance, updateLayout.
- `DashboardShareService`: share, listSent, listIncoming, accept (clones dashboard + widgets in a transaction), decline.
- `DashboardEventsService`: emits `instance.created|updated|deleted`. Widget mutations emit only after the DB write succeeds; layout updates emit none.
- Error codes: `UNKNOWN_WIDGET`, `INVALID_PARAMS`, `INVALID_REFRESH_RATE`, `UNKNOWN_USER`, `CANNOT_SHARE_WITH_SELF`, `ALREADY_SHARED`.

### 5.5 Level 2: server `timer`

- `RealtimeGateway`: handshake auth middleware, `widget:subscribe`, `widget:unsubscribe`, `disconnectUser` (implements `UserSocketDisconnector` for admin and users).
- `TimerService`: `activate`, `deactivate`, `reconfigure`, `setServer`; emits to room `instance:<id>`.
- `FetchService.get`: Redis cache plus in-flight dedupe; decrypts the connection token for `auth: 'connection'` widgets.
- `widgetCacheKey` (`cache-key.ts`), `FetchError(code)`, `findOwned` (`instance-lookup.service.ts`), `SocketIoAdapter` (forces the CORS origin to `APP_URL`).
- `registerFakeWidgets` (called from `main.ts`, outside `NODE_ENV=production`) registers fake widget definitions.

### 5.6 Level 2: server `services`

- `github`: recent_commits, pull_requests, security_alerts; `githubGet`, `parseRepo` validates `owner/name`.
- `steam`: `createSteamWidgets(apiKey)` (recently_played, game_news); `searchGames`.
- `weather`: current_weather, forecast; `open-meteo.ts` has `searchCities`, `Geocoder` (Redis cache 24 h, in-flight dedup), `getForecast`, `conditionFor`.
- `youtube`: channel_stats, latest_videos, trending_videos; `youtubeClient` refreshes once on expiry or 401 through `GoogleTokenRefresher`.
- Search endpoints answer 502 `{error: code}` (steam, weather); the youtube one maps `NOT_CONNECTED` / `REAUTH_REQUIRED` to 409 and `RATE_LIMITED` to 429.

### 5.7 Level 2: server `core`

- `validate(config)` checks env against `EnvironmentVariables` and applies defaults (see [§ 8.6](#86-configuration)).
- `PrismaService`: `PrismaClient` with the pg adapter on `DATABASE_URL`. `REDIS`: ioredis client from `REDIS_URL`, quit on module destroy.
- `MailService.sendConfirmationEmail` / `sendPasswordResetEmail`, bodies from `renderHtml` / `renderText`.
- `clientAddress(req)`: socket peer IP without the `::ffff:` prefix. `readCookie(header, name)`: parses a raw Cookie header, no cookie-parser; null for a malformed percent-escape.

### 5.8 Level 2: `shared`

- `catalog.ts`: `ParamSpec`, `WidgetSpec`, `ServiceSpec`.
- `dto.ts`: `AboutResponse`, `CatalogResponse`, one request/response interface per REST endpoint, search candidates, `PASSWORD_PATTERN` (8-72 chars, one digit, one symbol).
- `socket.ts`: `SOCKET_EVENTS`, `WidgetDataPayload`, `WidgetErrorPayload`, `WidgetErrorCode`.
- `widgets.ts`: `WidgetDataMap`, `'service.widget'` → data shape. The server and client share types only through it, so a view and its `fetch()` cannot drift apart.
- Imports use `.js` suffixes (ESM); dates are ISO strings; `ConnectionEntry` and `MeResponse` never carry tokens or credentials.

### 5.9 Level 2: web client (`components` and the pages around them)

- **Routing**: `/` (RootRedirect), `/login`, `/register` (RedirectIfAuthed), `/confirm`, `/forgot-password`, `/reset-password` (public), `/d/:dashboardId` (main page), `/services`, `/profile`, `/admin` (RequireAuth then AppShell). The auth gate is based on `/api/auth/me`. Redirects go to `/d/<first dashboard id>`, or `/d/placeholder` with no dashboards. The admin gate is client-side UX only; the server enforces ADMIN.
- **Server state**: TanStack Query for REST: catalog, dashboards, instances, connections. There is no `refetchInterval` (enforced by `no-refetch-interval.spec.ts`), because the Timer owns refresh. Widget delete and layout update write the cache optimistically and always refetch on settle.
- **Realtime**: a single `SocketProvider` (cookie auth, 5 reconnect attempts). The `useWidgetData(instanceId)` hook emits `subscribe` on mount and `unsubscribe` on unmount, writes incoming `widget:data` into the query cache under `['widget', instanceId]` and keeps the last 12 pushes as `history`. Reconnects start with no server rooms, so it resubscribes on `connect`.
- **Dashboard keep-alive**: `AppShell` keeps the last-visited dashboard mounted (`hidden` + `inert`) while Services / Profile / Admin show, so its widgets, socket subscriptions, grid layout and scroll position (restored on return) survive with no refetch. Only one dashboard is kept (visiting another replaces it); a dashboard deleted or unshared while hidden is unmounted, and logout unmounts the whole shell. The `/d/:dashboardId` route itself renders nothing.
- **Widget rendering**: `WidgetFrame` owns the chrome: title, loading skeleton, error and "Reconnect" states, and a menu with Configure / Move / Delete. `frameState` derives the panel state (warn, error, loading, paused, stale, live); a panel is stale after 2 × refreshRate, and `NOT_CONNECTED`, `REAUTH_REQUIRED`, `RATE_LIMITED` render amber, other errors red. The body comes from the view registry in `web/src/widgets/registry.tsx`; a widget missing from it shows raw JSON.
- **Add / configure dialog** (shadcn `Dialog`), in four steps that mirror the subject's wording:
  1. Select a widget type, grouped by service. Widgets from unconnected services are disabled and show a "Connect" link.
  2. `ParamForm` is generated from the `ParamSpec`s. An `enum` becomes a select, an integer becomes a number input with min/max, `pattern` gives inline validation. Pickers (steam game, weather city, youtube channel) use `SearchPicker` (250 ms debounce, min 2 chars) and set hidden companion params.
  3. Refresh rate, prefilled with `minRefreshSec`.
  4. Confirm.

  The same dialog, prefilled, is used for reconfiguring.
- **Grid**: `react-grid-layout`, 12 columns on `lg`, with the single layout rule in `web/src/lib/layout.ts` (`normalize`). `onDragStop` and `onResizeStop` call `PATCH /layout`. Below `md`, widgets stack in a single column ordered by (y, x), and drag is disabled.
- **Widget removal** has no confirm: DELETE is sent after an 8 s undo window, or immediately on unmount or the next removal.
- **Accessibility**: shadcn/Radix focus traps and labelled dialogs, visible focus rings, and Move up/down/left/right in each widget's menu so layout can be changed without a mouse. Widget updates use `aria-live="polite"` on the value only, not the whole card. Color is never the only signal.

## 6. Runtime view

### 6.1 Widget refresh

The client subscribes an instance over Socket.IO, and the server-side Timer fetches that instance on its `refreshRate` **only while at least one browser is watching it**. This means no upstream quota is spent for users who are offline.

```mermaid
sequenceDiagram
  participant W as Widget (browser)
  participant G as RealtimeGateway
  participant T as Timer (1 s tick)
  participant F as FetchService
  participant R as Redis
  participant U as Upstream API

  W->>G: widget:subscribe {instanceId}
  G->>G: auth + ownership check, join room instance:{id}
  G->>T: activate(instance) → nextDueAt = now
  loop every 1 s
    T->>T: pick entries with nextDueAt ≤ now
    T->>F: get(def, params, connection)
    F->>R: GET cache key
    alt hit
      R-->>F: data
    else miss
      F->>U: def.fetch(params, ctx)
      U-->>F: data
      F->>R: SET key, TTL = minRefreshSec
    end
    F-->>T: data
    T->>W: widget:data {instanceId, data, fetchedAt} (room)
    T->>T: nextDueAt = now + refreshRate
  end
  W->>G: widget:unsubscribe / disconnect
  G->>T: room empty → deactivate(instanceId)
```

**Active set.** The Timer keeps an in-memory `Map<instanceId, { def, params, userId, refreshRate, nextDueAt, failures, inFlight }>`.

- Entries are added on the first subscriber. They are removed when the room empties, detected with the adapter's `delete-room` event.
- After a server restart the map is empty. Socket.IO clients reconnect and re-emit `subscribe` on `connect`, which rebuilds it. The design has one process, so it needs no distributed lock.
- Sockets are re-validated every 60 s.

**Fetch dedupe.** The `FetchService` holds an in-flight `Map<cacheKey, Promise>`. Two due instances with the same key trigger one upstream call.

**Failures.** Each failure emits `widget:error`.

| Code | Cause | Effect |
|---|---|---|
| `NOT_CONNECTED` | the user has no connection for this service | entry deactivated, no retry |
| `REAUTH_REQUIRED` | the provider returned 401 and the refresh failed | connection `status = REAUTH`, no retry |
| `RATE_LIMITED`, `UPSTREAM_ERROR` | upstream problem | backoff `nextDueAt = now + min(refreshRate · 2^failures, 15 min)` |
| `INVALID_PARAMS` | upstream rejected the params (e.g. unknown repo) | no retry until reconfigured |

**Refresh rate.** An integer number of seconds, set in the add/configure dialog. Validated as `minRefreshSec ≤ refreshRate ≤ 86400`.

### 6.2 Registration and confirmation

```
POST /api/auth/register      → create User (unverified), EmailToken, default Dashboard, send mail via Nodemailer → mailpit
GET  /api/auth/confirm?token → hash, match unexpired unused token → set emailVerifiedAt
POST /api/auth/resend        → rate-limited, always 200 (no account enumeration)
POST /api/auth/login         → local strategy; 403 EMAIL_NOT_CONFIRMED if unverified
```

### 6.3 Password reset

```
POST /api/auth/forgot-password → always 200 { ok: true }; mails /reset-password?token= only for an account with a password
POST /api/auth/reset-password  → { token, password }; hash, match unexpired unused token → set passwordHash
```

`forgot-password` is rate-limited per email (1/min, 5/day, silently: no mail, still 200), so it never reveals whether an account exists, and OAuth-only accounts get no mail. A successful reset bumps `tokenVersion` (every existing session gets 401), burns the user's other unused reset tokens and sets `emailVerifiedAt` if it was null. An unknown, used or expired token gives 400 `INVALID_TOKEN`.

## 7. Deployment view

It runs with docker compose on a single host; there is no hosted deployment. The multi-stage Dockerfile builds the Vite SPA, and NestJS serves it with `@nestjs/serve-static`. Everything runs on port 8080:

| Path | Handler |
|---|---|
| `/about.json` | `AboutController` (not under `/api`) |
| `/api/*` | REST controllers |
| `/socket.io/*` | Socket.IO gateway |
| everything else | SPA `index.html` fallback |

| Service | Image | Exposed to host | Notes |
|---|---|---|---|
| `server` | built from `./Dockerfile` | `8080` | `depends_on` postgres/redis `service_healthy`. The entrypoint runs `prisma migrate deploy`, then starts Nest. |
| `postgres` | `postgres:16-alpine` | no | Named volume, `pg_isready` healthcheck. |
| `redis` | `redis:7-alpine` | no | Cache only. Losing it is harmless. |
| `mailpit` | `axllent/mailpit` | `8025` (inbox UI) | Catches confirmation emails, so the flow works offline on any machine. |

For development, `docker-compose.dev.yml` starts only postgres, redis and mailpit, and the server and Vite run on the host (commands in the [README](../README.md)).

CI (`.github/workflows/actions.yml`) runs build, lint, unit tests and e2e tests on push and pull request.

## 8. Crosscutting concepts

### 8.1 Widget registry

Everything that knows about widgets reads one registry: `/about.json`, `/api/catalog`, param validation, and the Timer. **Adding a widget = one definition on the server + one view on the client.** No other code changes.

```ts
// shared/src/catalog.ts (excerpt)
type ParamSpec = {
  name: string;
  type: 'integer' | 'string';        // the only types about.json allows
  required?: boolean;
  default?: string | number;
  enum?: string[];                   // rendered as a select
  min?: number; max?: number;        // integer bounds
  pattern?: string;                  // string regex, e.g. owner/repo
  label?: string;
};

// server/src/catalog/widget-definition.ts
interface WidgetDefinition<K extends keyof WidgetDataMap> {
  service: string;                   // 'github'
  name: string;                      // 'recent_commits'
  description: string;
  params: ParamSpec[];               // ≥ 1, or the widget does not count
  minRefreshSec: number;             // floor for instance refreshRate, and cache TTL
  auth: 'none' | 'connection';       // 'connection' ⇒ needs the user's ServiceConnection
  fetch(params: Params, ctx: FetchContext): Promise<WidgetDataMap[K]>;
}
```

Each `services/<name>` module calls `registerService(meta)` and then `register(def)` in `onModuleInit`, declaring its `ServiceSpec` (`name`, `connection: 'none' | 'oauth' | 'openid'`). The registry throws on duplicates, an unregistered service, or empty params. `validateParams` treats undefined/null/`''` as absent, coerces integers, and drops undeclared keys.

| Tier | Service | Connection | Widget | Params | minRefreshSec |
|---|---|---|---|---|---|
| core | weather (Open-Meteo) | none | `current_weather` | `city`:string, `units`:string (`metric`\|`imperial`) | 300 |
| core | weather | none | `forecast` | `city`:string, `days`:integer (1–7) | 900 |
| core | github | OAuth 2.0 | `recent_commits` | `repo`:string (`owner/name`), `number`:integer (1–20) | 60 |
| core | github | OAuth 2.0 | `pull_requests` | `repo`:string, `state`:string (`open`\|`closed`\|`all`) | 60 |
| core | github | OAuth 2.0 | `security_alerts` | `repo`:string | 300 |
| stretch 1 | steam | Steam OpenID | `recently_played` | `number`:integer (1–10) | 600 |
| stretch 1 | steam | Steam OpenID | `game_news` | `app_id`:integer, `number`:integer (1–10) | 900 |
| stretch 2 | youtube | Google OAuth 2.0 | `channel_stats` | `channel_id`:string | 600 |
| stretch 2 | youtube | Google OAuth 2.0 | `latest_videos` | `channel_id`:string, `number`:integer (1–10) | 600 |
| stretch 2 | youtube | Google OAuth 2.0 | `trending_videos` | `region`:string (ISO-3166), `number`:integer (1–10) | 900 |

- Core: 2 services / 5 widgets. Full: 4 services / 10 widgets.
- Weather is available to every authenticated user. Other services stay unavailable until the user connects them.
- Weather geocodes `city` → lat/lon through Open-Meteo's geocoding API. The result is cached for 24 h.

`/about.json`:

- `client.host`: `req.socket.remoteAddress`, with the `::ffff:` IPv4-mapped prefix stripped. No `trust proxy`, because nothing sits in front of the server.
- `server.current_time`: `Math.floor(Date.now() / 1000)`.
- `server.services[].widgets[]`: only `name`, `description`, and `params[].{name,type}`. The extra `ParamSpec` fields go only to the authenticated `/api/catalog`.

### 8.2 Persistence

Postgres (Prisma, client generated into `server/src/generated/prisma`) is the source of truth. Children cascade-delete with their User or Dashboard.

```mermaid
erDiagram
  User ||--o{ EmailToken : has
  User ||--o{ PasswordResetToken : has
  User ||--o{ AuthIdentity : "logs in via"
  User ||--o{ ServiceConnection : "subscribes"
  User ||--o{ Dashboard : owns
  Dashboard ||--o{ WidgetInstance : contains
  Dashboard ||--o{ DashboardShare : "offered in"
  User ||--o{ DashboardShare : "sends / receives"
```

| Table | Columns | Notes |
|---|---|---|
| `User` | id, email (unique), passwordHash?, emailVerifiedAt?, role (`USER`\|`ADMIN`), bannedAt?, tokenVersion int, createdAt | `passwordHash` is null for OIDC-only accounts. |
| `EmailToken` | id, userId, tokenHash, expiresAt, usedAt? | Holds the SHA-256 of a random 32-byte token, never the raw token. Expires after 24 h. Single use. |
| `PasswordResetToken` | id, userId, tokenHash, expiresAt, usedAt? | Same shape as `EmailToken`: SHA-256 of a random 32-byte token, never the raw token. Expires after 1 h. Single use. Cascade on user delete. |
| `AuthIdentity` | id, userId, provider (`GITHUB`\|`GOOGLE`), providerUserId | unique(provider, providerUserId). **Login only.** |
| `ServiceConnection` | id, userId, service, externalAccountId, accessTokenEnc?, refreshTokenEnc?, expiresAt?, scopes, status (`OK`\|`REAUTH`) | unique(userId, service). **Widget credentials only.** |
| `Dashboard` | id, userId, name, position, createdAt | Several per user. The first one is created on signup. The web UI blocks deleting the only dashboard; the API does not. |
| `WidgetInstance` | id, dashboardId, service, widget, params JSONB, refreshRate int (s), x, y, w, h, createdAt, updatedAt | Grid layout lives on the instance, so deleting an instance cannot leave an orphaned layout entry. |
| `DashboardShare` | id, dashboardId, fromUserId, toUserId, status (`PENDING`\|`ADDED`\|`DECLINED`), createdAt | unique(dashboardId, toUserId). Accepting clones the dashboard and its widgets (new ids, no connections copied) and sets `ADDED`; declining sets `DECLINED`. The sender sees the status; sharing again reopens the row as `PENDING`. No live link to the original. |

`AuthIdentity` and `ServiceConnection` are separate on purpose. Logging in with GitHub never grants widget scopes. Connecting GitHub never changes how you log in.

### 8.3 Identity and permissions

**Authentication (who you are).**

| Method | Tier | Implementation |
|---|---|---|
| Email + password | core | bcrypt, cost 12. |
| GitHub login | core | `passport-github2`, scopes `read:user user:email`. |
| Google login | stretch (with YouTube) | `passport-google-oauth20`, scopes `openid email profile`. |

Steam is connect-only. OAuth never creates an account: users register with email + password first (see [§ 6.2](#62-registration-and-confirmation)), then log in or link a provider.

**Account linking** (subject: "link the third-party account to an existing platform user"):

1. If an `AuthIdentity` matches (provider, providerUserId), log that user in.
2. Otherwise, if a `User` with the same email exists:
   - If the provider email is verified **and** the local user is confirmed: create the `AuthIdentity` and log in.
   - Otherwise: refuse with *"log in with your password, then link from Profile."*
3. Otherwise: refuse with *"register with your email first, then link from Profile."*

A logged-in user can also link or unlink identities from Profile. The last remaining login method cannot be unlinked (`LAST_LOGIN_METHOD`).

**Session.**

- One JWT (`sub`, `role`, `tv` = tokenVersion, `jti`), 7-day expiry, signed with `JWT_SECRET`.
- Stored in an `httpOnly; SameSite=Lax; Path=/` cookie, plus `Secure` when `APP_URL` is https. JavaScript never reads it.
- `JwtGuard` checks the signature, then loads the user and rejects the token if its `jti` is revoked, `bannedAt` is set or `tv !== user.tokenVersion`.
- Logout revokes the `jti`; logout-everywhere and ban both increment `tokenVersion`.
- CSRF: SameSite=Lax.
- The Socket.IO handshake reads the same cookie and runs the same check. Each socket joins room `user:{id}`, so a ban can call `disconnectSockets()`.

**Authorization (what widgets may access).** "Subscribing to a service" = creating a `ServiceConnection` from the Services page.

| Service | Flow | Stored |
|---|---|---|
| github | OAuth 2.0, scopes `repo security_events` | encrypted access token (GitHub OAuth App tokens do not expire) |
| steam | Steam OpenID 2.0 (`passport-steam`) | SteamID64. The API key is server-side (`STEAM_API_KEY`). |
| youtube | Google OAuth 2.0, `youtube.readonly`, `access_type=offline` | encrypted access and refresh tokens. The token is refreshed on expiry or 401, one refresh per user at a time, written only if the row still holds the exchanged refresh token; a failed refresh marks the row `REAUTH`. |

**One callback per provider.** `/api/oauth/{provider}/callback` serves both login and connect. A GitHub OAuth App allows only one callback URL, so the two flows share it.

- The intent (`login` | `link` | `connect`) travels in `state`: an HMAC-signed, 10-minute value that is also bound to a short-lived cookie. This protects against CSRF.
- A `link` or `connect` intent requires an existing session at the start leg; `connect` attaches the connection to that user. The userId comes only from the verified state, never from the caller.

**Token storage.** Encrypted with AES-256-GCM (`node:crypto`):

- Key: `TOKEN_ENC_KEY` (32 bytes, base64, from env).
- Random 12-byte IV per value, stored as `iv:tag:ciphertext`.
- Tokens are decrypted only inside `FetchContext` (plus the youtube service's refresh-token exchange) and never serialized to the client. The client only sees `{ service, connected, status }`.

**Disconnecting** deletes the row and revokes the token at the provider where an API allows it (best effort; revocation errors are swallowed). Existing instances stay on the dashboard and show a *"Reconnect"* state. Reauth in the UI = disconnect then redirect to the connect flow.

**Roles and admin.** `RolesGuard` + `@Roles('ADMIN')` on `/api/admin/*`.

- Admins can list and search users (`q` is a literal case-insensitive email match, oldest first, pageSize max 100), ban or unban, delete, and promote or demote. An empty PATCH body gives 400 `EMPTY_PATCH`; an unknown user gives 404 `USER_NOT_FOUND`.
- A ban or a real role change increments `tokenVersion` and disconnects the user's sockets.
- An admin cannot demote, ban or delete themself (403 `CANNOT_MODIFY_SELF`).
- `DELETE /users/me` runs Serializable and refuses with 409 `LAST_ADMIN` if no other unbanned admin exists.
- On boot, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and no admin exists, a confirmed admin is created. The grader can log in immediately after `docker-compose up`.

### 8.4 Security checklist

| Concern | Measure |
|---|---|
| Passwords | bcrypt cost 12; generic login errors; no account enumeration on resend/forgot-password |
| Session theft | httpOnly cookie, JWT never exposed to JS; `jti` and tokenVersion revocation |
| CSRF | SameSite=Lax; OAuth `state` signed and cookie-bound |
| Third-party tokens | AES-256-GCM at rest, key from env, decrypted only in `FetchContext` and the youtube token refresh, never sent to the client |
| Cross-user leakage | ownership in every query; `:conn:` cache scoping; socket subscribe checks ownership |
| Injection into upstream URLs | params validated by `ParamSpec` (`pattern` for `owner/repo`, enums, bounds) and URL-encoded |
| Upstream errors | replaced by fixed texts (`fixedMessage`) before reaching clients, so tokens and internals do not leak |
| Untrusted links | widget views only link or show http(s) URLs (`isHttpUrl`) |
| Brute force | rate limit on `/auth/*` |
| Secrets | `.env` git-ignored; `.env.example` committed with placeholders only |
| Exposure | postgres and redis not published to the host |

### 8.5 Caching

Redis is a cache only. Postgres is the source of truth.

```
widget:{service}.{widget}:{sha256(canonical sorted params)}[:conn:{connectionId}]
geo:{normalized city}                                    TTL 24 h
```

- The `:conn:` suffix is added **whenever `def.auth === 'connection'`**. Two users with identical GitHub params never share an entry, while public data (weather) is shared across all users.
- TTL = `minRefreshSec`. Because `refreshRate ≥ minRefreshSec`, a due instance either reads data no older than its own floor or triggers a fresh fetch.

Redis also holds the auth rate-limit counters and revoked `jti`s.

### 8.6 Configuration

`.env.example`:

```
APP_URL=http://localhost:8080
DATABASE_URL=postgresql://dashboard:dashboard@postgres:5432/dashboard
REDIS_URL=redis://redis:6379
JWT_SECRET=
TOKEN_ENC_KEY=                 # openssl rand -base64 32
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_FROM="Dashboard <no-reply@dashboard.local>"
ADMIN_EMAIL=
ADMIN_PASSWORD=
GITHUB_CLIENT_ID=              # callback: ${APP_URL}/api/oauth/github/callback
GITHUB_CLIENT_SECRET=
STEAM_API_KEY=                 # stretch
GOOGLE_CLIENT_ID=              # stretch; callback: ${APP_URL}/api/oauth/google/callback
GOOGLE_CLIENT_SECRET=
```

`ConfigModule` is global and reads `../.env.local` then `../.env`. Config is validated at boot (`server/src/core/config/env.validation.ts`), applying the SMTP defaults above. The server refuses to start without `JWT_SECRET`, a 32-byte `TOKEN_ENC_KEY` and a valid `APP_URL`. `prisma.config.ts` reads `DATABASE_URL` from the process env only, not from these files.

### 8.7 Error handling

REST errors carry a machine-readable `code` (for example `INVALID_PARAMS`, `LAST_ADMIN`), which the web client surfaces as `ApiError` (status + code). Widget fetch failures are `FetchError` codes sent as `widget:error` (see [§ 6.1](#61-widget-refresh)). Mail send methods never throw; failures are only logged.

### 8.8 Testing

Unit tests are colocated as `*.spec.ts`; e2e suites run against real Postgres and Redis. See [Testing.md](./Testing.md).

## 9. Architecture decisions

| Decision | Reason | Rejected alternative |
|---|---|---|
| Server Timer drives refresh, active instances only | Matches the subject's Timer and spends no quota for offline users | Client polling (moves the "Timer" into the browser); refreshing every instance (burns quota for offline users) |
| In-memory active set for Timer state | No query per tick and no re-registering on every change | A DB scan every tick; per-instance `@nestjs/schedule` timers |
| Single origin on 8080 | No CORS and no cross-site cookie/OAuth handling | A separate client container |
| JWT in httpOnly cookie + tokenVersion | Less code than refresh tokens, and not readable by XSS | Refresh tokens; localStorage |
| Separate login and widget OAuth flows and tables | Login scope stays minimal | One broad consent that asks for `repo` just to sign in |
| Auto-link only when both emails are verified | Prevents takeover through an unverified provider email | Always auto-linking |
| App-side AES-256-GCM token storage | Meets the subject's "extreme care" bar with the key kept in env | pgcrypto (still needs the key in the app); plaintext |
| Widget forms generated from `ParamSpec` | Validation is declared once | Hand-built forms that duplicate validation |
| Prisma ORM | Stronger typing | TypeORM (weaker typing); Drizzle (thinner Nest ecosystem) |
| Several dashboards per user, layout on the instance | Layout cannot drift from the instances | A separate layout JSON |
| bcrypt for passwords | Avoids native-build overhead in the Docker image | argon2 |
| shadcn/ui copied into the repo | No supply-chain drift; only small, stable Radix primitives are installed | A live component-library package |
| Explicit Move buttons alongside react-grid-layout | Keyboard and screen-reader access to the layout | Drag-only layout |
| Default services: Open-Meteo, GitHub (core); Steam, YouTube (stretch) | No-key or free-key services that clear 2 services / 3 widgets for a solo project, none need a card | Paid or card-gated APIs |
| Real Postgres/Redis via Testcontainers in tests | Schema drift and query bugs surface before prod | Mocking the DB; the dev compose services |

## 10. Quality requirements

| Goal | Target |
|---|---|
| Security of credentials | 0 tokens in any API or socket payload (asserted by e2e tests). |
| Upstream quota economy | At most one upstream call per cache key per `minRefreshSec`. |
| Freshness | A watched widget gets data within its `refreshRate` + the 1 s tick. |
| Extensibility | A new widget touches only `server/src/services/<name>`, `shared/src/widgets.ts` and `web/src/widgets/registry.tsx`. |

## 11. Risks and technical debt

| Risk | Where |
|---|---|
| Single process with an in-memory Timer set, so no horizontal scaling. | `server/src/timer/timer.service.ts` |
| `clientAddress` ignores proxy headers, so behind a proxy it returns the proxy IP. | `server/src/core/http/client-address.ts` |
| Mail failures are only logged, and SMTP has no auth/TLS options. | `server/src/core/mail/mail.service.ts` |
| Failures of the 60 s socket re-check do not disconnect. | `server/src/timer/realtime.gateway.ts` |
| The weather e2e suite calls the real Open-Meteo API, so it needs network. | `server/test/weather.e2e-spec.ts` |
| A missing `STEAM_API_KEY` still registers the Steam widgets, but every fetch fails with `UPSTREAM_ERROR`. | `server/src/services/steam/steam.module.ts` |
| Port 8080 is hardcoded. | `server/src/main.ts` |

## 12. Glossary

| Term | Meaning |
|---|---|
| Service | An upstream provider grouping widgets (`weather`, `github`, `steam`, `youtube`); `ServiceSpec`. |
| Widget / `WidgetDefinition` | A server-registered kind of panel (`service.widget`, e.g. `github.recent_commits`) with params and a `fetch`. |
| Widget instance | A configured widget on a dashboard: params, `refreshRate`, grid position (`WidgetInstance`). |
| `ParamSpec` | Declaration of one widget param: type, bounds, enum, pattern. |
| `minRefreshSec` | Per-widget floor for `refreshRate`, also the cache TTL. |
| `refreshRate` | Seconds between Timer fetches for an instance, in `[minRefreshSec, 86400]`. |
| Timer | Server tick loop (`TimerService`) that fetches due watched instances. |
| Active set | The Timer's in-memory map of watched instances. |
| Room | Socket.IO room: `instance:{id}` for widget pushes, `user:{id}` for a user's sockets. |
| `ServiceConnection` / connect | A user's stored credentials for a widget service (subscribing to a service). |
| `AuthIdentity` / link | A third-party login method attached to a user. |
| `FetchContext` | Per-user context passed to `fetch`, holding decrypted tokens; never reaches the client. |
| `FetchError` | Typed widget fetch failure: `NOT_CONNECTED`, `REAUTH_REQUIRED`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INVALID_PARAMS`. |
| `REAUTH` | Connection status after a failed token refresh; the user must reconnect. |
| `tokenVersion` / `tv` | Per-user counter in the JWT; bumping it invalidates all sessions. |
| `jti` | Per-token id, revoked in Redis on logout. |
| Dashboard share | An offer of a copy of a dashboard to another user (`DashboardShare`). |
| `WidgetDataMap` | Shared map from `service.widget` to its data shape. |
| Kept dashboard | The last-visited dashboard that `AppShell` keeps mounted but hidden. |
| X | Subject's team-size factor; the project needs (1+X) services and (3×X) widgets. |
