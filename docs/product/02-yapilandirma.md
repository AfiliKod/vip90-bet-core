# Configuration

There are two layers: **`.env` file** (requires restart, server setup) and **panel-managed settings** (effective immediately, operator's daily work — stored in the database).

Some integration credentials exist in both layers: the value saved from the admin panel (encrypted in the database) wins, an empty panel value falls back to the environment variable. **Saving a secret field from the panel requires `OPERATOR_SECRET_ENCRYPTION_KEY`** (64 hex characters) in `.env`; without it the save fails.

## `.env` variables

Description of the keys in `server/.env.example`, checked against the code that reads them. Example files contain a few variables the code does **not** read; those are marked below (and the root `.env.example` is an older file that additionally lists variables that no longer exist, such as the rate-limit tunables). In the Docker path the file is the root `.env` (see `.env.docker.example`), not `server/.env`.

### Database

| Variable | Required | What it does |
|---|---|---|
| `MONGODB_URI` | Yes | Database connection address. Must point to a **replica set** (multi-document transactions are used). In Docker it is set by `docker-compose.yml` (`mongodb://mongo:27017/betzone?replicaSet=rs0`) and overrides any value in `.env` |
| `MONGO_MAX_POOL_SIZE` / `MONGO_MIN_POOL_SIZE` | No | Connection pool settings, default (20/5) is sufficient for most setups |

### Server / session

| Variable | Required | What it does |
|---|---|---|
| `PORT` | No (default 3001) | Port the API server listens on |
| `NODE_ENV` | Yes (`production`) | Development/production behavior difference (rate limit, cookie security, etc.) |
| `CLIENT_URL` | Yes | Your own domain — used in CORS and email links. A comma-separated list is accepted for CORS |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Yes | Session token signing keys — must be changed before going to production (`openssl rand -base64 64`; `healthcheck.js` requires at least 32 characters) |
| `EMAIL_VERIFICATION_CUTOFF` | No (not in `server/.env.example`, only in the root `.env.example`) | ISO 8601 date — users who registered before this date are exempt from email verification (grandfathering). If empty, the code default `2026-07-14T00:00:00Z` applies |

### Rate limiting

There are **no environment variables** for rate limiting. The limits are constants in `server/src/middleware/rateLimit.js` (global 1200 requests / 15 min per IP, stricter limits for registration, login, e-mail flows, financial endpoints, spin, admin 2FA). `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX` and `FINANCIAL_RATE_LIMIT_MAX` that appear in the root `.env.example` are not read by any code. The full table is in [05 — API Reference § Rate limiting](05-api-referansi.md). Changing a limit means editing the file.

### Casino provider (Igames) — Casino Content add-on

| Variable | Required | What it does |
|---|---|---|
| `PALACE_API_BASE` / `PALACE_API_TOKEN` / `PALACE_CALLBACK_TOKEN` | If the Casino Content add-on will be used | Casino content provider access credentials (the `PALACE_*` variable names are historical identifiers in the code). They can also be entered from **Settings → Modules → Casino Content** (stored encrypted, panel wins over `.env`); the `/api/igames` routes accept a token saved in the panel as well (fixed 2026-10-03) |

The code lives in the paid add-on `server/src/premium/igames`; without it the variables do nothing. See [01 — Installation § Add-on modules](01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content).

### In-house games — In-house Games add-on

| Variable | Required | What it does |
|---|---|---|
| `GAME_HOST_URL` | If the add-on is installed | Public origin of the separate `game-host` front end (comma-separated list allowed); added to CORS |
| `GAME_HOST_SECRET` | If the add-on is installed | Signs the 60-second launch token; must differ from `JWT_SECRET` |
| `PROVIDER_SESSION_SECRET` | If the add-on is installed | Signs the ~15-minute game session token; a third, different secret |
| `INHOUSE_PROVIDER_API_BASE` / `INHOUSE_PROVIDER_API_KEY_ID` / `INHOUSE_PROVIDER_API_SECRET` | If the add-on is installed | Output of `node src/scripts/migrations/create-operator-one.mjs`; after a key rotation from the panel the encrypted value in the database is used instead |
| `OPERATOR_SECRET_ENCRYPTION_KEY` | Yes for any secret saved from the panel | AES-256-GCM key, 64 hex characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `OPERATOR_ORIGIN_CACHE_TTL_MS` / `WALLET_CALLBACK_MAX_RETRY_ATTEMPTS` / `WALLET_CALLBACK_RETRY_BASE_MS` | No | Tuning values in `server/.env.example` (defaults 30000 / 10 / 5000) |

If the add-on is installed and one of `GAME_HOST_URL`, `GAME_HOST_SECRET`, `PROVIDER_SESSION_SECRET` is missing, the server logs `[config] Eksik ortam değişkeni: ...` at start and the games may fail at runtime.

### Payment / crypto

| Variable | Required | What it does |
|---|---|---|
| `CRYPTO_SEED_PHRASE` | If crypto payment will be used | HD wallet mnemonic: per-user deposit addresses (and the hot wallet at index 0) are derived from it. **Not in `server/.env.example`.** Without it `GET /api/crypto/deposit-address` and `POST /api/crypto/check-deposit` answer `503` |
| `HOT_WALLET_PRIVATE_KEY` | No | If set, used as the hot wallet signer for withdrawals instead of deriving it from the seed phrase. Not in `server/.env.example` |
| `TRON_NETWORK` | No (default `mainnet`) | `mainnet`, `shasta` or `nile`. Not in `server/.env.example` |
| `USDT_TRY_RATE` | If crypto payment will be used | USDT→TRY fixed rate (market price is not fetched automatically, updated manually). Code default is `1` if unset; the example file uses `35` |
| `TRONGRID_API_KEY` | — | Listed in the example files but **not read by any code** (`cryptoService.js` calls TronGrid without a key); setting it has no effect |

Auto-credit/auto-withdraw thresholds (defaults: 100 USDT / 15 USDT) and the network can be changed from **Settings → Modules → Crypto Payment Gateway** (`PUT /admin/crypto/settings`).

### Slikair payment gateway

| Variable | Required | What it does |
|---|---|---|
| `SLIKAIR_MERCHANT_ID` / `SLIKAIR_MERCHANT_TOKEN` / `SLIKAIR_SITE_ID` / `SLIKAIR_BASE_URL` / `SLIKAIR_WEBHOOK_SECRET` | If Slikair will be used | Merchant credentials (sandbox base URL by default). Can be entered from **Settings → Modules → Slikair Payment Gateway** (stored encrypted, panel wins). The webhook secret is not used for signature verification, see [09](09-bilinen-kisitlar.md) |
| `API_BASE_URL` | No | Public URL that is sent to Slikair as the webhook target; empty means `CLIENT_URL` |

### AI support assistant

| Variable | Required | What it does |
|---|---|---|
| `AI_HELP_BASE_URL` | No (default OpenRouter) | The LLM API address the support chatbot talks to |
| `AI_HELP_API_KEY` | No | If empty, chatbot returns "currently under maintenance, open a ticket" — doesn't crash |
| `AI_HELP_MODEL` | No (code default `meta-llama/llama-3.1-8b-instruct:free`; `server/.env.example` suggests `anthropic/claude-3-haiku`) | Model ID to use |

This trio powers a real document-based chatbot that reads and parses `docs/product/*.md` and `CHANGELOG.md` — see [06 — FAQ](06-sss.md). Note: the Docker image does **not** copy `docs/` or `CHANGELOG.md`, so in the Docker path the knowledge base is empty (the server logs `[Chatbot] Failed to read docs/product/`) unless you add them to the image.

### Email

| Variable | Required | What it does |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` (default 587) / `SMTP_SECURE` (default false) / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Yes (here or in the panel) | For email verification and password reset emails. Can be entered from **Settings → General → Email (SMTP)** (password stored encrypted, empty panel fields fall back to these variables; the card has a test-mail button) |

### Monitoring / alerts

| Variable | Required | What it does |
|---|---|---|
| `SENTRY_DSN` | No (recommended) | Error tracking |
| `ALERT_WEBHOOK_URL` | No (recommended) | Operational alerts (e.g., Slack webhook). Can also be set in **Settings → General → Alert Channels**, which wins over the variable |

### Security / bot protection

| Variable | Required | What it does |
|---|---|---|
| `TURNSTILE_SECRET_KEY` (old name `TURNSTILE_SECRET` still accepted) / `TURNSTILE_SITE_KEY` / `DISABLE_TURNSTILE` | — | Cloudflare Turnstile bot protection, **off by default**. It turns on when **both** the secret and the site key are set (`DISABLE_TURNSTILE=true` forces it off). Then `POST /api/auth/register`, `/login` and `/forgot-password` require a valid `turnstileToken` (`400 TURNSTILE_REQUIRED` / `TURNSTILE_FAILED`), and the login/register and forgot-password pages render the widget (`GET /api/auth/turnstile-config` hands the site key to the client). If Cloudflare is unreachable, verification fails open (rate limits still apply). Source: `server/src/middleware/turnstile.js` |
| `ADMIN_ALLOWED_IPS` | — | Comma-separated IPs/CIDRs (IPv4 and IPv6). **Off by default**; when set, `/api/admin/*` answers `403 ADMIN_IP_NOT_ALLOWED` to any other address (a list with no valid entry fails closed). The client IP is `req.ip` (`trust proxy` 1); `CF-Connecting-IP` is only honoured with `ADMIN_IP_TRUST_CF_HEADER=true`. Behind Cloudflare plus another proxy (e.g. nginx) `req.ip` may be the edge address: configure real-IP handling at the proxy, or enable the header flag only if the origin accepts traffic from Cloudflare alone — **verify on your own deployment**. Scope: only `/api/admin/*` (the login endpoint `/api/auth/login` and `/api/auth/2fa` are outside it). Source: `server/src/middleware/adminIpAllowlist.js` |
| `LEGAL_VERSION` | — | Not an environment variable: the terms version label is the constant `LEGAL_VERSION = '1.0.0'` in `client/src/data/legalContent.js` |

### Social login

| Variable | Required | What it does |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | If Google login will be used | OAuth 2.0 client created in Google Cloud Console |
| `TELEGRAM_LOGIN_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | If Telegram login will be used | Bot for the Login Widget — must be **different** from the admin notification bot (configured in the panel), must be registered with the production domain via `/setdomain` in BotFather |

There is no separate env variable for Web3 wallet login (MetaMask, etc.) — signature verification is done server-side (`ethers`), no external identity information is required.

### License (optional module control)

| Variable | Required | What it does |
|---|---|---|
| `LICENSE_SERVER_URL` / `LICENSE_KEY` | No | If defined, module enabled/disabled status is also verified against a central license server. **If not defined, the product runs in "unmanaged" mode: all defined modules are considered licensed** — this is a deliberate default so the product works out of the box |

These two variables are **not** in `server/.env.example` — they are read directly from `process.env` in `server/src/services/licensing/index.js`. If you don't have a license server, you don't need to touch them. The Slikair payment module is exempt from the license check (`licenseExempt`): only its panel switch decides.

### Odds (sports betting) — Sports Betting add-on

The odds data comes from a separate application (`odds-provider`, part of the Sports Betting add-on, not in Docker Compose). The main server only needs to know how to reach it:

| Variable | Required | What it does |
|---|---|---|
| `ODDS_PROVIDER_API_BASE` | If the add-on is installed | Address of the odds-provider app, e.g. `http://localhost:3003` (the app's own code default port is 3002 — keep both sides identical) |
| `ODDS_PROVIDER_API_TOKEN` | If the add-on is installed | Bearer token shared with the odds-provider. After the first start it can be rotated from **Settings → Modules → Sports & Live Betting** (stored encrypted; pushed to the provider without a restart) |
| `ODDS_PROVIDER_MANAGEMENT_SECRET` | If the add-on is installed | A **separate** secret that only protects the token-rotation push; must equal the same-named variable in the odds-provider's `.env` |

The odds feed's data source settings are read by the **odds-provider app from its own `.env`**, not by the main server; they are documented in the Sports Betting add-on's own README — see [01 — Installation § Sports Betting](01-kurulum.md#sports-betting).

> **Odds come only from our own feed, through the odds-provider service.** The live and upcoming sync jobs started in `server.js` talk to the odds-provider app through `oddsProviderClient`; there is no third-party odds API integration in the core. The legacy The Odds API client (`server/src/services/oddsApi.js`) and `server/src/jobs/dataSync.js` were deleted on 2026-10-03, so `ODDS_API_KEY` and `ODDS_API_SPORT` are not read anywhere. `ODDS_PROVIDER` only names an adapter in the add-on's provider registry (`oddsProviders/`, default `internalProvider`), and nothing calls that registry — treat it as having no effect (add-on code, not re-verified locally: the add-on submodules are not checked out here).

## Panel-managed settings

These settings are **not** in `.env` but stored in the database (`Setting` collection, `key`/`value` pairs) and can be changed instantly from the admin panel — no server restart needed (most values propagate with a 30-second cache delay, instantly when `invalidate*()` functions are called). Where each lives in the menu (as of 2026-10-02):

- **Settings** (`/admin/platform`, tabs **General · Modules · Currencies · Jurisdictions · Brands · SEO**)
  - *General*: **Region & Currency** (display currency, operator timezone, default visitor language), **Email (SMTP)**, **Panel Language**, **Alert Channels** (Telegram bot token/chat id, webhook URL, alert email — `GET/PUT /admin/settings/alerts`).
  - *Modules*: on/off switch, licence badge and **connection settings** of every module (see below).
  - *Currencies*, *Jurisdictions*, *Brands*: managers for the multi-currency, multi-jurisdiction and multi-brand subsystems (see [09](09-bilinen-kisitlar.md) for the brand isolation limit).
  - *SEO*: titles, meta tags, canonical, verification codes, GA4/GTM/Pixel ids; also serves `/robots.txt` and `/sitemap.xml`. Details: [`docs/seo-settings.md`](../seo-settings.md).
- **Personalization** (`/admin/personalization`, tabs Theme · Branding · Homepage Slider · Static Pages)
  - *Theme tokens* (`theme.<id>` keys) — primary color, accent color, and related visual values. Injected to the client via `GET /api/theme`. There are **3 ready-made presets** (`neon-cyan`, `emerald-gold`, `crimson-purple`). Source: `server/src/theme/index.js`, `presets.js`.
  - *Branding* (`branding.<id>` keys) — site name, logo, favicon, font family/file. Source: `server/src/branding/index.js`.
  - *Homepage Slider* and *Static Pages* — form-based editors (no drag-and-drop editor).
- **Products** group (business settings of each product; connection settings are in Settings → Modules):
  - **Casino Provider** (`/admin/igames`; tabs Overview · Popular games · **Bonus & Freeround** · Showcase) — popular games, aggregator bonus calls and freerounds (`CasinoPromoGrant` records).
  - **In-house Games** (`/admin/game-settings`) — per-game house edge/payout factor, min/max bet, timing, active switch, and the *allowed games* list. Each change is logged to the `changeLog` field with who/when/old-new value. Source: `server/src/models/GameSettings.js`, `server/src/services/gameSettings.js`. The 13 games themselves come with the In-house Games add-on.
  - **Sportsbook** (`/admin/events`; tabs Active · Archived · **Categories**) — events, settlement, and which sport categories are enabled.
- **Wallet** (`/admin/wallet`, top-level menu entry; tabs Bank · Crypto · Slikair) — approvals and payment records.
- **Module status** (`module.<id>.enabled` keys) — enable/disable from **Settings → Modules** (`client/src/pages/admin/Modules.jsx`); `PATCH /admin/modules/:id` applies instantly. A disabled module's pages are gracefully hidden from visitors with the `ModuleGate` component, the core platform is unaffected. A module must also be licensed — if `LICENSE_SERVER_URL`/`LICENSE_KEY` is not defined, all are automatically considered licensed. Module list (`server/src/modules/registry.js`): `betting`, `casino-content`, `inhouse-games`, `crypto-payment`, `kyc-verification`, `slikair-payment`. See [03 — Module System](03-modul-sistemi.md).
- **VIP levels** — level threshold (XP), cashback percentage, one-time reward, color/icon (`/admin/vip`, `/admin/vip-levels` endpoints). Source: `server/src/models/VipLevel.js`.
- **Fake winners pool** ("Last Winners" simulation) — pool size range, win amount range, trigger frequency range, whether casino wins are included, configurable via `/admin/fake-winners` endpoints. This contains **no real users, bets, or balance changes** — it only publishes the same `winners:new` socket event as real winners. Casino wins are only shown when the relevant module (`casino-content`) is enabled. Source: `server/src/services/fakeWinners.js`. The settings live on the **Bots** page (menu group *Demo & Simulation*).

Game Tasks (`/admin/game-tasks`) still exists as a route but is no longer in the admin menu.

## Currency

There is a **single active display currency** across the site (not a per-user multi-currency wallet — `User.balance` is a single `Number` field). It can be selected from `TRY`, `USD`, `EUR` under **Settings → General → Region & Currency** (`currency.code` key in the `Setting` collection); the selection changes the symbol and locale formatting (`₺`/`tr-TR`, `$`/`en-US`, `€`/`de-DE`) and does **not** convert amounts. The public `GET /api/currency` endpoint returns the active currency and supported list. The separate **Currencies** tab manages exchange-rate records for the multi-currency subsystem (`/admin/currencies`). Source: `server/src/currency/registry.js`, `server/src/currency/index.js`, `server/src/routes/currency.js`.

## Multi-language support (i18n)

Eight dictionary files under `client/src/i18n/dictionaries/`: `tr` (default language, `DEFAULT_LOCALE = 'tr'`, also the fallback — a key not in `tr` can't be found in any language), `en`, `ko`, `th`, `es`, `ja`, `pt`, `de`. Each has the same 3000 keys. To add a new language: add a file under `dictionaries/` + register in the `dictionaries` object in `client/src/i18n/index.js`.

The language switcher (`LanguageSwitcher`) is in the global navigation bar, so it is accessible from everywhere on the site; the default language for new visitors is set in **Settings → General → Region & Currency**. `tr` and `en` are complete. The other six languages are translated except for **3 blocks per file that are still English text** (marked `// TODO: bu bloğu … çevir`: admin dashboard payment/KPI cards, casino statistics labels, the In-house Games module card) — they show English text in those places. Pages that do not use the dictionary: the static company/legal pages (`pages/company/*`, `pages/legal/*`), whose content comes from the static-page editor.

## Casino provider

The casino game catalog comes through a provider selected with the `CASINO_AGGREGATOR` environment variable (default: `igames`). Today only the Igames adapter exists (it is part of the paid Casino Content add-on, `server/src/premium/igames/igamesAdapter.js`); adding a second provider (Evolution, Pragmatic, a licensed aggregator) is writing a new adapter and registering it in `server/src/services/casinoAggregators/registry.js` — existing route/control code doesn't change.
