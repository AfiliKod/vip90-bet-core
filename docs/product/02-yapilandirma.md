# Configuration

There are two layers: **`.env` file** (requires restart, server setup) and **panel-managed settings** (effective immediately, operator's daily work — stored in the database).

## `.env` variables

Description of all keys in the `server/.env.example` file:

### Database

| Variable | Required | What it does |
|---|---|---|
| `MONGODB_URI` | Yes | Database connection address |
| `MONGO_MAX_POOL_SIZE` / `MONGO_MIN_POOL_SIZE` | No | Connection pool settings, default (20/5) is sufficient for most setups |

### Server / session

| Variable | Required | What it does |
|---|---|---|
| `PORT` | No (default 3001) | Port the API server listens on |
| `NODE_ENV` | Yes (`production`) | Development/production behavior difference (rate limit, cookie security, etc.) |
| `CLIENT_URL` | Yes | Your own domain — used in CORS and email links |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Yes | Session token signing keys — must be changed before going to production (`openssl rand -base64 64`) |
| `EMAIL_VERIFICATION_CUTOFF` | No | ISO 8601 date — users who registered before this date are exempt from email verification (grandfathering). If empty, falls back to the code default |

### Rate limiting

| Variable | Required | What it does |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | No | General rate-limit window (ms), default 900000 (15 min) |
| `RATE_LIMIT_MAX` | No | General request limit per window, default 200 |
| `AUTH_RATE_LIMIT_MAX` | No | Stricter limit for login/register endpoints (default 5) |
| `FINANCIAL_RATE_LIMIT_MAX` | No | Separate limit for deposit/withdraw endpoints (default 10) |

### Casino provider (Igames)

| Variable | Required | What it does |
|---|---|---|
| `PALACE_API_BASE` / `PALACE_API_TOKEN` / `PALACE_CALLBACK_TOKEN` | If casino module will be used | Casino content provider access credentials (see [03 — Module System](03-modul-sistemi.md)) |

### Payment / crypto

| Variable | Required | What it does |
|---|---|---|
| `USDT_TRY_RATE` | If crypto payment will be used | USDT→TRY fixed rate (market price is not fetched automatically, updated manually) |
| `TRONGRID_API_KEY` | No | Increases request limit to TronGrid; if empty, USDT-TRC20 tracking continues with low limits |

### AI support assistant

| Variable | Required | What it does |
|---|---|---|
| `AI_HELP_BASE_URL` | No (default OpenRouter) | The LLM API address the support chatbot talks to |
| `AI_HELP_API_KEY` | No | If empty, chatbot returns "currently under maintenance, open a ticket" — doesn't crash |
| `AI_HELP_MODEL` | No (default `meta-llama/llama-3.1-8b-instruct:free`) | Model ID to use |

This trio powers a real document-based chatbot that reads and parses `docs/product/*.md` and `CHANGELOG.md` — see [06 — FAQ](06-sss.md).

### Email

| Variable | Required | What it does |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Yes | For email verification and password reset emails |

### Monitoring / alerts

| Variable | Required | What it does |
|---|---|---|
| `SENTRY_DSN` | No (recommended) | Error tracking |
| `ALERT_WEBHOOK_URL` | No (recommended) | Operational alerts (e.g., Slack webhook) |

### Security / bot protection

| Variable | Required | What it does |
|---|---|---|
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | No | Cloudflare Turnstile bot protection |
| `DISABLE_TURNSTILE` | No | If `true`, skips Turnstile check (for development) |
| `ADMIN_ALLOWED_IPS` | No | IP restriction for admin panel, comma-separated list |
| `LEGAL_VERSION` | No | Terms of service version label, shown on registration form |

### Social login

| Variable | Required | What it does |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | If Google login will be used | OAuth 2.0 client created in Google Cloud Console |
| `TELEGRAM_LOGIN_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | If Telegram login will be used | Bot for the Login Widget — must be **different** from the admin notification bot (configured in the panel), must be registered with the production domain via `/setdomain` in BotFather |

There is no separate env variable for Web3 wallet login (MetaMask, etc.) — signature verification is done server-side (`ethers`), no external identity information is required.

### License (optional module control)

| Variable | Required | What it does |
|---|---|---|
| `LICENSE_SERVER_URL` / `LICENSE_KEY` | No | If defined, module enabled/disabled status is also verified against a central license server. **If not defined, the product runs in "unmanaged" mode: all defined modules (betting, casino-content, in-house games, crypto-payment, kyc-verification) are considered licensed** — this is a deliberate default so the product works out of the box |

These two variables are **not** in `server/.env.example` — they are read directly from `process.env` in `server/src/services/licensing/index.js`. If you don't have a license server, you don't need to touch them.

### Odds (sports betting) source

| Variable | Required | What it does |
|---|---|---|
| `ODDS_PROVIDER` | No (default `oddsSource`) | Selects the active odds provider — if set to `theoddsapi`, switches to the licensed The Odds API |
| `ODDS_API_KEY` / `ODDS_API_SPORT` | Required if `ODDS_PROVIDER=theoddsapi` | The Odds API access key and sport code (see [05 — API Reference](05-api-referansi.md)) |
| `ODDS_SOURCE_HOST_TEMPLATE` | If oddsSource will be used | Common prefix for the source's mirror domains — if empty, domain discovery finds nothing |
| `ODDS_SOURCE_PROXY_URL` | No | HTTP proxy relay for hosting regions where Cloudflare can't reach the source origin |
| `ODDS_SOURCE_COOKIES` | No | Manually exported cookies (priority is in the `cookies.json` file; this env is only read if the file doesn't exist) |
| `ODDS_SOURCE_SCAN_AHEAD` / `ODDS_SOURCE_WIDE_SCAN_AHEAD` / `ODDS_SOURCE_DNS_CONCURRENCY` | No | Domain discovery scan windows — only change if discovery is continuously failing |

> Correction note: a previous version of this document marked `ODDS_API_KEY` as unused — that was true at the time, no longer. With the T2 card, a real provider (The Odds API) has been connected.

> **Known limitation:** Contrary to what the table above implies, `ODDS_PROVIDER` does NOT select which live/fixtures sync jobs run — `server.js` starts `startOddsSourceLiveSync`/`startOddsSourceUpcomingSync` unconditionally regardless of this setting. These jobs always discover the OddsSource mirror domain and connect via WebSocket; setting `ODDS_PROVIDER=theoddsapi` only affects the parsing logic, it doesn't stop this traffic. A full provider switch — writing a new sync job for theoddsapi and updating `server.js` to start the right job based on the active provider — requires a separate, not-yet-done engineering card.

## Panel-managed settings

These settings are **not** in `.env` but stored in the database (`Setting` collection, `key`/`value` pairs) and can be changed instantly from the admin panel — no server restart needed (most values propagate with a 30-second cache delay, instantly when `invalidate*()` functions are called):

- **Alert channels** — Telegram bot token/chat id, webhook URL, alert email. `/admin/settings`.
- **Theme tokens** (`theme.<id>` keys) — primary color, accent color, and related visual values. Injected to the client via `GET /api/theme`, changes reflect across the entire UI instantly. Source: `server/src/theme/index.js`.
- **Brand identity** (`branding.<id>` keys) — site name, logo, favicon, font family/file. Source: `server/src/branding/index.js`.
- **Active currency** (`currency.code` key) — see the "Currency" section below.
- **Module status** (`module.<id>.enabled` keys) — you can enable/disable the betting, casino-content, in-house games, crypto-payment, and kyc-verification modules from the **Modules** screen in the admin panel (`client/src/pages/admin/Modules.jsx`); `PATCH /admin/modules/:id` applies instantly, no page restart needed. A disabled module's pages are gracefully hidden from visitors with the `ModuleGate` component ("This section is currently closed" message), the core platform is unaffected. A module must also be licensed — if `LICENSE_SERVER_URL`/`LICENSE_KEY` is not defined, all are automatically considered licensed (see the "License" section above).
- **Game economy settings** — the core ships the data model and admin UI (`client/src/pages/admin/GameSettings.jsx`, `PATCH /admin/game-settings/:gameId`, `server/src/models/GameSettings.js`, `server/src/services/gameSettings.js`) for configuring each in-house game's house edge/payout factor, min/max bet, and timing — these values are only consumed once the licensed In-house Games module is installed and reading them.
- **VIP levels** — level threshold (XP), cashback percentage, one-time reward, color/icon managed via `/admin/vip-levels` endpoints. Source: `server/src/models/VipLevel.js`.
- **Fake winners pool** ("Last Winners" simulation) — pool size range, win amount range, trigger frequency range, whether casino wins are included configurable via `/admin/fake-winners` endpoints. This contains **no real users, bets, or balance changes** — it only publishes the same `winners:new` socket event as real winners. Casino wins are only shown when the relevant module (`casino-content`) is enabled. Source: `server/src/services/fakeWinners.js`.

## Currency

There is a **single active currency** across the site (not a per-user multi-currency wallet — `User.balance` is a single `Number` field). It can be selected from `TRY`, `USD`, `EUR` in the admin panel (`currency.code` key in the `Setting` collection); the selection changes the symbol and locale formatting (`₺`/`tr-TR`, `$`/`en-US`, `€`/`de-DE`). The public `GET /api/currency` endpoint returns the active currency and supported list. Source: `server/src/currency/registry.js`, `server/src/currency/index.js`, `server/src/routes/currency.js`.

## Multi-language support (i18n)

Two dictionary files: `client/src/i18n/dictionaries/tr.js` (default language, `DEFAULT_LOCALE = 'tr'`, also the fallback — a key not in `tr` can't be found in any language) and `dictionaries/en.js`. Both contain ~1490 keys. To add a new language: add a file under `dictionaries/` + register in the `dictionaries` object in `client/src/i18n/index.js`.

The language switcher (`LanguageSwitcher`) is in the global navigation bar (`Navbar.jsx`), so it's accessible from everywhere on the site — in previous versions it was only on the login screen. 59 of 67 page components read from the dictionary via `useTranslation()`/`t()`. But **the translation is still incomplete**: large pages like `HomePage.jsx`, `Bahis.jsx`, `Live.jsx`, `CasinoRedesign.jsx`, `Profile.jsx` still have directly embedded Turkish text (you can search in the code to verify). In short: the infrastructure and navigation are mostly done, page contents are partially translated — an active development flow.

## Casino provider

The casino game catalog comes through a provider selected with the `CASINO_AGGREGATOR` environment variable (default: `igames`). Today only the Igames adapter is available; adding a second provider (Evolution, Pragmatic, a licensed aggregator) is just writing a new adapter and adding it to the registry — existing route/control code doesn't change.