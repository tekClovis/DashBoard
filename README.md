# Dashboard

A dashboard web app whose widgets (weather, GitHub, Steam, YouTube) are refreshed live by a server-side Timer.

## Install

Requires Node >= 24 and Docker.

```sh
npm install
cp .env.example .env   # fill JWT_SECRET and TOKEN_ENC_KEY (openssl rand -base64 32)
```

## Run

Full stack:

```sh
docker compose up --build
```

The app is on http://localhost:8080 and the Mailpit inbox on http://localhost:8025.

Development (dependencies in Docker, server and web on the host):

```sh
npm run dev:deps
# .env uses the compose hostnames; override them for processes on the host
export DATABASE_URL=postgresql://dashboard:dashboard@localhost:5432/dashboard
export REDIS_URL=redis://localhost:6379 SMTP_HOST=localhost
npm run db:deploy -w server
npm run dev       # server, watch mode
npm run dev:web   # Vite dev server
```

## Test

```sh
npm test                    # unit tests, server and web
npm run test:e2e            # server e2e against Testcontainers (needs Docker)
npm run test:cov -w server  # server coverage report
npm run lint
npm run build
```

## Docs

- [Architecture](docs/Architecture.md)
- [Testing](docs/Testing.md)
