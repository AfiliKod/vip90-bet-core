# Installation

There are two ways: **Docker with a single command** (recommended, fast) and **manual installation** (for those who don't want to use Docker). Both lead to the same result: a working VIP90.bet instance + a setup wizard that runs from the browser.

## Requirements

- Node.js 20 or higher (manual installation) **or** Docker + Docker Compose (Docker path)
- MongoDB 6 or higher (on your own server or a managed service like MongoDB Atlas) — in the Docker path, Compose provides this itself, no separate installation needed
- A VPS or server — **shared hosting is not sufficient**. Live betting streams, WebSocket connections, and MongoDB working together will run out of memory below 4 GB. Minimum recommended: 4 vCPU / 8 GB RAM.

## Path 1: Docker installation (recommended)

The repository root includes `docker-compose.yml`, `Dockerfile`, `deploy/Caddyfile`, and `.env.docker.example`. Three services run:

| Service | What it does | Exposed port |
|---|---|---|
| `mongo` | Database (image: `mongo:7`) | None — only within the compose network |
| `app` | Node/Express API + compiled client (uses the `Dockerfile` in this repo) | None — only within the compose network |
| `caddy` | Reverse proxy, automatic HTTPS (`caddy:2-alpine`) | 80, 443 |

Traffic flow: internet → Caddy (80/443) → `app:3001` → `mongo`. Mongo and app do not expose any ports; only Caddy is published.

### Steps

```bash
cp .env.docker.example .env
```

Open the `.env` file and fill it in:

- `DOMAIN` — your real domain where Caddy will obtain a certificate. If left empty/default, `localhost` is accepted and Caddy opens with a self-signed certificate (on the first day it doesn't require a certificate for testing; on a real domain this line doesn't apply, Let's Encrypt runs automatically).
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — generate with `openssl rand -base64 64`.
- `CLIENT_URL` — the public address accessible from the browser (`https://DOMAIN`).
- Casino/SMTP/optional sections — fill in if you will use them, otherwise leave empty.

> **Do NOT write `MONGODB_URI` in this file** — `docker-compose.yml` automatically routes it to the `mongo` service within compose (`mongodb://mongo:27017/betzone`); any value you write in `.env` will be overridden in the app container.

```bash
docker compose up -d
```

On first startup, the `app` image is built (including client build + server dependencies + Playwright Chromium installation — may take a few minutes), `app` starts after `mongo` passes its health check.

### Setup wizard

While the containers are running, open `https://DOMAIN/install` (or `https://localhost/install` for testing) in a browser. The wizard:

1. Checks database connectivity and "already installed" status via `/install/api/status` (if installed, it doesn't show the form).
2. Asks for site name, currency, and the first admin username/email/password.
3. On submission, creates the first `admin` role user (the password is hashed with bcrypt via the real `User` model's pre-save hook), and writes the site name and currency to the `Setting` collection.
4. Generates a copyable `.env` output on screen (including random JWT keys) — you are asked to save this to `server/.env` on the server and restart the application.

Source: `installer/core.js`, `installer/page.js`, `server/src/routes/install.js` (mounted under `/install` in `app.js`).

> **Important:** The wizard only runs when **no admin user exists yet**. If an admin already exists, `/install` shows a "system already installed" message and doesn't display the form — to run it again, you must first remove the existing admin record.

## Path 2: Manual installation (without Docker)

### 1. Install dependencies

```bash
npm run install:all
```

This command installs all dependencies in the root, `server/`, and `client/` directories sequentially (`npm i && npm i --prefix server && npm i --prefix client`).

### 2. Set environment variables

Copy `server/.env.example` to `server/.env` and fill in your own values. See [02 — Configuration](02-yapilandirma.md) for what each variable does. At a minimum, the following are **required** — the server won't start without them:

- `MONGODB_URI`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (random, at least 64 characters — you can generate with `openssl rand -base64 64`)
- `CLIENT_URL` (your own domain)

### 3. Build and start

```bash
npm run build   # installs client dependencies + compiles the client
npm start       # runs the build again + starts server/src/server.js
```

`npm start` is actually `npm run build && node server/src/server.js` — so you don't need to run `npm run build` separately; `npm start` builds and starts in one step.

In production, running with a process manager (systemd, pm2) ensures the application comes back up if the server restarts. This repo does not include a systemd example — you need to set it up for your own server environment.

### 4. Open the setup wizard

Go to `http://your-server-address:3001/install` (or `CLIENT_URL`) and follow the "Setup wizard" steps from the Docker path — the mechanism is identical, not Docker-specific.

### 5. Verify with tests

```bash
npm test
```

This runs the unit tests under `server/test/*.test.js` and `client/src/i18n/*.test.js`. All should pass — if they don't, one of the setup steps is incomplete/wrong; do not go to production without passing tests. (Playwright end-to-end tests are also available with `npm run test:e2e`, Chromium must be installed first with `npm run test:e2e:install`.)

## Running in development mode

If you want to run with live reload instead of a production build:

```bash
npm run dev
```

This starts the client (Vite, `localhost:5173`) and server (`localhost:3001`) simultaneously (using `concurrently`).

## Post-installation verification

### Health check

```bash
node server/scripts/healthcheck.js
```

Reports: MongoDB connection, whether required env variables are defined/adequate length (`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`), whether optional services (Igames casino, SMTP) are configured, pending migration count, and whether site settings are seeded. Exit code 0 means healthy (also returns 0 if only warnings), returns 1 on failure — can be used with CI or monitoring tools. The Docker image's own `HEALTHCHECK` directive checks `GET /api/health` every 30 seconds (`Dockerfile`).

Source: `server/scripts/healthcheck.js`, `server/src/health/checks.js`.

### Migrations

```bash
node server/scripts/migrate.js              # applies all pending
node server/scripts/migrate.js --to 0.3.0   # up to a specific version
```

These are idempotent — re-running is safe, already applied migrations are skipped. `healthcheck.js` shows pending migrations as warnings.

### Seeding

```bash
node server/scripts/seed.js
```

If site settings (`Setting` collection) have never been written, `healthcheck.js` shows this as a warning and recommends this command. If you've already run through the setup wizard (`/install`), this step was done automatically — no need to run it again.

## Common installation issues

- **"Cannot connect to MongoDB"** — check that `MONGODB_URI` is correct and that you've added the IP of the server you're installing from to the allowed IP list of your MongoDB server. `node server/scripts/healthcheck.js` shows this on the first line.
- **Crashes with "JWT_SECRET undefined" error** — make sure the `.env` file is in the `server/` directory (manual installation) or in the root `.env` that Compose reads as `env_file` (Docker), and that no required fields are left empty.
- **`/install` says "system already installed" but I forgot my admin password** — the wizard won't re-run for security reasons while an `admin` role user exists; use the password reset flow (in-app "forgot my password") or direct database access.
- **Casino games can't fetch odds** — this is related to the casino content provider (aggregator) configuration, not the installation. See [02 — Configuration § Casino provider](02-yapilandirma.md).