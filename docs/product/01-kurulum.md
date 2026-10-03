# Installation

There are two ways: **Docker with a single command** (recommended, fast) and **manual installation** (for those who don't want to use Docker). Both lead to the same result: a working VIP90.bet **core platform** (accounts, wallet, bonuses, KYC, risk, admin panel) + a setup wizard that runs from the browser.

The separately sold add-ons (**In-house Games**, **Sports Betting**, **Casino Content**) are installed on top of this core — see [Add-on modules](#add-on-modules-in-house-games-sports-betting-casino-content) at the end of this document. The core opens and works without them.

## Requirements

- Node.js 22 (manual installation; the Docker image uses `node:22-slim`; the repository has no `engines` field, so older versions are not enforced but also not tested) **or** Docker + Docker Compose (Docker path)
- MongoDB 7 (on your own server or a managed service like MongoDB Atlas) — in the Docker path, Compose provides this itself, no separate installation needed. **It must run as a replica set** (a single-node replica set is enough; Atlas already is one): bet settlement, bank/crypto approvals and agent transfers use multi-document transactions, which a standalone `mongod` rejects. Compose starts `mongo:7` with `--replSet rs0` and initiates it automatically.
- A VPS or server — **shared hosting is not sufficient**. Live betting streams, WebSocket connections, and MongoDB working together will run out of memory below 4 GB. Minimum recommended: 4 vCPU / 8 GB RAM.

## Path 1: Docker installation (recommended)

The repository root includes `docker-compose.yml`, `Dockerfile`, `deploy/Caddyfile`, and `.env.docker.example`. Three services run:

| Service | What it does | Exposed port |
|---|---|---|
| `mongo` | Database (image: `mongo:7`) | None — only within the compose network |
| `app` | Node/Express API + compiled client (uses the `Dockerfile` in this repo, `target: production`) | None — only within the compose network |
| `caddy` | Reverse proxy, automatic HTTPS (`caddy:2-alpine`) | 80, 443 |

Traffic flow: internet → Caddy (80/443) → `app:3001` → `mongo`. Mongo and app do not expose any ports; only Caddy is published.

**Compose contains only these three services.** The in-house games front end (`game-host`) and the sports odds service (`odds-provider`) are separate Node applications and are **not** part of `docker-compose.yml` — see [Add-on modules](#add-on-modules-in-house-games-sports-betting-casino-content). Shortcuts: `npm run docker:up` (= `docker compose up -d --build`), `npm run docker:down`, `npm run docker:test` (runs the test suite in a container).

### Steps

```bash
cp .env.docker.example .env
```

Open the `.env` file and fill it in:

- `DOMAIN` — your real domain where Caddy will obtain a certificate (Let's Encrypt, automatic). If left empty/default, `localhost` is used and Caddy serves an internal self-signed certificate, so the stack works for local testing without a real domain (`deploy/Caddyfile`).
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — generate with `openssl rand -base64 64`.
- `CLIENT_URL` — the public address accessible from the browser (`https://DOMAIN`).
- SMTP and the optional sections — fill in if you will use them, otherwise leave empty. SMTP can also be entered later from the panel (Settings → General → Email, stored encrypted; see [02 — Configuration](02-yapilandirma.md)).
- `.env.docker.example` only covers the core variables. The add-on variables (`GAME_HOST_*`, `PROVIDER_SESSION_SECRET`, `INHOUSE_PROVIDER_*`, `OPERATOR_SECRET_ENCRYPTION_KEY`, `ODDS_PROVIDER_*`) are listed in `server/.env.example` — copy the ones you need into `.env` when installing an add-on. Variables for Slikair, crypto (`CRYPTO_SEED_PHRASE`, `HOT_WALLET_PRIVATE_KEY`) and others are also only in `server/.env.example` / [02 — Configuration](02-yapilandirma.md).

> **Do NOT write `MONGODB_URI` in this file** — `docker-compose.yml` automatically routes it to the `mongo` service within compose (`mongodb://mongo:27017/betzone`); any value you write in `.env` will be overridden in the app container.

```bash
docker compose up -d
```

On first startup, the `app` image is built (including client build + server dependencies + Playwright Chromium installation — may take a few minutes), `app` starts after `mongo` passes its health check. The image contains `server/src`, the compiled client, the installer, and `docs/product/` + `CHANGELOG.md` (the support chatbot reads those at runtime, see [02 — Configuration § AI support assistant](02-yapilandirma.md); the rest of `docs/` is not copied).

### Setup wizard

While the containers are running, open `https://DOMAIN/install` (or `https://localhost/install` for testing) in a browser. The wizard:

1. Checks database connectivity and "already installed" status via `/install/api/status` (`needsInstall: false` once an admin exists).
2. Asks for site name, currency (TRY/USD/EUR), the first admin username (3-30 characters) / email / password (min 8 characters), the install type (Docker, or non-Docker with your own MongoDB URI — a replica set), and — optionally — whether the Crypto Payment and KYC modules should start **enabled** (default: disabled).
3. On submission, creates the first `admin` role user (the password is hashed with bcrypt via the real `User` model's pre-save hook), and writes the site name (`branding.siteName`; `site.name` is also written, health checks use it as a "seeded" marker), currency (`currency.code`), `setup.completed` and any selected modules (`module.<id>.enabled`) to the `Setting` collection — the same keys the admin panel edits. Unselected modules get no record (no record = disabled).
4. Generates a copyable `.env` output on screen (including random JWT keys; `MONGODB_URI` is the compose URI `mongodb://mongo:27017/betzone?replicaSet=rs0` for Docker, or your own URI otherwise) — for a manual installation you are asked to save this to `server/.env` on the server and restart the application. On the Docker path the values are already in the root `.env`, nothing to save.

Source: `installer/core.js`, `installer/page.js`, `server/src/routes/install.js` (mounted under `/install` in `app.js`).

5. **Switch on the modules you use.** Every module except Slikair starts disabled unless you ticked it in the wizard: log in as the admin you just created and enable *Crypto Payment Gateway*, *KYC Identity Verification* and any installed add-on under **Settings → Modules** (`/admin/platform?tab=modules`); until then the matching routes answer `503 MODULE_DISABLED` (see [03 — Module System](03-modul-sistemi.md)).

> **Important:** The wizard only runs when **no admin user exists yet**. If an admin already exists, `GET /install` answers `404` (the form is not shown; `/install/api/status` still answers and reports `needsInstall: false`) and `POST /install/api/run` answers `409 ALREADY_INSTALLED` — to run it again, you must first remove the existing admin record.

## Path 2: Manual installation (without Docker)

### 1. Install dependencies

```bash
npm run install:all
```

The script is `npm i && npm i --prefix server && npm i --prefix client` followed by `game-host` and `odds-provider` installs routed through `scripts/optional-run.mjs`: those two directories are symlinks into the add-on submodules (`server/src/premium/...`), and when the add-ons are not installed the step prints a warning and is skipped (exit 0) instead of failing. `npm run dev` / `dev:games` / `build:game-host` skip missing add-ons the same way. The three core commands are:

```bash
npm i && npm i --prefix server && npm i --prefix client
```

### 2. Set environment variables

Copy `server/.env.example` to `server/.env` and fill in your own values. See [02 — Configuration](02-yapilandirma.md) for what each variable does. At a minimum, the following are **required** — the server won't start without them:

- `MONGODB_URI`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (random, at least 64 characters — you can generate with `openssl rand -base64 64`; `healthcheck.js` fails below 32 characters)
- `CLIENT_URL` (your own domain)

If you use a local/self-managed MongoDB, start it as a replica set and append `?replicaSet=<name>` to `MONGODB_URI` (see Requirements).

### 3. Build and start

```bash
npm run build   # installs client dependencies + compiles the client
npm start       # runs the build again + starts server/src/server.js
```

`npm start` is actually `npm run build && node server/src/server.js` — so you don't need to run `npm run build` separately; `npm start` builds and starts in one step.

In production, running with a process manager (systemd, pm2) ensures the application comes back up if the server restarts. This repo does not include a systemd example — you need to set it up for your own server environment.

### 4. Open the setup wizard

Go to `http://your-server-address:3001/install` (or `CLIENT_URL`) and follow the "Setup wizard" steps from the Docker path — the mechanism is identical, not Docker-specific. (The server needs a reachable MongoDB and `JWT_SECRET` to be useful; the wizard itself only needs the database.)

### 5. Verify with tests

```bash
npm test
```

This runs the unit tests under `server/test/*.test.js`, `client/src/i18n/*.test.js` and `client/src/pages/admin/dashboard/*.test.js`. All should pass — if they don't, one of the setup steps is incomplete/wrong; do not go to production without passing tests. (Playwright end-to-end tests are also available with `npm run test:e2e`, Chromium must be installed first with `npm run test:e2e:install`.)

## Running in development mode

If you want to run with live reload instead of a production build:

```bash
npm run dev
```

This starts the client (Vite, `localhost:5173`), the server (`localhost:3001`) and the odds-provider add-on app (`odds-provider`) simultaneously (using `concurrently`). Without the Sports Betting add-on the third process fails to start; run the first two separately with `npm run dev --prefix server` and `npm run dev --prefix client`. `npm run dev:games` additionally starts `game-host` (in-house games front end, `localhost:5174`).

## Post-installation verification

### Health check

```bash
node server/scripts/healthcheck.js
```

Reports: MongoDB connection, whether required env variables are defined/adequate length (`MONGODB_URI`, `CLIENT_URL`; `JWT_SECRET`/`JWT_REFRESH_SECRET` at least 32 characters), whether optional services (casino content via `PALACE_API_TOKEN` or the panel credentials, SMTP via `SMTP_HOST`) are configured, pending migration count, and whether site settings are seeded (`site.name`). The env value is checked first; when it is empty and the database is connected, the SMTP and Igames checks also accept credentials saved from the admin panel. Exit code 0 means healthy (also returns 0 if only warnings), returns 1 on failure — can be used with CI or monitoring tools. The Docker image's own `HEALTHCHECK` directive checks `GET /api/health` every 30 seconds (`Dockerfile`).

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

(`--admin` additionally creates an admin from `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` environment variables; without it only default site settings are seeded and no user is created.)

If site settings (`Setting` collection) have never been written, `healthcheck.js` shows this as a warning and recommends this command. If you've already run through the setup wizard (`/install`), this step was done automatically — no need to run it again.

## Common installation issues

- **"Cannot connect to MongoDB"** — check that `MONGODB_URI` is correct and that you've added the IP of the server you're installing from to the allowed IP list of your MongoDB server. `node server/scripts/healthcheck.js` shows this on the first line.
- **Crashes with "JWT_SECRET undefined" error** — make sure the `.env` file is in the `server/` directory (manual installation) or in the root `.env` that Compose reads as `env_file` (Docker), and that no required fields are left empty.
- **`/install` says "system already installed" but I forgot my admin password** — the wizard won't re-run for security reasons while an `admin` role user exists; use the password reset flow (in-app "forgot my password") or direct database access.
- **Casino games don't load / `503 MODULE_NOT_INSTALLED` on `/api/igames`** — the Casino Content add-on is not installed in this deployment (see [Add-on modules](#add-on-modules-in-house-games-sports-betting-casino-content)); if it is installed and you get `503 Igames Casino API henüz yapılandırılmadı`, the provider token is missing (see [02 — Configuration § Casino provider](02-yapilandirma.md)).
- **`503 MODULE_NOT_INSTALLED` on `/api/provider/v1` or `/api/inhouse-provider`** — the In-house Games add-on is not installed (no error is logged, the optional import fails silently). If it is installed, check the server log for `[config] Eksik ortam değişkeni: GAME_HOST_URL|GAME_HOST_SECRET|PROVIDER_SESSION_SECRET`.
- **Mongo error `Transaction numbers are only allowed on a replica set member or mongos`** — MongoDB runs as a standalone instance; run it as a replica set (see Requirements).

## Add-on modules (In-house Games, Sports Betting, Casino Content)

The core platform is the base product. **In-house Games (13 games), Sports Betting and Casino Content are separate paid add-ons.** In the code they live in three **private git submodules** under `server/src/premium/` (see `.gitmodules`):

| Add-on | Submodule path | Repository | What it contains |
|---|---|---|---|
| In-house Games | `server/src/premium/inhouse-provider` | `AfiliKod/vip90-bet-inhouse` | game engine + math (runs inside the main Node process), `game-host/` (separate React/Vite front end) |
| Sports Betting | `server/src/premium/betting` | `AfiliKod/vip90-bet-betting` | settlement, odds sync jobs, odds provider adapters, `odds-provider/` (separate Node app) |
| Casino Content | `server/src/premium/igames` | `AfiliKod/vip90-bet-igames` | casino content aggregator integration, callback, session reconciliation |

`/game-host` and `/odds-provider` at the repository root are symlinks to `server/src/premium/inhouse-provider/game-host` and `server/src/premium/betting/odds-provider`. **Live Casino (real dealer tables) is a planned future update; there is no code for it in this release.**

### How the core behaves without an add-on

`server/src/app.js` and `server/src/server.js` import the add-ons dynamically and tolerate their absence: the server starts, and `/api/igames`, `/api/provider/v1` and `/api/inhouse-provider` answer `503 MODULE_NOT_INSTALLED`. On top of that each module has an on/off switch and a licence gate (see [03 — Module System](03-modul-sistemi.md)).

### Getting the add-on code

The three repositories are private. How a buyer receives access (repository invitation, archive, token) is a sales/support matter — **not documented in the code; unverified.** Once you have access, in a git clone:

```bash
git submodule update --init --recursive      # fetches the three add-ons
```

(The deploy workflow pulls the add-on submodules when the `SUBMODULE_PAT` secret is set (it is defined as of 2026-10-03), so add-on code ships with the deploy; if the secret is missing the add-ons already on the server are left untouched and the run prints a warning — see [Deployment](../RUNBOOK.md#deployment-production). `game-host` and `odds-provider` are still outside the deploy.)

### In-house Games

1. **Engine** — nothing to start: it is loaded into the main server process once the submodule is present. Set these in `.env` (all in `server/.env.example`):
   - `GAME_HOST_URL` — public address of the game-host front end (comma-separated list allowed); also added to the server's CORS list.
   - `GAME_HOST_SECRET` — signs the 60-second launch token. Must differ from `JWT_SECRET`.
   - `PROVIDER_SESSION_SECRET` — signs the ~15-minute game session token; a third, different secret.
   - `OPERATOR_SECRET_ENCRYPTION_KEY` — 64 hex characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); encrypts the operator API secret.
   - `INHOUSE_PROVIDER_API_BASE`, `INHOUSE_PROVIDER_API_KEY_ID`, `INHOUSE_PROVIDER_API_SECRET` — filled with the output of step 2.
   The server logs `[config] Eksik ortam değişkeni: ...` at start if `GAME_HOST_URL`, `GAME_HOST_SECRET` or `PROVIDER_SESSION_SECRET` is missing.
2. **Create "Operator #1"** (this site as its own provider tenant), from `server/`:
   ```bash
   node src/scripts/migrations/create-operator-one.mjs
   ```
   It prints `INHOUSE_PROVIDER_API_BASE/KEY_ID/SECRET` **once** (the secret is not shown again) — paste them into `.env`. On an installation that already had in-house games before the multi-operator architecture, run `node src/scripts/migrations/add-operator-to-game-settings.mjs` afterwards.
3. **Build and host the game front end** (`game-host`, a separate Vite app, **not built by `npm run build` or by the Docker image or by the deploy workflow**):
   ```bash
   cp server/src/premium/inhouse-provider/game-host/.env.example server/src/premium/inhouse-provider/game-host/.env
   # VITE_API_BASE_URL (must include /api), VITE_SOCKET_BASE_URL, VITE_MAIN_APP_URL — baked in at build time
   npm run build:game-host          # output: game-host/dist
   ```
   Serve `dist/` as static files on its own origin (the add-on's own docs use a `games.` sub-domain with its own vhost/certificate) and set `GAME_HOST_URL` to that origin. For local development: `npm run dev:games` (port 5174).
4. Enable the module under **Settings → Modules** (card *In-house Games*). Per-game settings are under **Products → In-house Games** (`/admin/game-settings`).

*Not verified here:* the exact hosting layout of the front end in production (the code only requires a reachable origin) and whether the `walletCallbackUrl` / `allowedIPs` values written by `create-operator-one.mjs` (`http://localhost:<PORT>/...`, `127.0.0.1`) suit a Docker deployment — inside the `app` container `localhost` is the app itself, so it should; **unverified**.

### Sports Betting

1. **Odds provider** — a separate Node app (`server/src/premium/betting/odds-provider`), **not in Compose and not updated by the deploy workflow**:
   ```bash
   npm install --prefix server/src/premium/betting/odds-provider
   cp server/src/premium/betting/odds-provider/.env.example server/src/premium/betting/odds-provider/.env
   npm start --prefix odds-provider       # or: node server.js
   ```
   Its `.env` needs `PORT` (default **3002**; keep it in sync with `ODDS_PROVIDER_API_BASE` on the main server), `ODDS_PROVIDER_API_TOKEN`, `ODDS_PROVIDER_MANAGEMENT_SECRET` and the data source settings documented in the Sports Betting add-on's own README. In production run it as its own long-running service (e.g. a separate systemd unit); the main deploy does not update or restart it.
2. **Main server `.env`**: `ODDS_PROVIDER_API_BASE` (e.g. `http://localhost:3003`), `ODDS_PROVIDER_API_TOKEN` (same value as the provider's), `ODDS_PROVIDER_MANAGEMENT_SECRET` (same value as the provider's; a separate secret that only protects token rotation). Changing the URL/port needs a restart of **both** processes. In a Docker deployment `localhost` points at the container itself — use an address the container can reach (for example the host's address); **unverified, not tested here**.
3. Enable the module under **Settings → Modules** (card *Sports & Live Betting*; the token can be rotated there, which pushes it to the odds provider without a restart). Sports categories are managed under **Products → Sportsbook → Categories**.
4. Data source: the provider reads a third-party odds source you must contract yourself; `ODDS_PROVIDER=theoddsapi` + `ODDS_API_KEY`/`ODDS_API_SPORT` — odds come only from the odds-provider service described above; there is no other odds source or third-party odds API adapter in the code (see [02 — Configuration § Odds source](02-yapilandirma.md)).

### Casino Content

1. Obtain provider credentials from your casino content aggregator: API token, API base, callback token.
2. Enter them either in `.env` (`PALACE_API_BASE`, `PALACE_API_TOKEN`, `PALACE_CALLBACK_TOKEN`) or from **Settings → Modules** (card *Casino Content*, stored encrypted; needs `OPERATOR_SECRET_ENCRYPTION_KEY`). Today the `/api/igames` routes only check the **environment** token (see [09 — Known Limitations](09-bilinen-kisitlar.md)), so set `PALACE_API_TOKEN` in `.env` as well.
3. Give the provider your callback URL `https://DOMAIN/api/igames/callback`; requests carry the `callback-token` header.
4. Enable the module under **Settings → Modules**. Provider-side settings (popular games, bonus & freerounds) are under **Products → Casino Provider** (`/admin/igames`).
