# Architecture

Solo project. The subject requires at least **2 services / 3 widgets** (X = 1). The plan ships a core tier that clears this with margin, then adds stretch services in order.

## 1. System overview

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
```

**Single origin.** The multi-stage Dockerfile builds the Vite SPA, and NestJS serves it with `@nestjs/serve-static`. Everything runs on port 8080:

| Path | Handler |
|---|---|
| `/about.json` | `AboutController` (not under `/api`) |
| `/api/*` | REST controllers |
| `/socket.io/*` | Socket.IO gateway |
| everything else | SPA `index.html` fallback |

Because the app has a single origin, it needs no CORS setup. Cookies and OAuth redirects work without cross-site handling.

**Compose services**

| Service | Image | Exposed to host | Notes |
|---|---|---|---|
| `server` | built from `./Dockerfile` | `8080` | `depends_on` postgres/redis `service_healthy`. The entrypoint runs `prisma migrate deploy`, then starts Nest. |
| `postgres` | `postgres:16-alpine` | no | Named volume, `pg_isready` healthcheck. |
| `redis` | `redis:7-alpine` | no | Cache only. Losing it is harmless. |
| `mailpit` | `axllent/mailpit` | `8025` (inbox UI) | Catches confirmation emails, so the flow works offline on any machine. |

## 2. Repository layout

npm workspaces, no extra tooling.

```
/
├── docker-compose.yml
├── Dockerfile              # deps → build shared → build web → build server → runtime
├── .env.example            # every variable, no secrets
├── shared/                 # plain TS types, no runtime deps
│   └── src/
│       ├── widgets.ts      # WidgetDataMap: 'service.widget' → data shape
│       ├── catalog.ts      # ParamSpec, WidgetSpec, ServiceSpec
│       ├── socket.ts       # client↔server event names + payloads
│       └── dto.ts          # REST request/response shapes
├── server/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── core/           # config, prisma, redis, crypto, mail
│       ├── auth/           # local + OIDC login, session, email confirmation
│       ├── users/
│       ├── admin/
│       ├── connections/    # per-user service subscriptions (OAuth/OpenID)
│       ├── catalog/        # WidgetRegistry, /about.json, /api/catalog
│       ├── dashboards/     # dashboards + widget instances CRUD
│       ├── timer/          # scheduler, fetch service, Socket.IO gateway
│       └── services/
│           ├── weather/
│           ├── github/
│           ├── steam/      # stretch
│           └── youtube/    # stretch
└── web/
    └── src/
        ├── api/            # TanStack Query hooks
        ├── realtime/       # SocketProvider, useWidgetData
        ├── widgets/        # one view component per widget + view registry
        ├── components/     # WidgetFrame, ParamForm, AddWidgetDialog, shadcn/ui
        └── routes/         # login, register, confirm, dashboard, services, profile, admin
```

## 3. Core abstraction: the widget registry

Everything that knows about widgets reads one registry: `/about.json`, `/api/catalog`, param validation, and the Timer. **Adding a widget = one definition on the server + one view on the client.** No other code changes.

```ts
// shared/src/catalog.ts
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

Each `services/<name>` module calls `registry.register(def)` in `onModuleInit`. It also declares its `ServiceSpec` (`name`, `connection: 'none' | 'oauth' | 'openid'`).

The server and client share types only through `WidgetDataMap`, so a view and its `fetch()` cannot drift apart.

### Widget catalog

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

### `/about.json`

- `client.host`: `req.socket.remoteAddress`, with the `::ffff:` IPv4-mapped prefix stripped. No `trust proxy`, because nothing sits in front of the server.
- `server.current_time`: `Math.floor(Date.now() / 1000)`.
- `server.services[].widgets[]`: only `name`, `description`, and `params[].{name,type}`. The extra `ParamSpec` fields go only to the authenticated `/api/catalog`.

## 4. Data model

```mermaid
erDiagram
  User ||--o{ EmailToken : has
  User ||--o{ AuthIdentity : "logs in via"
  User ||--o{ ServiceConnection : "subscribes"
  User ||--o{ Dashboard : owns
  Dashboard ||--o{ WidgetInstance : contains
```

| Table | Columns | Notes |
|---|---|---|
| `User` | id, email (unique), passwordHash?, emailVerifiedAt?, role (`USER`\|`ADMIN`), bannedAt?, tokenVersion int, createdAt | `passwordHash` is null for OIDC-only accounts. |
| `EmailToken` | id, userId, tokenHash, expiresAt, usedAt? | Holds the SHA-256 of a random 32-byte token, never the raw token. Expires after 24 h. Single use. |
| `AuthIdentity` | id, userId, provider (`GITHUB`\|`GOOGLE`), providerUserId | unique(provider, providerUserId). **Login only.** |
| `ServiceConnection` | id, userId, service, externalAccountId, accessTokenEnc?, refreshTokenEnc?, expiresAt?, scopes, status (`OK`\|`REAUTH`) | unique(userId, service). **Widget credentials only.** |
| `Dashboard` | id, userId, name, position, createdAt | Several per user. The first one is created on signup. |
| `WidgetInstance` | id, dashboardId, service, widget, params JSONB, refreshRate int (s), x, y, w, h, createdAt, updatedAt | Grid layout lives on the instance, so deleting an instance cannot leave an orphaned layout entry. |

`AuthIdentity` and `ServiceConnection` are separate on purpose. Logging in with GitHub never grants widget scopes. Connecting GitHub never changes how you log in.

## 5. Identity and permissions

### 5.1 Authentication (who you are)

| Method | Tier | Implementation |
|---|---|---|
| Email + password | core | Passport `local` strategy. bcrypt, cost 12. |
| GitHub login | core | `passport-github2`, scopes `read:user user:email`. |
| Google login | stretch (with YouTube) | `passport-google-oauth20`, scopes `openid email profile`. |

**Registration and confirmation.**

```
POST /api/auth/register      → create User (unverified), EmailToken, send mail via Nodemailer → mailpit
GET  /api/auth/confirm?token → hash, match unexpired unused token → set emailVerifiedAt
POST /api/auth/resend        → rate-limited, always 200 (no account enumeration)
POST /api/auth/login         → local strategy; 403 EMAIL_NOT_CONFIRMED if unverified
```

OIDC signups are marked verified immediately, but only when the provider reports a verified email.

**Account linking** (subject: "link the third-party account to an existing platform user"):

1. If an `AuthIdentity` matches (provider, providerUserId), log that user in.
2. Otherwise, if a `User` with the same email exists:
   - If the provider email is verified **and** the local user is confirmed: create the `AuthIdentity` and log in.
   - Otherwise: refuse with *"log in with your password, then link from Profile."*
3. Otherwise, create the `User` and the `AuthIdentity`.

A logged-in user can also link or unlink identities from Profile. The last remaining login method cannot be unlinked.

**Session**

- One JWT (`sub`, `role`, `tv` = tokenVersion), 7-day expiry, signed with `JWT_SECRET`.
- Stored in an `httpOnly; SameSite=Lax; Path=/` cookie, plus `Secure` when `APP_URL` is https. JavaScript never reads it.
- `JwtGuard` checks the signature, then loads the user and rejects the token if `bannedAt` is set or `tv !== user.tokenVersion`.
- Logout-everywhere and ban both increment `tokenVersion`.
- CSRF: SameSite=Lax, and the API only accepts `application/json` bodies. Cross-site form posts cannot reach a mutating route.
- The Socket.IO handshake reads the same cookie and runs the same check. Each socket joins room `user:{id}`, so a ban can call `disconnectSockets()`.

### 5.2 Authorization (what widgets may access)

"Subscribing to a service" = creating a `ServiceConnection` from the Services page.

| Service | Flow | Stored |
|---|---|---|
| github | OAuth 2.0, scopes `repo security_events` | encrypted access token (GitHub OAuth App tokens do not expire) |
| steam | Steam OpenID 2.0 (`passport-steam`) | SteamID64. The API key is server-side (`STEAM_API_KEY`). |
| youtube | Google OAuth 2.0, `youtube.readonly`, `access_type=offline` | encrypted access and refresh tokens. The token is refreshed on expiry or 401. |

**One callback per provider.** `/api/oauth/{provider}/callback` serves both login and connect. A GitHub OAuth App allows only one callback URL, so the two flows share it.

- The intent (`login` | `connect`) travels in `state`: an HMAC-signed, 10-minute value that is also bound to a short-lived cookie. This protects against CSRF.
- A `connect` intent requires an existing session and attaches the connection to that user.

**Token storage.** Encrypted with AES-256-GCM (`node:crypto`):

- Key: `TOKEN_ENC_KEY` (32 bytes, base64, from env).
- Random 12-byte IV per value, stored as `iv:tag:ciphertext`.
- Tokens are decrypted only inside `FetchContext` (plus the youtube service's refresh-token exchange) and never serialized to the client. The client only sees `{ service, connected, status }`.

**Disconnecting** deletes the row and revokes the token at the provider where an API allows it. Existing instances stay on the dashboard and show a *"Reconnect"* state.

### 5.3 Roles and admin

`RolesGuard` + `@Roles('ADMIN')` on `/api/admin/*`.

- Admins can list and search users, ban or unban (which also kills sessions and sockets), delete, and promote or demote.
- An admin cannot demote or ban themself.
- On boot, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and no admin exists, a confirmed admin is created. The grader can log in immediately after `docker-compose up`.

## 6. Timer and realtime refresh

The subject says each widget instance *"communicates its refresh rate to the Timer"*. Here the client subscribes an instance over Socket.IO, and the server-side Timer fetches that instance on its `refreshRate` **only while at least one browser is watching it**. This means no upstream quota is spent for users who are offline.

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
    T->>W: widget:data {instanceId, data, fetchedAt, paramsKey} (room)
    T->>T: nextDueAt = now + refreshRate
  end
  W->>G: widget:unsubscribe / disconnect
  G->>T: room empty → deactivate(instanceId)
```

**Active set.** The Timer keeps an in-memory `Map<instanceId, { def, params, userId, refreshRate, nextDueAt, failures, inFlight }>`.

- Entries are added on the first subscriber. They are removed when the room empties, detected with the adapter's `delete-room` event.
- `PATCH` (reconfigure) and `DELETE` on an instance go through `DashboardsService`. That service updates or removes the entry, and a reconfigured instance gets `nextDueAt = now` so the new params show immediately.
- After a server restart the map is empty. Socket.IO clients reconnect and re-emit `subscribe` on `connect`, which rebuilds it. The design has one process, so it needs no distributed lock.

**Fetch dedupe.** The `FetchService` holds an in-flight `Map<cacheKey, Promise>`. Two due instances with the same key trigger one upstream call.

**Failures.** Each failure emits `widget:error { instanceId, code, message, retryAt }`.

| Code | Cause | Effect |
|---|---|---|
| `NOT_CONNECTED` | the user has no connection for this service | entry deactivated, no retry |
| `REAUTH_REQUIRED` | the provider returned 401 and the refresh failed | connection `status = REAUTH`, no retry |
| `RATE_LIMITED`, `UPSTREAM_ERROR` | upstream problem | backoff `nextDueAt = now + min(refreshRate · 2^failures, 15 min)` |
| `INVALID_PARAMS` | upstream rejected the params (e.g. unknown repo) | no retry until reconfigured |

**Refresh rate.** An integer number of seconds, set in the add/configure dialog. Validated as `minRefreshSec ≤ refreshRate ≤ 86400`.

## 7. Caching

Redis is a cache only. Postgres is the source of truth.

```
widget:{service}.{widget}:{sha256(canonical sorted params)}[:conn:{connectionId}]
geo:{normalized city}                                    TTL 24 h
```

- The `:conn:` suffix is added **whenever `def.auth === 'connection'`**. Two users with identical GitHub params never share an entry, while public data (weather) is shared across all users.
- TTL = `minRefreshSec`. Because `refreshRate ≥ minRefreshSec`, a due instance either reads data no older than its own floor or triggers a fresh fetch.

## 8. REST API

All routes are under `/api` and require the JWT cookie unless marked public. Bodies are validated by the global `ValidationPipe` (class-validator). Widget `params` are validated against the registry's `ParamSpec`s (type, required, enum, min/max, pattern) on create and update.

| Method | Path | Purpose |
|---|---|---|
| GET | `/about.json` *(public, root)* | Subject endpoint |
| POST | `/auth/register`, `/auth/login`, `/auth/resend` *(public)* | Local auth |
| GET | `/auth/confirm?token=` *(public)* | Email confirmation |
| POST | `/auth/logout`, `/auth/logout-all` | Clear the cookie; `logout-all` also bumps tokenVersion |
| GET | `/auth/me` | Current user + linked identities |
| GET | `/oauth/{provider}/start?intent=login\|connect`, `/oauth/{provider}/callback` | OAuth/OpenID flows |
| GET | `/catalog` | Services + widgets + full `ParamSpec`s + the user's connection status per service |
| GET / DELETE | `/connections`, `/connections/{service}` | List / disconnect |
| GET / POST / PATCH / DELETE | `/dashboards`, `/dashboards/{id}` | Dashboard CRUD (name, position) |
| GET | `/dashboards/{id}/widgets` | List the dashboard's instances `{ widgets: [...] }` |
| POST | `/dashboards/{id}/widgets` | Add instance `{ service, widget, params, refreshRate, x, y, w, h }` |
| PATCH | `/dashboards/{id}/layout` | Bulk `[{ id, x, y, w, h }]` after a drag or resize |
| PATCH / DELETE | `/widgets/{id}` | Reconfigure (`params`, `refreshRate`) / delete |
| GET / PATCH / DELETE | `/admin/users`, `/admin/users/{id}` | Admin |

Every `{id}` lookup is scoped by `userId` in the query itself, so an instance owned by someone else is a 404, not a 403.

Socket events (`shared/src/socket.ts`):

| Direction | Event | Payload |
|---|---|---|
| client → server | `widget:subscribe`, `widget:unsubscribe` | `{ instanceId }` |
| server → client | `widget:data` | `{ instanceId, data, fetchedAt, paramsKey? }` |
| server → client | `widget:error` | `{ instanceId, code, message, retryAt? }` |

## 9. Frontend

- **Routing**: `/login`, `/register`, `/confirm`, `/d/:dashboardId` (main page), `/services`, `/profile`, `/admin`. The auth gate is based on `/api/auth/me`.
- **Server state**: TanStack Query for REST: catalog, dashboards, instances, connections. There is no `refetchInterval`, because the Timer owns refresh.
- **Realtime**: a single `SocketProvider`. The `useWidgetData(instanceId)` hook emits `subscribe` on mount and `unsubscribe` on unmount, and writes incoming `widget:data` into the query cache under `['widget', instanceId]`. Widgets render from the cache like any query.
- **Widget rendering**: `WidgetFrame` owns the chrome: title, loading skeleton, error and "Reconnect" states, and a menu with Configure / Move / Delete. The body comes from a view registry: `views['github.recent_commits'] = RecentCommitsView`.
- **Add / configure dialog** (shadcn `Dialog`), in four steps that mirror the subject's wording:
  1. Select a widget type, grouped by service. Widgets from unconnected services are disabled and show a "Connect" link.
  2. `ParamForm` is generated from the `ParamSpec`s. An `enum` becomes a select, an integer becomes a number input with min/max, `pattern` gives inline validation.
  3. Refresh rate, prefilled with `minRefreshSec`.
  4. Confirm.

  The same dialog, prefilled, is used for reconfiguring.
- **Grid**: `react-grid-layout`, 12 columns on `lg`. `onDragStop` and `onResizeStop` call `PATCH /layout`. Below `md`, widgets stack in a single column ordered by (y, x), and drag is disabled.
- **Accessibility**: shadcn/Radix focus traps and labelled dialogs, visible focus rings, and Move up/down/left/right in each widget's menu so layout can be changed without a mouse. Widget updates use `aria-live="polite"` on the value only, not the whole card. Color is never the only signal.

## 10. Security checklist

| Concern | Measure |
|---|---|
| Passwords | bcrypt cost 12; generic login errors; no account enumeration on register/resend |
| Session theft | httpOnly cookie, JWT never exposed to JS; tokenVersion revocation |
| CSRF | SameSite=Lax + JSON-only bodies; OAuth `state` signed and cookie-bound |
| Third-party tokens | AES-256-GCM at rest, key from env, decrypted only in `FetchContext` and the youtube token refresh, never sent to the client |
| Cross-user leakage | ownership in every query; `:conn:` cache scoping; socket subscribe checks ownership |
| Injection into upstream URLs | params validated by `ParamSpec` (`pattern` for `owner/repo`, enums, bounds) and URL-encoded |
| Brute force | rate limit on `/auth/*` |
| Secrets | `.env` git-ignored; `.env.example` committed with placeholders only |
| Exposure | postgres and redis not published to the host |

## 11. Configuration

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

Config is validated at boot. The server refuses to start without `JWT_SECRET` and a 32-byte `TOKEN_ENC_KEY`. A service whose keys are missing is still listed, but its connect button shows "not configured on this server".

## 12. Build order

1. Compose skeleton + Nest + `/about.json` from an empty registry, then the Prisma schema and migrations.
2. Local auth: register, Mailpit confirmation, login, cookie session, admin seed.
3. Registry + weather service + `/api/catalog`, then dashboards and instance CRUD, then the SPA grid with the generated `ParamForm`.
4. Timer + gateway + Redis cache. Weather widgets now refresh live.
5. GitHub login + GitHub connect + the 3 GitHub widgets. **Core complete: 2 services / 5 widgets.**
6. Admin UI, accessibility pass, README.
7. Stretch: Steam, then YouTube + Google login.

## 13. Decisions

| Decision | Chosen | Rejected because |
|---|---|---|
| Who drives refresh | Server Timer, active instances only | Client polling moves the "Timer" into the browser. Refreshing every instance burns quota for offline users. |
| Timer state | In-memory active set | A DB scan runs a query every tick. Per-instance `@nestjs/schedule` timers mean re-registering on every change. |
| Topology | Single origin on 8080 | A separate client container adds CORS and cross-site cookie/OAuth handling. |
| Session | JWT in httpOnly cookie + tokenVersion | Refresh tokens are more code than the project needs. localStorage is readable by XSS. |
| Login vs widget OAuth | Separate flows and tables | One broad consent asks for `repo` just to sign in. |
| Account linking | Auto-link only when both emails are verified | Always auto-linking allows takeover through an unverified provider email. |
| Token storage | App-side AES-256-GCM | pgcrypto still needs the key in the app. Plaintext fails the subject's "extreme care" bar. |
| Widget forms | Generated from `ParamSpec` | Hand-built forms duplicate validation. |
| ORM | Prisma | TypeORM has weaker typing. Drizzle has a thinner Nest ecosystem. |
| Dashboards | Several per user, layout on the instance | A separate layout JSON can drift from the instances. |
| Scope (solo) | Core weather + github, stretch steam → youtube | — |

