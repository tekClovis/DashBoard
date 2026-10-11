# Dashboard

<p align="center">
  <img src="https://raw.githubusercontent.com/tekClovis/tekClovis/main/gif/dashBoard.gif" width="640" alt="dashBoard" />
</p>

A customizable dashboard that gathers information from online services (Weather, GitHub, Steam, YouTube) into **widgets** that refresh themselves in real time.

## Contents

- [Purpose and use cases](#purpose-and-use-cases)
- [Features](#features)
- [Services and widgets](#services-and-widgets)
- [Install, build and run](#install-build-and-run)
- [Using the app](#using-the-app)
- [Production deployment](#production-deployment)
- [Configuration reference](#configuration-reference)
- [`/about.json`](#aboutjson)
- [Technologies](#technologies)
- [System structure](#system-structure)
- [Development and tests](#development-and-tests)

## Purpose and use cases

The dashboard is a personal control panel, for example a browser's new-tab page. You create an account, connect the services you use, and add widgets. Each widget shows one piece of information and refreshes on its own schedule.

- **Developer:** see a repository's latest commits, open pull requests and Dependabot security alerts.
- **Gamer:** see your recently played Steam games and follow the news for a game.
- **Viewer or creator:** follow a YouTube channel's statistics and uploads, or see what is trending in a country.
- **Everyone:** check the current weather and the forecast for any city.

## Features

- **Users:** register with email and password, confirm the account by email, reset a forgotten password, and log in with GitHub or Google once linked from the Profile page. Logging out signs you out on every device.
- **Services:** Weather needs no account. GitHub, Steam and YouTube must be **connected** from the Services page (OAuth 2.0 / OpenID). Third-party tokens are encrypted at rest (AES-256-GCM) and are never sent to the browser.
- **Widgets:** add, configure (parameters and refresh rate), move, resize and delete widgets. You can add the same widget several times with different parameters, and share a dashboard with another user.
- **Timer:** a server-side Timer fetches each widget at its own refresh rate and pushes the result over WebSocket. It skips widgets that no one is viewing.
- **Administration:** administrators can list, search, ban, promote and delete users.
- **Interface:** a responsive layout with keyboard navigation and accessible dialogs.

## Services and widgets

| Service | Requires | Widget | Shows | Parameters | Min. refresh |
|---|---|---|---|---|---|
| **weather** | nothing | `current_weather` | Current temperature and conditions | `city`, `units` | 5 min |
| | | `forecast` | Daily min/max and conditions | `city`, `days` (1–7) | 15 min |
| **github** | GitHub account | `recent_commits` | Latest commits on the default branch | `repo`, `number` (1–20) | 1 min |
| | | `pull_requests` | Pull requests by state | `repo`, `state` | 1 min |
| | | `security_alerts` | Open Dependabot alerts | `repo` | 5 min |
| **steam** | Steam account | `recently_played` | Games played in the last two weeks | `number` (1–10) | 10 min |
| | | `game_news` | Latest news for a game | `app_id`, `number` (1–10) | 15 min |
| **youtube** | Google account | `channel_stats` | Subscribers, views and videos | `channel_id` | 10 min |
| | | `latest_videos` | Recent uploads of a channel | `channel_id`, `number` (1–10) | 10 min |
| | | `trending_videos` | Most popular videos in a country | `region`, `number` (1–10) | 15 min |

Each refresh minimum keeps the app within the providers' free API quotas.

## Install, build and run

Requires [Docker](https://docs.docker.com/get-docker/) with Compose **2.24 or later**. With the Compose plugin, `docker compose` works the same as `docker-compose`.

```sh
git clone <repository-url> dashboard && cd dashboard
cp .env.example .env    # optional, see Configuration reference
docker-compose build
docker-compose up
```

| Container | Address | Role |
|---|---|---|
| `server` | http://localhost:8080 | Web app, REST API, WebSocket and `/about.json` |
| `mailpit` | http://localhost:8025 | Test mailbox that catches every email the app sends |
| `postgres`, `redis` | internal | Database and API response cache |

Database migrations run automatically when the server starts.

You don't need a `.env` file to run the app. Without one, the server generates `JWT_SECRET` and `TOKEN_ENC_KEY` for each run and logs a warning, so sessions and connected services are lost on restart. The GitHub, Google and Steam buttons stay disabled and show a "not configured" hint until their keys are set.

## Using the app

1. Open **http://localhost:8080** and **register** with an email and password.
2. Open **http://localhost:8025** (Mailpit), open the confirmation email, and click the link.
3. **Log in.** You land on your dashboard.
4. *(Optional)* Open **Services** and **connect** GitHub, Steam or YouTube. Weather works without this step.
5. Click **Add widget**. Pick a widget, fill in its settings (for example a city or `owner/repo`), choose a refresh rate, and confirm.
6. To move a widget, drag its title bar. To resize it, drag its corner. The widget's menu also offers **Configure**, keyboard-friendly **Move** and resize, and **Delete**.

If you set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, log in with that account to reach the **Admin** page.

## Production deployment

The production setup is the same Docker Compose stack. It runs the `server` image together with PostgreSQL and Redis, and you supply real secrets, a real SMTP relay and an HTTPS reverse proxy.

### 1. Prepare the host

- Linux host with Docker Engine and Compose 2.24 or later.
- A domain name, for example `dashboard.example.com`, pointing at the host.
- A reverse proxy that terminates TLS (Caddy, nginx or Traefik). It forwards traffic to `127.0.0.1:8080` and must pass WebSocket upgrades for `/socket.io/`.
- An SMTP account, for example from your mail provider, SendGrid, Mailgun or SES.

### 2. Get the code

```sh
git clone <repository-url> /opt/dashboard && cd /opt/dashboard
```

### 3. Create `.env`

```sh
cp .env.example .env
chmod 600 .env
```

Set at least these values:

```sh
APP_URL=https://dashboard.example.com           # public URL; https turns on Secure cookies
JWT_SECRET=<openssl rand -base64 48>            # keep it stable: changing it logs everyone out
TOKEN_ENC_KEY=<openssl rand -base64 32>         # exactly 32 bytes; changing it loses connected services
ADMIN_EMAIL=you@example.com                     # created as a confirmed admin on first start
ADMIN_PASSWORD=<strong password>

SMTP_HOST=smtp.example.com
SMTP_PORT=587                                   # 587 with STARTTLS, or 465 with SMTP_SECURE=true
SMTP_USER=<smtp user>
SMTP_PASS=<smtp password>
SMTP_SECURE=false
SMTP_FROM="Dashboard <no-reply@example.com>"
```

When `SMTP_USER` is set, the server requires a STARTTLS upgrade (or implicit TLS with `SMTP_SECURE=true`), so credentials are never sent in cleartext.

Optional services: in each provider's console, register the callback URL shown below. It must use the same `APP_URL`.

| Variables | Where | Callback URL |
|---|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | [GitHub OAuth App](https://github.com/settings/developers) | `${APP_URL}/api/oauth/github/callback` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | [Google Cloud credentials](https://console.cloud.google.com/apis/credentials), with YouTube Data API v3 enabled | `${APP_URL}/api/oauth/google/callback` |
| `STEAM_API_KEY` | [Steam Web API key](https://steamcommunity.com/dev/apikey) | — |

> In production, change the database password. Set `POSTGRES_PASSWORD` in `docker-compose.yml` and update `DATABASE_URL` in `.env` to match. Never commit `.env`.

### 4. Build and start

```sh
docker-compose build
docker-compose up -d server
```

Running `up -d server` starts `server` together with `postgres` and `redis`, but not Mailpit. Database migrations run automatically on every start. The port `8080:8080` mapping publishes the app on all interfaces. To make the app reachable only through the proxy, change the mapping to `127.0.0.1:8080:8080`.

### 5. Configure the reverse proxy

Here is a minimal Caddy example. It provisions HTTPS certificates and proxies WebSockets automatically:

```caddy
dashboard.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

With nginx, forward `Upgrade` and `Connection` headers for `/socket.io/`. The server does not trust `X-Forwarded-For`, so behind a proxy `/about.json` reports the proxy's address as `client.host`.

### 6. Verify

```sh
docker compose ps                              # server, postgres, redis are up and healthy
docker compose logs server | grep -i warn      # there must be no "generated one for this run" warning
curl -s https://dashboard.example.com/about.json | head -c 300
```

Then register an account, check that the confirmation email arrives, and log in with `ADMIN_EMAIL` to reach the **Admin** page.

### Operating

| Task | Command |
|---|---|
| Update to a new version | `git pull && docker-compose build && docker-compose up -d server` |
| Follow logs | `docker compose logs -f server` |
| Stop | `docker compose stop` |
| Back up the database | `docker compose exec -T postgres pg_dump -U dashboard dashboard > backup.sql` |
| Restore | `docker compose exec -T postgres psql -U dashboard dashboard < backup.sql` |

All data lives in the `postgres_data` volume. Redis only holds a cache, so it needs no backup. Running `docker compose down -v` **deletes** the database.

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:8080` | Public URL, used for email links, OAuth callbacks, CORS and Secure cookies |
| `DATABASE_URL` / `REDIS_URL` | compose services | PostgreSQL and Redis connection strings |
| `JWT_SECRET` | generated per run | Signs session tokens |
| `TOKEN_ENC_KEY` | generated per run | 32-byte base64 key that encrypts third-party tokens |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | `mailpit`, `1025` | Outgoing mail |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | empty | SMTP authentication and implicit TLS |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | empty | Bootstrap administrator |
| `GITHUB_*`, `GOOGLE_*`, `STEAM_API_KEY` | empty | Enable the matching login methods and services |

## `/about.json`

`GET /about.json` returns the client IP, the server time (Unix epoch), and every service with its widgets and their parameters:

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
| Backend | NestJS + Prisma | Each service is a module that registers its widgets, so `/about.json`, the catalog and input validation all come from one registry. Prisma provides a typed ORM and versioned migrations. |
| Frontend | React + Vite, Tailwind + shadcn/ui | Mature libraries for a draggable widget grid (`react-grid-layout`) and accessible dialogs (Radix), with fast responsive styling. |
| Database | PostgreSQL | Users, connections, dashboards and widgets are relational data. Widget settings are stored as JSONB. |
| Cache | Redis | Caches API responses per widget, settings and account, which keeps usage within free quotas without leaking data between users. |
| Auth | Passport.js, JWT in an httpOnly cookie, bcrypt, Nodemailer | Email and password login plus GitHub/Google OAuth. The same strategies are reused to connect services. |
| Timer / realtime | Server tick loop + Socket.IO | Each widget sends its refresh rate to the Timer, which fetches the data and pushes it to the browser. |
| Testing | Vitest, Supertest, Testcontainers | Unit tests, plus end-to-end tests against real Postgres and Redis. |

Rejected alternatives are listed in [docs/Architecture.md § 9](docs/Architecture.md#9-architecture-decisions).

## System structure

A single container on port 8080 serves the web app, the REST API (`/api/*`), the WebSocket (`/socket.io`) and `/about.json`.

```mermaid
flowchart LR
  B[Browser] -- "REST /api/* · WebSocket" --> S[server :8080<br/>NestJS + React build]
  S --> P[(PostgreSQL)]
  S --> R[(Redis cache)]
  S -- SMTP --> M[Mailpit or SMTP relay]
  S -- HTTPS --> U[Open-Meteo, GitHub,<br/>Steam, YouTube]
```

**How a widget refreshes:** the browser subscribes each visible widget over the WebSocket. When a widget is due according to its refresh rate, the Timer asks the widget's service for fresh data, caches the result in Redis, and pushes it to every browser that shows the widget.

```
shared/              TypeScript types shared by server and web
server/prisma/       database schema and migrations
server/src/          core (config, db, mail), auth, users, admin, connections,
                     catalog (/about.json), dashboards, timer, services/<name>/
web/src/             routes (pages), components, widgets (one view each), realtime, api
docs/                architecture (arc42) and testing strategy
```

To add a service, create `server/src/services/<name>/` with its widget definitions and register the module. Then add one view per widget in `web/src/widgets/`. `/about.json` and the add-widget dialog pick up the new widgets automatically.

For details, see [docs/Architecture.md](docs/Architecture.md) (arc42: API, runtime flows, data model, security, decisions) and [docs/Testing.md](docs/Testing.md).

## Development and tests

Requires Node.js 24 or later and Docker.

```sh
npm install
npm run dev:deps                    # postgres, redis and mailpit on localhost
export DATABASE_URL=postgresql://dashboard:dashboard@localhost:5432/dashboard
export REDIS_URL=redis://localhost:6379 SMTP_HOST=localhost
npm run db:deploy -w server         # apply migrations
npm run dev                         # server in watch mode
npm run dev:web                     # Vite dev server
```

| Command | Runs |
|---|---|
| `npm run build` | Build shared, web and server |
| `npm run lint` | Lint server and web |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests against Testcontainers (needs Docker) |
