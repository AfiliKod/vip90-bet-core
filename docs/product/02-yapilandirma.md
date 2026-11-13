# Configuration

There are two layers: **`.env` file** (requires restart, server setup) and **panel-managed settings** (effective immediately, operator's daily work — stored in the database).

Some integration credentials exist in both layers: the value saved from the admin panel (encrypted in the database) wins, an empty panel value falls back to the environment variable. **Saving a secret field from the panel requires `OPERATOR_SECRET_ENCRYPTION_KEY`** (64 hex characters) in `.env`; without it the save fails.

**The `.env` fallback is single-mode only.** Under `TENANCY_MODE=multi` a tenant that has not saved a credential in the panel gets the field's own default (empty for credentials), **never** the server's `SMTP_PASS`, `SLIKAIR_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, `SUMSUB_SECRET_KEY` and so on — otherwise every tenant would silently share the first operator's accounts. Only platform-wide settings (Sentry, Turnstile, alert channels) keep reading their `.env` default. Existing single installs see no change; see [Multi-tenant settings resolution](#multi-tenant-settings-resolution).

## `.env` variables
### Çok operatörlü tenancy, platform ve saklama

Bu grupta partner veya faturalama için ayrı ortam değişkeni yoktur: partner yetkileri, ticari koşullar, ücret planları ve NGR tanımları platform veritabanında yönetilir. Kodun bu amaçla okuduğu tüm ortam değerleri şunlardır:

| Değişken | Tek mod | Çok mod |
|---|---|---|
| `TENANCY_MODE` | Boş veya `single`; varsayılan budur. | `multi` ile merkezi kurulum açılır. |
| `TENANCY_ENFORCEMENT` | Boşsa G3 backfill tamamlanana kadar `off`, sonra `log`; açıkça `off`/`log`/`enforce` seçilebilir. | Her zaman `enforce`; farklı açık değer başlangıç hatasıdır. |
| `JWT_STAFF_SECRET` | İsteğe bağlıdır; boşsa staff tokenı yine ayrı audience ile ana JWT sırrını kullanır. | Zorunludur. |
| `OPERATOR_SECRET_ENCRYPTION_KEY` | Panel sırlarını şifrelemek için gereklidir. | Zorunludur; 64 hex karakterdir. |
| `PLATFORM_HOST` | Gerekmez. | Platform/partner API'leri ve `/console` için platform ana makinesi; ör. `platform.example.com`. |
| `SCOPE_GATE_ENV` | İsteğe bağlı ölçüm etiketi. | `staging` veya `production` seçildiğinde N6 kapsam ihlallerini gün bazında kaydeder; boşsa ölçüm yoktur. |
| `AUDIT_RETENTION_DAYS` | İsteğe bağlıdır. | En az `1825`; daha düşük veya geçersiz değer sunucunun başlamasını engeller. |
| `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT`, `DEMO_DATA` | `true` olduğunda ilgili demo özelliğini açar. | Hepsi `false` olmalıdır; `true` başlangıç hatasıdır. |
| `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_REGISTRATION_NO`, `LEGAL_ENTITY_ADDRESS` | Varsayılan Tenant ilk oluşturulurken okunur; sonrası veritabanındadır. | Operatör bazında sağlama/konsol verisi kullanılır; ortak `.env` değeri operatör sırrı veya ayarı olarak kullanılmaz. |

`PLATFORM_HOST` yalnız ana makine adını ya da şemalı bir kökeni kabul eden kurulum akışlarında kullanılır; örnek `platform.example.com` yeterlidir. Ayrıntılı işletim akışı için [12 — Çok Operatörlü Kurulum](12-cok-operator.md) belgesine bakın.


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
| `CLIENT_URL` | Yes in `TENANCY_MODE=single` (`multi`: no) | Your own domain. In **single** mode it is the canonical origin for email links, OAuth returns, the Slikair webhook/redirect URLs and the support-assistant `HTTP-Referer` (the **first** entry of a comma-separated list), and the whole list is added to CORS — put the address players use first. In **multi** mode the site URL and CORS list come from the `Domain` collection instead (see [Multi-tenant settings resolution](#multi-tenant-settings-resolution)); the variable is not required and not used there. `server/scripts/healthcheck.js` only requires it in single mode |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Yes | Session token signing keys — must be changed before going to production (`openssl rand -base64 64`; `healthcheck.js` requires at least 32 characters) |
| `E2E_TEST` | No | `true` relaxes rate limits and login throttling the same way `NODE_ENV=test` does; only for end-to-end test runs, never in production |
| `ROUTE_404_REPORT_ONLY` | No (default: unset = enforcement on) | Set to `1` to make the SPA route 404 a **report-only** mode: unknown URLs are logged instead of answered with `404`, and everything keeps returning `200` (previous behavior). Used for the first deployment phase; see [SEO settings — Gerçek 404](../seo-settings.md). Unknown routes are only logged when the client build wrote `client/dist/routes.json` |
| `RAILWAY_PUBLIC_DOMAIN` | No | Set automatically by Railway; when present, `https://<value>` is added to the allowed origins in both modes |
| `EMAIL_VERIFICATION_CUTOFF` | No (not in `server/.env.example`, only in the root `.env.example`) | ISO 8601 date — users who registered before this date are exempt from email verification (grandfathering). If empty, the code default `2026-07-14T00:00:00Z` applies. Demo-data (`isSeed`) accounts can never log in regardless of this date |

### Rate limiting

There are **no environment variables** for rate limiting. The limits are constants in `server/src/middleware/rateLimit.js` (global 1200 requests / 15 min per IP, stricter limits for registration, login, e-mail flows, financial endpoints, spin, admin 2FA). `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX` and `FINANCIAL_RATE_LIMIT_MAX` that appear in the root `.env.example` are not read by any code. The full table is in [05 — API Reference § Rate limiting](05-api-referansi.md). Changing a limit means editing the file.

### Casino provider (Igames) — Casino Content add-on

| Variable | Required | What it does |
|---|---|---|
| `PALACE_API_BASE` / `PALACE_API_TOKEN` / `PALACE_CALLBACK_TOKEN` | If the Casino Content add-on will be used | Casino content provider access credentials (the `PALACE_*` variable names are historical identifiers in the code). They can also be entered from **Settings → Modules → Casino Content** (stored encrypted, panel wins over `.env`); the `/api/igames` routes accept a token saved in the panel as well (fixed 2026-10-03) |
| `IGAMES_CALLBACK_ALLOWED_IPS` | Recommended with the add-on | Comma-separated IPs/CIDRs of the provider's callback servers (ask the provider; it documents no callback signature). When set, `POST /api/igames/callback` from any other address answers `401 {code:1001}` before the token check. Unset: token only, with a warning at start-up. Same parser and client-IP rule as `ADMIN_ALLOWED_IPS` (invalid entries ignored and logged; no valid entry → every callback refused, so a wrong list stops all callbacks). Behind Cloudflare and a reverse proxy, restore the real client IP at the proxy first, or use `ADMIN_IP_TRUST_CF_HEADER=true` (shared with the admin allowlist; only when the origin accepts Cloudflare traffic alone) — **verify with a test callback on your own deployment** |

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
| `INHOUSE_SESSION_MAX_MINUTES` | No | Default cap on one in-house play session, in minutes (default `120`, clamped to 5–1440). If the player set their own session limit on the Responsible Gaming page, **the player's shorter limit wins**. When the cap is reached the session is closed (`closeReason: 'max_duration'`), the next `POST /api/inhouse-provider/launch` starts a new one and further rounds are rejected with `SESSION_LIMIT_REACHED`. The engine's own in-memory session is not closed by this (see [09](09-bilinen-kisitlar.md)) |
| `INHOUSE_IDLE_SETTLE_MINUTES` | No | How long a custodial round (Mines, Hilo, Blackjack, Video Poker) may sit untouched before the engine closes it, in minutes (default `20`). The round is closed in the player's favour: the revealed tiles are collected at the current multiplier, Blackjack stands, Video Poker holds all five cards, and a round with nothing revealed is refunded. A round that is debited but never settled — a crash, or an older version — is refunded the same way. The sweep runs every 60 seconds inside the provider process; it needs no separate job |
| `OPERATOR_ONE_WALLET_CALLBACK_URL` / `OPERATOR_ONE_ALLOWED_IPS` / `OPERATOR_ONE_API_BASE` | No | Override the defaults that `create-operator-one.mjs` writes (single-machine `localhost` callback and `127.0.0.1,::1`); needed for Docker or a remote game-host. Same as the script's `--callback-url`, `--allowed-ips`, `--api-base` flags |

If the add-on is installed and one of `GAME_HOST_URL`, `GAME_HOST_SECRET`, `PROVIDER_SESSION_SECRET` is missing, the server logs `[config] Eksik ortam değişkeni: ...` at start and the games may fail at runtime.

### Payment / crypto

| Variable | Required | What it does |
|---|---|---|
| `CRYPTO_SEED_PHRASE` | If crypto payment will be used | HD wallet mnemonic: per-user deposit addresses (and the hot wallet at index 0) are derived from it. **Not in `server/.env.example`.** Without it `GET /api/crypto/deposit-address` and `POST /api/crypto/check-deposit` answer `503` |
| `HOT_WALLET_PRIVATE_KEY` | No | If set, used as the hot wallet signer for withdrawals instead of deriving it from the seed phrase. Not in `server/.env.example` |
| `TRON_NETWORK` | No (default `mainnet`) | `mainnet`, `shasta` or `nile`. A network saved in the admin panel wins over this variable (see below) |
| `USDT_TRY_RATE` | If crypto payment will be used | USDT→TRY fixed rate (market price is not fetched automatically, updated manually). Code default is `1` if unset or invalid (non-numeric, ≤ 0 or above 1e6; logged); the example file uses `35`. A rate saved in the admin panel wins over this variable (see below) |
| `TRONGRID_API_KEY` | — | Listed in the example files but **not read by any code** (`cryptoService.js` calls TronGrid without a key); setting it has no effect |

Auto-credit/auto-withdraw thresholds (defaults: 100 USDT / 15 USDT), the rate and the network can be changed from **Settings → Modules → Crypto Payment Gateway** (`PUT /admin/crypto/settings`). Saved values are stored in the database (`Setting` `crypto.settings`) and survive restarts; only the keys you save are stored, and a saved key **wins over** `USDT_TRY_RATE` / `TRON_NETWORK`, so changing the variable later has no effect on it. Keys never saved keep following the variables. The settings are re-read at start-up and at most every 30 s on the deposit/withdraw paths; run a single instance (other instances' remaining readers only pick up a change after a restart). After installing the crypto module on an existing database, run `node server/scripts/migrate-crypto-index.mjs` (dry run, then `--commit`) once: it seeds the deposit-address counter and adds a unique index on `cryptoDepositIndex` (it refuses while two users share an index; `--fix` moves the newer ones to a new address).

### Slikair payment gateway

| Variable | Required | What it does |
|---|---|---|
| `SLIKAIR_MERCHANT_ID` / `SLIKAIR_MERCHANT_TOKEN` / `SLIKAIR_SITE_ID` / `SLIKAIR_BASE_URL` / `SLIKAIR_WEBHOOK_SECRET` | If Slikair will be used | Merchant credentials (sandbox base URL by default). Can be entered from **Settings → Modules → Slikair Payment Gateway** (stored encrypted, panel wins). The webhook secret is not used for signature verification, see [09](09-bilinen-kisitlar.md) |
| `API_BASE_URL` | No | Public URL that is sent to Slikair as the webhook target; when empty the resolved site base URL is used — the tenant's primary `Domain` in multi mode, the first `CLIENT_URL` origin in single mode |

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
| `SMTP_HOST` / `SMTP_PORT` (default 587) / `SMTP_SECURE` (default false) / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` (default `noreply@vip90.bet`) | Yes (here or in the panel) | Outgoing mail server for verification, password reset and the system emails. Can be entered from **Settings → Modules → Email Gateway** (password stored encrypted, empty panel fields fall back to these variables; the card has a test-mail button) |
| `SMTP_FROM_NAME` | No | Display name in the `From` header; empty means the site name |
| `SMTP_PROVIDER` | No | `mailtrap`, `mailgun`, `ses`, `postmark` or `custom` — pre-fills the panel form and labels the service. For `mailtrap` it is **load-bearing**: with a token present, sending goes through the Mailtrap Email API instead of SMTP (`emailConfig.resolveEmailMode`) |
| `MAILTRAP_TOKEN` | No (required for Mailtrap sending) | Mailtrap Sending API token (Mailtrap → Settings → API Tokens, Admin access). Stored encrypted in the panel too (SMTP password and this token share the `smtp.*` settings store). With `SMTP_PROVIDER=mailtrap` — or with no SMTP host at all — this is the sending credential |
| `MAILTRAP_SANDBOX` | No (default `false`) | `true`: emails go only to a Mailtrap Sandbox inbox, no real recipient is contacted. The server logs a warning on every transport (re)build so a live site cannot silently stay in sandbox |
| `MAILTRAP_INBOX_ID` | With sandbox | Numeric Mailtrap Sandbox inbox ID; required when `MAILTRAP_SANDBOX=true` |
| `MAIL_SUPPRESS_EMAIL_DOMAINS` | No (default `seed.local,test.local,local`) | Recipient domains that must **never** receive mail, comma separated. Each entry also covers its subdomains, and `local` covers every reserved `.local` address (demo/seed and e2e accounts). Enforced at the transport boundary (`sendEmail`) and in campaign audience selection, so no provider emission and no delivery-log row is produced. Set it empty to disable |
| `SMTP_GATEWAY_ENABLED` | No (default `true`) | The Email Gateway switch. `true`: the transport uses the panel values (panel wins, empty fields fall back to `.env`). `false`: the transport uses **only** the `.env` values and ignores the panel. The switch in the card header writes the same setting, which wins over this variable |
| `MAIL_SEND_BATCH_LIMIT` | No (default 500, max 5000) | Maximum recipients of one bulk system-email send |
| `MAIL_SYSTEM_DISABLED` | No | `true` stops every system email (event-triggered and bulk); for tests or maintenance |

Email templates, sender identities, the delivery log and test sends are on the **Communication** page (`/admin/communications?channel=email`); see [`docs/mail-templates.md`](../mail-templates.md).

**Per-tenant transport.** Under `TENANCY_MODE=multi` every `SMTP_*` / `MAILTRAP_*` variable above is ignored for sending: each tenant's transporter and Mailtrap client are built from its own **Settings → Modules → Email Gateway** values and kept in a separate pool, so one tenant's credentials (or a change to them) never touch another tenant's connection. A tenant with neither SMTP nor Mailtrap configured has no sender (`mode: 'none'`): `sendEmail` logs a mock line and returns `{ mock: true }` **in every environment** (the panel's test-email button answers `400 MAIL_PROVIDER_NOT_CONFIGURED`), so a half-provisioned tenant's mail is never sent through the server's own mailbox. The pooled transporter is rebuilt only when that tenant's connection fields change; another tenant's live connection is left alone. `MAIL_SUPPRESS_EMAIL_DOMAINS`, `MAIL_SYSTEM_DISABLED` and `MAIL_SEND_BATCH_LIMIT` stay server-wide.

### SMS (SMS Gateway module)

| Variable | Required | What it does |
|---|---|---|
| `SMS_PROVIDER` | No | Only `twilio` is supported |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | If SMS will be used | Twilio credentials |
| `TWILIO_FROM_NUMBER` / `TWILIO_MESSAGING_SERVICE_SID` | One of them, if SMS will be used | Sender: an E.164 number or a Messaging Service SID |
| `TWILIO_DEFAULT_COUNTRY_CODE` | No | Country code applied to numbers written without `+`/`00`; without it such numbers are rejected rather than guessed |
| `SMS_ACCOUNT_TYPE` / `SMS_TRIAL_SIGNUP_COUNTRY` | No | `unknown`, `trial` or `paid`, and the trial account's sign-up country. The real account type is read from the Twilio API; these are fallbacks |

All of them can be entered from **Settings → Modules → SMS Gateway** (Auth Token stored encrypted, requires `OPERATOR_SECRET_ENCRYPTION_KEY`; panel wins over `.env`). The module must also be switched on. Templates, campaigns, automations and the delivery log are on the **Communication** page (`/admin/communications?channel=sms`); see [`docs/sms-gateway/README.md`](../sms-gateway/README.md).

### Monitoring / alerts

| Variable | Required | What it does |
|---|---|---|
| `SENTRY_DSN` | No (recommended) | Error tracking |
| `ALERT_WEBHOOK_URL` | No (recommended) | Operational alerts (e.g., Slack webhook). Can also be set in **Settings → General → Alert Channels**, which wins over the variable |

### Security / bot protection

| Variable | Required | What it does |
|---|---|---|
| `TURNSTILE_SECRET_KEY` (old name `TURNSTILE_SECRET` still accepted) / `TURNSTILE_SITE_KEY` / `DISABLE_TURNSTILE` | — | Cloudflare Turnstile bot protection, **off by default**. It turns on when **both** the secret and the site key are set (`DISABLE_TURNSTILE=true` forces it off). Then `POST /api/auth/register`, `/login` and `/forgot-password` require a valid `turnstileToken` (`400 TURNSTILE_REQUIRED` / `TURNSTILE_FAILED`), and the login/register and forgot-password pages render the widget (`GET /api/auth/turnstile-config` hands the site key to the client). If Cloudflare is unreachable, verification fails open (rate limits still apply). Source: `server/src/middleware/turnstile.js` |
| `ADMIN_ALLOWED_IPS` | — | Comma-separated IPs/CIDRs (IPv4 and IPv6). **Off by default**; when set, `/api/admin/*` answers `403 ADMIN_IP_NOT_ALLOWED` to any other address (a list with no valid entry fails closed). The client IP is `req.ip` (`trust proxy` 1); `CF-Connecting-IP` is only honoured with `ADMIN_IP_TRUST_CF_HEADER=true`. Behind Cloudflare plus another proxy (e.g. nginx) `req.ip` may be the edge address: configure real-IP handling at the proxy, or enable the header flag only if the origin accepts traffic from Cloudflare alone — **verify on your own deployment**. Scope: every staff endpoint (everything behind `requireAdmin`: `/api/admin/*`, ticket and chat admin, `/api/bank/admin/*`, crypto settings and hot-wallet balance, `POST /api/auth/2fa/{setup,verify,disable}`, the Casino Content add-on's staff routes), the admin path of KYC document download and the live admin socket room. Login (`/api/auth/login`, `/api/auth/2fa/login`) is outside it, so staff can log in from anywhere but get `403` on every staff screen. The variable is read at start-up: fixing a lock-out means editing `server/.env` and restarting. Source: `server/src/middleware/adminIpAllowlist.js` |
| `LEGAL_VERSION` | — | Not an environment variable: the terms version label is the constant `LEGAL_VERSION = '1.0.0'` in `client/src/data/legalContent.js` |

### Tenancy and demo flags

The tenancy switch and the demo feature switches are parsed and validated at start-up by `server/src/config/tenancy.js`. The effective demo flags (never `true` in `multi`) are what `GET /api/admin/demo-flags` reports to the admin client, which hides the matching menu entries.

| Variable | Required | What it does |
|---|---|---|
| `TENANCY_MODE` | No (default `single`) | `single` (one operator, behaviour unchanged) or `multi` (one central installation with tenant-isolated data). Any other value — including a typo such as `mulit` — refuses to start instead of silently falling back to `single` |
| `TENANCY_ENFORCEMENT` | No | What `tenantScoped` does with an unscoped query on a tenant-owned model: `off` (nothing is injected or checked), `log` (injects the tenant inside a tenant context, counts and warns on unscoped queries, never throws) or `enforce` (`500 TENANT_SCOPE`). Unset/empty means `enforce` in `multi`, and in `single` it means `log` once the G3 backfill is recorded complete for every collection, `off` until then (G7; see [Tenant scoping of money and admin paths](#tenant-scoping-of-money-and-admin-paths-ip-5)); an explicit `off`/`log` in `multi` refuses to start |
| `JWT_STAFF_SECRET` | Only with `TENANCY_MODE=multi` (used from İP-3) | Signs staff access tokens; staff and player token audiences remain separate. Unset or empty while `TENANCY_MODE=multi` refuses to start |
| `PLATFORM_HOST` | Only to publish the console on its own host (multi) | The Platform Owner console host (İP-9a). When set, `/api/platform/*` and `/console` are served **only** on this host; a tenant domain never serves them — the request goes through tenant resolution instead. Unset (development), the path prefix alone decides whether a request is a platform request. Source: `server/src/middleware/tenantHost.js`, `server/src/app.js` |
| `SCOPE_GATE_ENV` | No (multi, N6 telemetry) | e.g. `staging` or `production`. When set, every tenant-scope violation is counted per UTC day in `ScopeGateDay`, so the go-live gates (14 consecutive clean days on staging, 7 on production) can be read at `GET /api/platform/system/scope-gates`. Unset, nothing is recorded. Source: `server/src/platform/services/scopeTelemetry.js` |
| `AUDIT_RETENTION_DAYS` | No (default 365 single / 1825 multi) | Audit log retention in days (K24). In `TENANCY_MODE=multi` the value must be at least **1825 (5 years)**: a lower value refuses to start, and the `AuditLog` TTL and post-closure legal retention (`legalRetentionUntil`) floor at 1825 regardless. The TTL index `expireAfterSeconds` is fixed at start-up — changing this variable on an existing database does **not** rebuild it; apply a `collMod` on the `createdAt_-1` TTL index of the `auditlogs` collection to change `expireAfterSeconds` (e.g. `db.runCommand({ collMod: 'auditlogs', index: { name: 'createdAt_-1', expireAfterSeconds: <days×86400> } })`). Single mode keeps its 365-day default. Source: `server/src/models/AuditLog.js`, `server/src/config/tenancy.js` |
| `DEMO_BOTS` | No (default `false`) | `true` starts the bot-player scheduler and unlocks the UI-less `/api/admin/bots*` API. Off, those endpoints answer `404 DEMO_FEATURE_DISABLED`. Never effective in `multi` |
| `DEMO_FAKE_WINNERS` | No (default `false`) | `true` starts the "Last Winners" simulation and unlocks `/api/admin/fake-winners`; the admin **Bots** entry (that page only manages fake winners) is hidden while it is off. Off, those endpoints answer `404 DEMO_FEATURE_DISABLED`. Never effective in `multi` |
| `DEMO_INSTANT_DEPOSIT` | — | **Demo only, default `false`.** `true` enables `POST /api/transactions/deposit`, which credits a balance **without any payment** (no client calls it; only for a deliberate single-operator test install with an external caller). Off, it answers `404 DEMO_FEATURE_DISABLED`. Ignored when `TENANCY_MODE=multi`. Never enable it on an installation that takes real money. Source: `server/src/config/demoFlags.js` |
| `DEMO_DATA` | No (default `false`) | `true` unlocks `/api/admin/demo-data/*` and restores the live demo simulation at start-up; the **Demo data** admin entry is hidden while it is off. Off, those endpoints answer `404 DEMO_FEATURE_DISABLED`. Never effective in `multi` |

Demo installs must set the flags they use to `true` in `server/.env` before updating; real operator installs need to change nothing.

**Start-up refusal.** The server exits with code 1 — each problem logged as `[tenancy] <problem>` — when `TENANCY_MODE=multi` and `TENANCY_ENFORCEMENT` is anything but `enforce`, when `TENANCY_MODE=multi` and any `DEMO_*` flag is `true`, when `TENANCY_MODE=multi` and `JWT_STAFF_SECRET` or `OPERATOR_SECRET_ENCRYPTION_KEY` is unset or empty, or when `TENANCY_MODE=multi` and `AUDIT_RETENTION_DAYS` is below 1825 (5 years). Installations that define none of these variables behave exactly as before. Source: `server/src/config/tenancy.js`.

### Social login

| Variable | Required | What it does |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` / `GOOGLE_LOGIN_ENABLED` | Optional | Fallback for Google login. Normally set in **Settings → Modules → Google Login** (panel values win; the secret is stored encrypted, needs `OPERATOR_SECRET_ENCRYPTION_KEY`). The "Continue with Google" button appears only when the card's switch is on (`GOOGLE_LOGIN_ENABLED`, default on) and the client ID and secret are set. The redirect URI defaults to the first `CLIENT_URL` origin + `/api/auth/google/callback` (`CLIENT_URL` is only used in single mode; multi installs must register the tenant's own domain's callback); register it in Google Cloud Console as an authorized redirect URI. The return address after login follows the tenant's site URL (`Domain`), not `CLIENT_URL` |
| `TELEGRAM_LOGIN_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | If Telegram login will be used | Bot for the Login Widget — must be **different** from the admin notification bot (configured in the panel), must be registered with the production domain via `/setdomain` in BotFather |

There is no separate env variable for Web3 wallet login (MetaMask, etc.) — signature verification is done server-side (`ethers`), no external identity information is required.

Google login can also be configured **from the panel** (**Modules → Google Login**), which takes precedence over these variables (DB, with the secret encrypted, > env > derived default). Full setup, flows, account-linking rules and troubleshooting: [`docs/social-login.md`](../social-login.md).

### License (optional module control)

| Variable | Required | What it does |
|---|---|---|
| `LICENSE_SERVER_URL` / `LICENSE_KEY` | No | If defined, module enabled/disabled status is also verified against a central license server. **If not defined, the product runs in "unmanaged" mode: all defined modules are considered licensed** — this is a deliberate default so the product works out of the box |

These two variables are **not** in `server/.env.example` — they are read directly from `process.env` in `server/src/services/licensing/index.js`. If you don't have a license server, you don't need to touch them. The Slikair payment module is exempt from the license check (`licenseExempt`): only its panel switch decides.

### Odds (sports betting) — Sports Betting add-on

The odds data comes from the hosted VIP90 odds feed (`https://feed.vip90.bet`); nothing runs locally. The main server only needs the address and its API key:

| Variable | Required | What it does |
|---|---|---|
| `ODDS_PROVIDER_API_BASE` | If the add-on is installed | Address of the odds feed: `https://feed.vip90.bet` |
| `ODDS_PROVIDER_API_TOKEN` | If the add-on is installed | API key (`odp_…`) created in the developer portal (`https://developers.vip90.bet`). It can also be entered later in **Settings → Modules → Sports & Live Betting** (stored encrypted) |
| `ODDS_PROVIDER_MANAGEMENT_SECRET` | No | Only for a self-hosted feed (VIP90's own installation); not used with the hosted feed |

Which sports you receive and the request limit come from your plan; the key's IP allowlist, extra keys and team members are managed in the developer portal. See [01 — Installation § Sports Betting](01-kurulum.md#sports-betting).

> **Odds come only from the hosted odds feed.** The live and upcoming sync jobs started in `server.js` talk to the feed through `oddsProviderClient`; there is no third-party odds API integration in the core. The legacy The Odds API client (`server/src/services/oddsApi.js`) and `server/src/jobs/dataSync.js` were deleted on 2026-10-03, so `ODDS_API_KEY` and `ODDS_API_SPORT` are not read anywhere. `ODDS_PROVIDER` only names an adapter in the add-on's provider registry (`oddsProviders/`, default `internalProvider`), and nothing calls that registry — treat it as having no effect (add-on code, not re-verified locally: the add-on submodules are not checked out here).

### Tenancy Migrations and Indexes (İP-2)

Every operator-owned (TEN) collection now carries `tenantId`, and the money records carry `currency`. The field is added **without** `required: true` during the transition (G2), so an existing single-operator database keeps validating while documents are still unassigned; strict `required: true` arrives with the enforcement package (İP-8). Two migrations close the gap. Neither runs at server start — like every data migration here, apply them yourself with `node server/scripts/migrate.js` after updating (idempotent: applied migrations are skipped, `server/scripts/healthcheck.js` reports the pending ones).

**Take a backup first** (`scripts/backup-db.sh`, or your own `mongodump`): G3 rewrites every legacy document, and the rollback of a half-finished backfill is a restore, not a script.

| Migration | `Migration` record | What it does |
|---|---|---|
| `server/migrations/0005_tenancy_backfill_tenant_id.js` | `tenancy-002-backfill-tenant-id` (version `1.2.0`) | G3 — fills `tenantId` on documents that have none, in 10,000-document batches |
| `server/migrations/0006_tenancy_compound_indexes.js` | `tenancy-003-compound-indexes` (version `1.2.0`) | G4 — builds the `{tenantId, …}` compound indexes online, dropping nothing |
| `server/migrations/0008_tenancy_settings.js` | `tenancy-005-settings` (version `1.4.0`) | G6 — gives legacy setting rows their `scope`/`tenantId` and builds the compound unique index `{tenantId, scope, brandId, key}`, dropping nothing (see [Multi-tenant settings resolution](#multi-tenant-settings-resolution)) |

**G3 — backfill (`server/src/tenancy/backfill.js`).** For each registered tenant model (plus the model-less `transactions_dedupe_archive` collection, when it exists) the runner walks the unassigned documents (`tenantId` missing or `null`) with an `_id`-ordered cursor, 10,000 at a time, and sets them to the default tenant created by G1 (`Tenant{key: 'default'}`; the run refuses to start if that document is missing). After every batch it writes a checkpoint to `Migration{name:'tenancy-002-backfill-tenant-id'}.progress[<collection>]` = `{ lastId, processed, status, updatedAt }`, so `SIGTERM`/`kill -9`/a crashed host costs at most the batch in flight: the next run resumes from `lastId` and never re-does finished collections (`status: 'completed'`). Each batch is an `updateMany` filtered on documents that are *still* unassigned, so a row written with a real tenant in the meantime is never overwritten. A collection is marked complete only after `countDocuments` of the unassigned filter returns 0, and a mismatch fails the migration instead of marking it applied. In `TENANCY_MODE=multi` the step is a no-op (writes are already scoped), and if no tenant model is registered the migration throws rather than being recorded as done.

**G4 — compound indexes (`server/src/tenancy/indexBuilder.js`).** The new indexes are **not** declared with `schema.index()`. Each model file registers them in `server/src/tenancy/indexRegistry.js`:

```js
registerTenantIndexes('User', [
  { keys: { tenantId: 1, username: 1 }, options: { unique: true, name: 'tenant_username_uniq' } },
]);
```

Names are explicit — `tenant_<field>[_<field>]_uniq` for unique indexes, `tenant_<field>[_<field>]` otherwise — and the keys must start with `tenantId`. A unique index must use `partialFilterExpression`, never `sparse`: a compound `sparse` index still indexes documents whose optional field is missing, which would reject the second such document. The migration then builds each entry with `collection.createIndex(keys, { background })` and skips one that already exists (same keys or same name), which makes it safe to re-run.

Two rules are deliberate and are not negotiable in a pull request:

- **`syncIndexes()` / `ensureIndexes()` are never called.** They drop every index the Mongoose schema does not list, which would remove unmanaged and partial indexes on production collections. Index removal is always an explicit migration step.
- **`autoIndex` is left untouched and the compound indexes stay out of the schema.** That is how a fresh install keeps creating the existing unique indexes (`username`, `email`, `Transaction.idempotencyKey`, …) on its own, while the tenant compound indexes are created only by G4. The plain single-field `tenantId` index does come from the field definition (`index: true`).

**Dual index coexistence.** In single mode the legacy global unique indexes stay in place: after G4, `db.users.getIndexes()` shows both `username_1` (global, legacy) and `tenant_username_uniq` (compound). Nothing is dropped, so behaviour does not change for an existing install — a second account with the same username is still rejected by the global index, which is a superset of the compound one. The two only diverge once the legacy index is dropped in an explicit later step, which is what allows the same username in two tenants. The §8.2 unique index suite in the test package covers the cross-tenant/same-tenant matrix.

**Currency (K14).** Money-bearing records that had no currency field gained `currency: { type: String, default: 'TRY', uppercase: true, trim: true }`: `Bet`, `CasinoRound`, `CasinoSession`, `InhousePlaySession`, `BankDepositRequest`, `CryptoDeposit`, `ReferralCommission`. `Transaction` (`'TRY'`), `SlikairPayment` (`'EUR'`), `SlikairPayout` and `ActivityEvent` already stored one and were left alone. The default is applied when a document is written; existing rows are **not** rewritten, so a legacy row keeps no `currency` field — a hydrated Mongoose document reports `'TRY'`, but `lean()` reads and aggregation pipelines over old data see the field as missing. Anything that groups ledger amounts by currency must treat missing as `TRY` until the rows are re-saved.

## Multi-tenant settings resolution

Every setting and credential store (email, Slikair, Google, KYC/Sumsub, SMS, crypto, referral, betting display, branding, theme, modules, SEO, pages, games, currency, support, locale, timezone, ops alerts) reads the `Setting` collection through one shared resolver (`server/src/config/secretSettingsStore.js`). İP-4 scoped the collection so that each operator's rows are their own; this section is the operator-facing summary, [01](01-kurulum.md) and [05](05-api-referansi.md) cover installation and the API.

**Where a value comes from.** For every field the resolver checks, in order: the **brand** row (`scope: 'brand'`, the tenant plus that brand) → the **tenant** row (`scope: 'tenant'`, that tenant) → the **platform** row (`scope: 'platform'`, `tenantId: null`) → the legacy row without a scope → the field's `.env` value (single mode and platform fields only) → the field's default. Platform-wide keys — Telegram alert bot/chat, `alert.*`, `platform.*`, `ALERT_WEBHOOK_URL`, `ALERT_EMAIL_TO`, odds-feed key, licence key, AI key, Sentry DSN, Turnstile keys, `demoData.live.config` — are meant to live on platform rows and are the only ones allowed to fall back to `.env` in multi mode. Saved secrets are always encrypted (`enc:v1:`, AES-256-GCM); the admin view shows them masked and reports each field's `source` (`db` / `env` / `default` / `unset`).

**Cache isolation.** Values are cached in the process for 30 seconds **per tenant and brand** (`tenantId:brandId`). Saving a store's settings clears only that tenant/brand's entry, so Tenant A's change never reaches Tenant B, even under concurrent requests.

**What single mode does.** `TENANCY_MODE=single` resolves every store to exactly the value it resolved before İP-4: the default tenant's rows are read (legacy unscoped rows stay visible), a missing value still falls back to `.env`, and saving from the panel still updates the same row. No action is needed for existing installs.

**What multi mode does.** `TENANCY_MODE=multi` never falls back to `.env` for a tenant's credentials or settings: an unset field resolves to its default (empty for credentials) and is reported as `source: 'unset'`. A tenant therefore has to enter its own SMTP, Slikair, Twilio, Google, Sumsub and crypto credentials in the panel; the server's `.env` values are not shared.

**Site base URL and CORS (İP-4).** In multi mode links, redirects and callback targets (`getTenantBaseUrl`) and the platform CORS allowlist (`server/src/tenancy/corsDomains.js`) both come from the `Domain` collection:

- The base URL is the tenant's **primary, verified** `Domain` (`isPrimary: true`, a brand primary first, then the tenant's); `localhost`/`127.0.0.1` hosts get `http://`, every other host `https://`. **Without such a record the call throws `TenantScopeError`** instead of producing a `localhost` link — verify a domain before a tenant goes live, or its verification, password-reset, OAuth, Slikair and help links fail.
- The CORS list is every **verified** domain host, each expanded with its `www` ↔ apex twin, plus `http://` for local hosts; `GAME_HOST_URL` and `RAILWAY_PUBLIC_DOMAIN` are added in both modes, and a new domain is visible after at most 30 seconds of in-process cache.
- Operator origins (`Operator.allowedOrigins`) still grant access only to `/api/provider/v1/*` and Socket.IO.
- Single mode keeps the historical behaviour: base URL from the first `CLIENT_URL` entry (the `Domain` collection is not consulted) and the `CLIENT_URL` / `GAME_HOST_URL` / Railway CORS list.

**The `Setting` collection (G6).** `key` stays **globally unique in single mode** — a fresh single install still gets the historical `key_1` unique index, exactly as before. A multi-mode install never creates that index (the same key exists once per tenant) and relies on the compound unique index `{tenantId, scope, brandId, key}` (`tenant_setting_scope_brand_key_uniq`), which is registered in `server/src/tenancy/indexRegistry.js` and built by the `tenancy-005-settings` migration. Migration `0008` gives every legacy row a scope (platform keys as above, everything else as the default tenant's) and builds the compound index without dropping anything; it is idempotent and runs through `node server/scripts/migrate.js` after a backup, like G3/G4. `syncIndexes()` / `ensureIndexes()` are still never called.

## Tenant scoping of money and admin paths (İP-5)

İP-5 closes the IDOR and data-leak gaps of the multi-tenant design (spec §3 #4 and #6 and #13, §9 G-2 and G-3) on every money and management endpoint. Nothing here needs action on a `TENANCY_MODE=single` install: it keeps running exactly as before.

**`:id` lookups answer 404 across tenants (G-3).** Bank deposits, crypto withdrawal approvals, Slikair payouts, balance adjustments, KYC review, user management, promotions, player segments, chat rooms and moderation, support tickets, brands and domains, static pages, SMS/e-mail templates, reconciliation jobs, events and bets all look a record up through `tenantFilter(req, { _id })` / `scopeTenantId(req)` (`server/src/tenancy/tenantFilter.js`). In `multi` mode the query always carries the request tenant, so an id belonging to another tenant answers the same `404 NOT_FOUND` (or the endpoint's own 404 code) as an id that does not exist: never `403`, and no field of the record is returned. In `single` mode the filter is returned unchanged, so a record the G3 backfill has not stamped yet is still visible. Slikair payouts additionally verify that the player `userId` belongs to the request tenant before any balance is debited, and `sendTip` rejects a tip between players of two tenants (or into another tenant's room) with `404 RECIPIENT_NOT_FOUND` before any debit or credit.

**Platform staff are read-only on tenant routes (K23).** With `requireStaff`, a platform-scoped token may use only `GET`, `HEAD` and `OPTIONS` on a tenant route; `POST`, `PATCH` and `DELETE` answer `403 PLATFORM_READ_ONLY` and write an `AuditLog` row (actor, tenant, route, method). Tenant staff are unaffected. Manual event settlement is platform-only in multi mode (`403 PLATFORM_ONLY`).

**Default enforcement in single mode (G7).** The `tenantScoped` plugin reads the G3 record `tenancy-002-backfill-tenant-id`. When every collection in its `progress` map is `completed`, the single-mode default of `TENANCY_ENFORCEMENT` becomes `log`: queries inside a tenant context get `{ tenantId }`, unscoped queries are counted (`getScopeViolationStats()`) and logged as warnings, but nothing throws. The warnings are rate-limited to at most one line per model and operation per minute, so an upgraded install may print a few of them while the remaining unscoped call sites are fixed; set `TENANCY_ENFORCEMENT=off` to silence them entirely. An explicit `TENANCY_ENFORCEMENT` value always wins, and a install whose backfill is not recorded complete stays `off`.

**`TenantDailyStat` partner metrics (§4.3.6).** `server/src/services/tenantDailyStat.js` fills one `TenantDailyStat` row per tenant, brand, day and currency with casino turnover and GGR, realized sports GGR, bonus cost, deposits, withdrawals and player counts (active, new, depositors, FTD). The aggregation runs as platform work (`runAsPlatform`) and leaves out bot (`isBot`), seed (`isSeed`) and demo (`DEMO_*`) activity. The partner view (`getPartnerDailyMetrics`) reads only this collection, renders fewer than five active players as `"<5"` (small-cell suppression) and exposes no player identifiers or contact data.

**CI lint (`npm run lint:tenancy`).** `scripts/lint-tenancy.mjs` runs on every pull request. It fails when `runAsPlatform` appears outside its allow-list (settlement loops, `TenantDailyStat` aggregation, ledger deduplication, provisioning, start-up migrations and tests), and when a controller in `server/src/controllers` calls `findById` / `findByIdAndUpdate` / `findByIdAndDelete` with a `req.params` value instead of `tenantFilter`.

## Multi-tenant jobs and sockets (İP-7)

İP-7 runs every scheduled job once per tenant, moves all Socket.IO traffic to per-tenant rooms and keys the in-process caches by tenant. A `TENANCY_MODE=single` install needs no action: with the default tenant in place every room and cache key is that tenant's, which is the same behaviour as before; before G1 has created the default tenant, the legacy room names (`role:admin`, `room:<roomId>`), the global clients broadcast and the `g:` cache prefix stay exactly as they were.

**`TENANCY_MODE` / `TENANCY_ENFORCEMENT` and jobs/sockets.** Jobs and socket packet callbacks run inside `runWithTenant`, so the `tenantScoped` plugin and `admin:activity:read` checks see the tenant of the job or socket. `TENANCY_ENFORCEMENT=log` only logs; the campaign audience filters below always carry the tenant explicitly, so an SMS/e-mail campaign never resolves another tenant's segment even in `log` mode. In `multi` mode an unscoped room or cache key is a `TenantScopeError`, never a shared one.

**`INTERNAL_API_TOKEN`.** The demo bot scheduler calls the server's own in-house endpoint over loopback with `X-Internal-Tenant` (and `X-Internal-Token` when the variable is set). `server/src/middleware/internalTenant.js` honours that header only from a loopback address (`127.0.0.1`, `::1`) **and** with a token that equals `INTERNAL_API_TOKEN` in constant time; it is mounted immediately before host resolution, so the header wins over the `Host` lookup. When the variable is unset the middleware does nothing and the header is ignored. Bots never start in `multi`, but set the variable anyway when the internal endpoint is reachable from loopback: behind a reverse proxy on the same host every request arrives from loopback, so the token — not the address — is the real trust boundary. An unknown or non-active tenant id answers `404 TENANT_NOT_FOUND`.

**Room naming.** Every tenant-wide socket event goes through `server/src/socket/publish.js`; the rooms are `t:<tenantId>:admin`, `t:<tenantId>:clients`, `t:<tenantId>:chat:<roomId>` and `t:<tenantId>:live:<gameId>`. `user:<id>` and `event:<id>` stay global (user ids are unique, events are catalog data) and their membership stays token-checked. A socket's tenant comes from the handshake `Host` (a verified `Domain`; single mode: the default tenant); `subscribe:admin` admits only a token for that tenant whose `admin:activity:read` permission holds in tenant scope, plus the existing admin IP allowlist. `io.emit(` and the literal `role:admin` room are banned in `server/src` by `npm run lint:tenant-sockets` (`scripts/lint-tenant-sockets.mjs`), which CI runs on every pull request.

**Jobs.** `bonusExpiry`, `kycExpiry`, `cryptoWithdrawalReconcile`, `closeStaleGameSessions` and the scheduled e-mail/SMS senders iterate the **active** tenants sequentially through `forEachTenant`: each tenant gets its own context, a suspended or closed tenant is skipped, and one tenant's failure is recorded and does not stop the next. The event cleanup job (`server/src/jobs/cleanup.js`) is the only platform-scoped job: it archives finished events, finishes stale/far-future `upcoming` events and deletes old cancelled events on the shared `Event` catalog, so it runs once as `runAsPlatform('event-cleanup')` and is not part of the tenant loop.

**Caches.** Mail template lookups and the popular-games list are cached per tenant (`cacheKey(prefix)` → `t:<tenantId>:<prefix>`, or `g:<prefix>` only in single mode without a default tenant); a change made by one tenant never appears in another tenant's cache.

## Panel-managed settings

These settings are **not** in `.env` but stored in the database (`Setting` collection — `key`/`value` pairs plus the `scope`, `tenantId` and `brandId` that say who they belong to, see [Multi-tenant settings resolution](#multi-tenant-settings-resolution)) and can be changed instantly from the admin panel — no server restart needed (most values propagate with a 30-second cache delay, instantly when `invalidate*()` functions are called). Where each lives in the menu (as of 2026-10-08):

- **Settings** (`/admin/platform`, tabs **General · Modules · Currencies · Jurisdictions · Brands · SEO**)
  - *General*: **Region & Currency** (display currency, operator timezone, default visitor language), **Panel Language**, **Alert Channels** (Telegram bot token/chat id, webhook URL, alert email — `GET/PUT /admin/settings/alerts`).
  - *Modules*: on/off switch and **connection settings** of every module (see below), plus the always-on **Email Gateway** card at the end of the list (email provider settings — Mailtrap Email API or SMTP — and the gateway switch in its header).
  - *Currencies*, *Jurisdictions*, *Brands*: managers for the multi-currency, multi-jurisdiction and multi-brand subsystems (see [09](09-bilinen-kisitlar.md) for the brand isolation limit).
  - *SEO*: titles, meta tags, canonical, verification codes, GA4/GTM/Pixel ids; also serves `/robots.txt` and `/sitemap.xml`. Details: [`docs/seo-settings.md`](../seo-settings.md).
- **Personalization** (`/admin/personalization`, tabs Theme · Branding · Homepage Slider · Static Pages)
  - *Theme tokens* (`theme.<id>` keys) — primary color, accent color, and related visual values. Injected to the client via `GET /api/theme`. There are **3 ready-made presets** (`neon-cyan`, `emerald-gold`, `crimson-purple`). Source: `server/src/theme/index.js`, `presets.js`.
  - *Branding* (`branding.<id>` keys) — site name, logo, favicon, font family/file. Source: `server/src/branding/index.js`.
  - *Homepage Slider* and *Static Pages* — form-based editors (no drag-and-drop editor).
- **Products** group (business settings of each product; connection settings are in Settings → Modules):
  - **Casino Provider** (`/admin/igames`; tabs Overview · Popular games · **Bonus & Freeround** · Showcase) — popular games, aggregator bonus calls and freerounds (`CasinoPromoGrant` records).
  - **In-house Games** (`/admin/game-settings`) — per-game house edge/payout factor, min/max bet, timing, active switch, and the *allowed games* list. Each change is logged to the `changeLog` field with who/when/old-new value. Source: `server/src/models/GameSettings.js`, `server/src/services/gameSettings.js`. The 15 games themselves come with the In-house Games add-on; the King of Money slot only exposes the bet range and the active switch.
  - **Sportsbook** (`/admin/events`; tabs Active · Archived · **Categories**) — events, settlement, and which sport categories are enabled.
- **Wallet** (`/admin/wallet`, top-level menu entry; tabs Bank · Crypto · Slikair) — approvals and payment records.
- **Communication** (`/admin/communications`, menu group *Engagement*) — email and SMS templates, campaigns, automations, segments, delivery logs and test sends. The old `/admin/mail-templates` and `/admin/sms-templates` routes redirect here. Provider credentials are not on this page; they are in **Settings → Modules** (Email Gateway, SMS Gateway).
- **Module status** (`module.<id>.enabled` keys) — enable/disable from **Settings → Modules** (`client/src/pages/admin/Modules.jsx`); `PATCH /admin/modules/:id` applies instantly. A disabled module's pages are gracefully hidden from visitors with the `ModuleGate` component, the core platform is unaffected. A module must also be licensed — if `LICENSE_SERVER_URL`/`LICENSE_KEY` is not defined, all are automatically considered licensed. Module list (`server/src/modules/registry.js`): `betting`, `casino-content`, `inhouse-games`, `crypto-payment`, `slikair-payment`, `kyc-verification`, `sms-gateway`. See [03 — Module System](03-modul-sistemi.md).
- **VIP levels** — level threshold (XP), cashback percentage, one-time reward, color/icon (`/admin/vip`, `/admin/vip-levels` endpoints). Source: `server/src/models/VipLevel.js`.
- **Fake winners pool** ("Last Winners" simulation) — pool size range, win amount range, trigger frequency range, whether casino wins are included, configurable via `/admin/fake-winners` endpoints. This contains **no real users, bets, or balance changes** — it only publishes the same `winners:new` socket event as real winners. Casino wins are only shown when the relevant module (`casino-content`) is enabled. Source: `server/src/services/fakeWinners.js`. The settings live on the **Bots** page (menu group *Demo & Simulation*).

Game Tasks (`/admin/game-tasks`) still exists as a route but is no longer in the admin menu.

## Currency

There is a **single active display currency** across the site (not a per-user multi-currency wallet — `User.balance` is a single `Number` field). It can be selected from `TRY`, `USD`, `EUR` under **Settings → General → Region & Currency** (`currency.code` key in the `Setting` collection); the selection changes the symbol and locale formatting (`₺`/`tr-TR`, `$`/`en-US`, `€`/`de-DE`) and does **not** convert amounts. The public `GET /api/currency` endpoint returns the active currency and supported list. The separate **Currencies** tab manages exchange-rate records for the multi-currency subsystem (`/admin/currencies`). Source: `server/src/currency/registry.js`, `server/src/currency/index.js`, `server/src/routes/currency.js`.

## Multi-language support (i18n)

Eight dictionary files under `client/src/i18n/dictionaries/`: `tr` (default language, `DEFAULT_LOCALE = 'tr'`, also the fallback — a key not in `tr` can't be found in any language), `en`, `ko`, `th`, `es`, `ja`, `pt`, `de`. Each has the same ~2,790 keys (as of 2026-10-08; only the SMS and Communication keys have a dedicated parity test). To add a new language: add a file under `dictionaries/` + register in the `dictionaries` object in `client/src/i18n/index.js`.

The language switcher (`LanguageSwitcher`) is in the global navigation bar, so it is accessible from everywhere on the site; the default language for new visitors is set in **Settings → General → Region & Currency**. `tr` and `en` are complete. In the other six languages the player-facing screens are translated; in the admin panel roughly 470–560 strings per language (largest groups: Reconciliation, Demo Data, KYC review, Agents) are still English (as of 2026-10-08). Pages that do not use the dictionary: the static company/legal pages (`pages/company/*`, `pages/legal/*`), whose content comes from the static-page editor.

## Casino provider

The casino game catalog comes through a provider selected with the `CASINO_AGGREGATOR` environment variable (default: `igames`). Today only the Igames adapter exists (it is part of the paid Casino Content add-on, `server/src/premium/igames/igamesAdapter.js`); adding a second provider (Evolution, Pragmatic, a licensed aggregator) is writing a new adapter and registering it in `server/src/services/casinoAggregators/registry.js` — existing route/control code doesn't change.
