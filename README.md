# Dashboard

A customizable dashboard that gathers information from several online services and keeps it up to date in real time. You create an account, connect the services you use (GitHub, Steam, YouTube…), then add **widgets** to your dashboard. Each widget shows one piece of information, such as the weather in a city, the latest commits of a repository, or a channel's subscriber count. Each widget refreshes on its own schedule.

## Contents

- [Purpose and use cases](#purpose-and-use-cases)
- [Features](#features)
- [Services and widgets](#services-and-widgets)
- [Install and build](#install-and-build)
- [Run and use](#run-and-use)
- [Technologies](#technologies)
- [System structure](#system-structure)
- [Development](#development)

## Purpose and use cases

The dashboard is a personal control panel, for example a browser's new-tab page, that brings scattered information into one place:

- **Developer:** watch your repositories' latest commits, open pull requests and Dependabot security alerts.
- **Gamer:** see what you played on Steam recently and follow the news for your favorite games.
- **Viewer / creator:** follow a YouTube channel's statistics and latest uploads, or what is trending in your country.
- **Everyone:** check the current weather and the forecast for any city.

You can add the same widget several times with different settings. For example, two weather widgets for Paris and Tokyo show different data side by side.

## Features

**Accounts**
- Register with email and password, then confirm the account from the link sent by email. Unconfirmed accounts cannot log in.
- Forgotten password reset by email.
- Log in with **GitHub** or **Google** once the provider is linked to an existing account (from the Profile page).
- Log out of every device at once.

**Services**
- Weather needs no account and is available to every user.
- GitHub, Steam and YouTube stay unavailable until you **connect** them from the Services page (OAuth 2.0 / OpenID). You can disconnect them at any time.
- Third-party tokens are encrypted at rest (AES-256-GCM) and never sent to the browser.

**Dashboard**
- **Add** a widget: pick a widget type, configure it, set its refresh rate, confirm.
- **Reconfigure** a widget's settings or refresh rate.
- **Move** and resize widgets by drag and drop, or from the widget's menu (keyboard accessible).
- **Delete** a widget.
- Share a dashboard with another user.
- Live refresh: a server-side **Timer** fetches each widget at its own refresh rate and pushes the result to the browser over WebSocket.

**Administration**
- Administrators can list and search users, ban or unban them, promote or demote them, and delete them.

**Interface**
- Responsive layout (phone to desktop), keyboard navigation, and accessible dialogs and menus.

## Services and widgets

4 services and 10 widgets. Every widget has at least one setting, and every widget also takes a refresh rate. The rate can't go below the minimum shown, which keeps the app inside the providers' free API quotas.

| Service | Requires | Widget | Shows | Settings | Min. refresh |
|---|---|---|---|---|---|
| **weather** (Open-Meteo) | nothing | `current_weather` | Current temperature and conditions for a city | `city`, `units` | 5 min |
| | | `forecast` | Daily min/max temperature and conditions for the next days | `city`, `days` (1–7) | 15 min |
| **github** | GitHub account | `recent_commits` | Latest commits on a repository's default branch | `repo`, `number` (1–20) | 1 min |
| | | `pull_requests` | Pull requests of a repository, filtered by state | `repo`, `state` (open/closed/all) | 1 min |
| | | `security_alerts` | Open Dependabot security alerts of a repository | `repo` | 5 min |
| **steam** | Steam account | `recently_played` | Games you played in the last two weeks | `number` (1–10) | 10 min |
| | | `game_news` | Latest news for a Steam game | `app_id` (game search), `number` (1–10) | 15 min |
| **youtube** | Google account | `channel_stats` | Subscriber, view and video counts of a channel | `channel_id` (channel search) | 10 min |
| | | `latest_videos` | Most recent uploads of a channel | `channel_id`, `number` (1–10) | 10 min |
| | | `trending_videos` | Most popular videos in a country right now | `region` (e.g. `FR`), `number` (1–10) | 15 min |

The live list, with every parameter's name and type, is served at [`/about.json`](#aboutjson).

## Install and build

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose.
- `openssl`, to generate secrets.

### 1. Get the code

```sh
git clone <repository-url> dashboard
cd dashboard
```

### 2. Configure

Copy the example configuration and fill in the two required secrets:

```sh
cp .env.example .env
```

| Variable | Required | How to set it |
|---|---|---|
| `JWT_SECRET` | **yes** | Any long random string: `openssl rand -base64 48` |
| `TOKEN_ENC_KEY` | **yes** | Exactly 32 bytes, base64: `openssl rand -base64 32` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | no | Creates a confirmed administrator on first start. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | no | [GitHub OAuth App](https://github.com/settings/developers), callback `http://localhost:8080/api/oauth/github/callback`. Enables GitHub login and the GitHub service. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | [Google Cloud OAuth client](https://console.cloud.google.com/apis/credentials) with the YouTube Data API v3 enabled, callback `http://localhost:8080/api/oauth/google/callback`. Enables Google login and the YouTube service. |
| `STEAM_API_KEY` | no | [Steam Web API key](https://steamcommunity.com/dev/apikey). Enables the Steam service. |

The other variables (`APP_URL`, `DATABASE_URL`, `REDIS_URL`, `SMTP_*`) already work with Docker Compose.

The server refuses to start without `JWT_SECRET` and a valid `TOKEN_ENC_KEY`. A service whose keys are missing is still listed, but its **Connect** button shows that it is not configured on this server. Weather works with no keys at all.

> `.env` contains secrets and is ignored by git. Never commit it.

### 3. Build

```sh
docker-compose build
```

## Run and use

```sh
docker-compose up
```

This starts four containers:

| Container | Address | Role |
|---|---|---|
| `server` | http://localhost:8080 | The application (web interface + API) |
| `mailpit` | http://localhost:8025 | Test mailbox: every email the app sends lands here |
| `postgres` | internal | Database |
| `redis` | internal | Cache for external API responses |

Database migrations run automatically when the server starts.

### Using the app

1. Open **http://localhost:8080** and **register** with an email and password.
2. Open **http://localhost:8025** (Mailpit), open the confirmation email, and click the link.
3. **Log in.** You land on your dashboard.
4. *(Optional)* Open **Services** and **connect** GitHub, Steam or YouTube. Weather works without this step.
5. On the dashboard, click **Add widget**: pick a widget, fill in its settings (for example a city or `owner/repo`), choose a refresh rate, and confirm.
6. Drag a widget by its title bar to move it, or drag its corner to resize it. Its menu also offers **Configure** (change settings or refresh rate), keyboard-friendly **Move** and resize items, and **Delete**.

If you set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, log in with them to reach the **Admin** page.

### `/about.json`

`GET http://localhost:8080/about.json` returns the client's IP address, the server time (Unix epoch), and every service with its widgets and their parameters:

```json
{
  "client": { "host": "172.18.0.1" },
  "server": {
    "current_time": 1760054400,
    "services": [
      {
        "name": "weather",
        "widgets": [
          {
            "name": "forecast",
            "description": "Daily min/max temperature and conditions for the next days.",
            "params": [
              { "name": "city", "type": "string" },
              { "name": "days", "type": "integer" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Technologies

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, end to end | Widget parameter and data types live in `shared/` and are used by both server and client, so they can't drift apart. |
| Backend | NestJS + Prisma | Each service is a Nest module that registers its widgets, so `/about.json`, the catalog and validation are generated from one registry. Prisma gives a typed ORM and versioned migrations. |
| Frontend | React + Vite | Largest ecosystem for the two hard UI problems: a draggable widget grid (`react-grid-layout`) and accessible dialogs (Radix / shadcn/ui). TanStack Query caches server state. |
| Styling | Tailwind CSS + shadcn/ui | Fast responsive layouts. Accessible components are copied into the repo instead of installed as a dependency. |
| Database | PostgreSQL | Users → service connections → dashboards → widget instances are relational. Widget settings are stored as JSONB. |
| Cache | Redis | Caches external API responses per (widget, settings, account) to stay under free quotas without leaking data between users. |
| Auth | Passport.js, JWT (httpOnly cookie), bcrypt, Nodemailer | Local login plus GitHub/Google OAuth, with the same strategies reused to connect services. |
| Timer / realtime | Server tick loop + Socket.IO | Each widget sends its refresh rate to the server-side Timer, which fetches the data and pushes it to the browser. |
| Testing | Vitest, Supertest, Testcontainers | Unit tests, plus end-to-end tests against real Postgres/Redis containers. |

The detailed rationale and rejected alternatives are in [docs/Architecture.md § 4](docs/Architecture.md#4-solution-strategy) and [§ 9](docs/Architecture.md#9-architecture-decisions).

## System structure

```mermaid
flowchart LR
  B[Browser<br/>React app] -- "REST /api/*<br/>WebSocket /socket.io" --> S
  subgraph compose[docker-compose]
    S[server :8080<br/>NestJS + built React app]
    P[(PostgreSQL)]
    R[(Redis)]
    M[Mailpit<br/>:8025]
  end
  S --> P
  S --> R
  S -- SMTP --> M
  S -- HTTPS --> U[External APIs<br/>Open-Meteo, GitHub,<br/>Steam, YouTube]
```

The server serves the web interface, the REST API, the WebSocket and `/about.json`, all from port 8080.

**How a widget refreshes:** the browser subscribes each visible widget over the WebSocket. The Timer keeps a list of watched widgets and, when one is due according to its refresh rate, asks the widget's service to fetch the data. The result goes through the Redis cache and is pushed to every browser showing that widget. Widgets nobody is looking at are not fetched.

```
.
├── docker-compose.yml   # server, postgres, redis, mailpit
├── Dockerfile           # multi-stage: build shared → web → server → slim runtime image
├── .env.example         # every configuration variable, no secrets
├── shared/              # TypeScript types shared by server and web
├── server/
│   ├── prisma/          # database schema and migrations
│   ├── src/
│   │   ├── core/        # config validation, database, Redis, mail
│   │   ├── auth/        # registration, confirmation, login, OAuth login, sessions
│   │   ├── users/       # profile
│   │   ├── admin/       # user administration
│   │   ├── connections/ # connecting / disconnecting services (OAuth, encrypted tokens)
│   │   ├── catalog/     # widget registry, /about.json, /api/catalog
│   │   ├── dashboards/  # dashboards, widget instances, sharing
│   │   ├── timer/       # refresh scheduler + Socket.IO gateway
│   │   └── services/    # one folder per service: weather, github, steam, youtube
│   └── test/            # end-to-end tests
├── web/src/
│   ├── routes/          # pages: login, register, dashboard, services, profile, admin…
│   ├── components/      # widget frame, add-widget dialog, UI kit
│   ├── widgets/         # one view per widget
│   ├── realtime/        # WebSocket client
│   └── api/             # REST hooks
└── docs/                # architecture, stack, testing
```

**Adding a service** means creating `server/src/services/<name>/` with its widget definitions (name, parameters, minimum refresh rate, fetch function), registering the module, and adding one view per widget in `web/src/widgets/`. `/about.json` and the add-widget dialog pick the new widgets up automatically.

See [docs/Architecture.md](docs/Architecture.md) (arc42) for the REST API and socket events, building blocks, runtime flows, data model, identity and permissions, and the security checklist.

## Development

Requires Node.js 24+ and Docker.

```sh
npm install
cp .env.example .env   # fill JWT_SECRET and TOKEN_ENC_KEY (openssl rand -base64 32)
npm run dev:deps       # postgres, redis, mailpit in Docker, published on localhost
# .env uses the compose hostnames; override them for processes on the host
export DATABASE_URL=postgresql://dashboard:dashboard@localhost:5432/dashboard
export REDIS_URL=redis://localhost:6379 SMTP_HOST=localhost
npm run db:deploy -w server   # apply database migrations
npm run dev            # server, watch mode
npm run dev:web        # Vite dev server
```

| Command | Runs |
|---|---|
| `npm run build` | Builds shared, web and server |
| `npm run lint` | ESLint on server and web |
| `npm test` | Unit tests (server and web) |
| `npm run test:e2e` | Server end-to-end tests against Testcontainers (needs Docker) |
| `npm run test:cov -w server` | Server coverage report |

Testing strategy: [docs/Testing.md](docs/Testing.md).
