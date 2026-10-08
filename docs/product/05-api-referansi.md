# API Reference

All endpoints are grouped under `/api` (except the setup wizard, which is under `/install`). This document first summarizes the endpoint **groups**, then provides the **endpoint list** extracted from the real route files for each group. The ultimate source for full parameter/return types is the code itself (`server/src/routes/`), this document is a detailed map leading there.

| Group | Base path | What it contains |
|---|---|---|
| Authentication | `/api/auth` | Registration, login, session refresh, email verification, password reset |
| Web3 wallet login | `/api/auth/wallet` | Login via MetaMask/WalletConnect etc., linking wallet to account |
| Social login | `/api/auth` (google/telegram) | Login/account linking via Google and Telegram OAuth |
| 2FA | `/api/auth/2fa` | Two-factor authentication for admin accounts |
| Events | `/api/events` | Sports betting event list, details — **betting module gate** (paid Sports Betting add-on) |
| Bets | `/api/bets` | Coupon creation, bet details — **betting module gate** |
| Responsible gaming | `/api/responsible-gaming` | Player self-service limits (daily/weekly/monthly), cool-off, self-exclusion |
| Users | `/api/users` | Profile, balance, favorites/recently played, password/email change, KVKK data export, account deletion, responsible gaming limits |
| Transactions | `/api/transactions` | Simple deposit/withdrawal records |
| Promotions | `/api/promotions` | Bonus claiming, active promotions, wagering conversion |
| Casino | `/api/casino` | Aggregator-agnostic spin endpoint (currently always rejects, see below) — **casino-content module gate** |
| Igames | `/api/igames` | Casino aggregator-specific endpoints (game list, session, callback) — paid Casino Content add-on, **no module gate**; `503 MODULE_NOT_INSTALLED` if the add-on is absent |
| In-house games (core) | `/api/inhouse` | Only `GET /recent-winners` (public) — the 13 games' own endpoints moved out of the core |
| In-house provider proxy | `/api/inhouse-provider` | Launch and wallet callback of the In-house Games add-on — **inhouse-games module gate**; `503 MODULE_NOT_INSTALLED` if the add-on is absent |
| In-house provider API | `/api/provider/v1` | The game host's own API (launch token, session, the 13 games, fairness) — add-on, no module gate |
| KYC | `/api/kyc` | User KYC status, Sumsub session, document upload — **kyc-verification module gate** |
| Slikair | `/api/slikair` | Deposit initiation, own payment history, provider webhooks |
| Help | `/api/help` | AI support assistant (chatbot) |
| Crypto | `/api/crypto` | USDT-TRC20 deposit address/tracking + withdrawal request — **crypto-payment module gate** |
| Bank | `/api/bank` | Bank transfer deposit/withdrawal requests + admin approval flow |
| Support tickets | `/api/tickets` | User support tickets + admin reply/status |
| Chat | `/api/chat` | Live chat rooms + admin moderation |
| Theme | `/api/theme` | Panel-managed visual tokens (public) |
| Branding | `/api/branding` | Logo, favicon, site name, font (public) |
| Page content | `/api/pages` | Homepage section order + banners (public) |
| Static pages | `/api/static-pages` | About/Careers/Legal etc. footer pages (public) |
| Games | `/api/games` | Featured game code list (public) |
| Currency | `/api/currency` | Active/supported currencies (public) |
| Locale | `/api/locale-config` | Operator timezone/default language (public) |
| Modules | `/api/modules` | Module availability for client menu (public) |
| SEO | `/api/seo`, `/robots.txt`, `/sitemap.xml` | Public SEO configuration, robots and sitemap (see [`docs/seo-settings.md`](../seo-settings.md)) |
| Demo showcase | `/api/demo/showcase` | "Requires module" badge data for demo sites (public) |
| VIP | `/api/vip` | User's VIP level/progress and cashback |
| Admin | `/api/admin` | Users, events, games, theme/brand, roles, VIP, bots, wallet, KYC, compliance, settings, email and SMS gateways/templates — requires admin privileges and per-area permissions |
| Admin analytics | `/api/admin/analytics` | Dashboard statistics |
| Admin responsible gaming / risk / health | `/api/admin/responsible-gaming`, `/api/admin/risk`, `/api/admin/health` | Restricted players, risk engine, system health |
| Sumsub webhook | `POST /api/webhook/sumsub` | Sumsub verification result callback (outside the module gate) |
| Setup | `/install` | Single-page setup wizard (first deploy, no terminal needed) |

## Authentication model

- Access token: short-lived JWT, in the `Authorization: Bearer <token>` header.
- Refresh token: `httpOnly` cookie, new access token obtained via `/api/auth/refresh`.
- **Guest endpoints** (`/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/wallet/login`, `/auth/google`, `/auth/telegram`) go through `guestOnly` middleware — return `403 ALREADY_AUTHENTICATED` if there's an active session, a user with an open session can't call these endpoints.
- Admin endpoints require three-layer control: `requireAuth` (valid JWT) + `requireAdmin` (`role: 'admin'`) + `requirePermission('<key>')` per route (role-based permissions such as `admin:users:read`, `admin:users:balance`, `admin:casino:rtp`, `admin:settings:write`, `admin:kyc:approve`, `admin:transactions:write` — managed under **Roles** in the admin panel). `/api/auth/2fa/*` is the exception — it only has `requireAuth` middleware, admin control is done manually inside the handler (`NOT_ADMIN` 403).
- **Demo admin restriction**: admin accounts marked with `isDemoAdmin: true` are rejected by the `blockDemoAdmin` middleware (`403 DEMO_ADMIN_READONLY`) on the routes marked **[demo blocked]** below (user deletion and balance changes, event settlement, role/VIP/bot/promotion/static-page changes, game settings, currency, casino RTP/bonus/freeround, error-log clearing, chat/ticket moderation) — prevents irreversible damage in a showcase/demo environment.

## Error format

Standard errors return in the same envelope:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Username or password is incorrect" } }
```

The `code` field is for programmatic checking, `message` is user-facing text (Turkish in the current codebase).

**Note (important for operators):** This envelope is consistently applied only in newer-generation routes using `createError()` (auth, users, admin, ticket, chat, module gate). Older/simpler routes (`inhouse.js`, `casino.js`, `crypto.js`, `igames.js`, some endpoints of `bank.js`) may still return flat `{ "error": "message text" }` string errors. When writing a client/integration, you need to handle both formats (`error` string or `error.code`/`error.message` object).

## Rate limiting

The following limiters are defined with `express-rate-limit` in `server/src/middleware/rateLimit.js` (disabled in test mode — `NODE_ENV=test` or `E2E_TEST=true`). **The values are constants in that file; no environment variable changes them.**

| Limiter | Window | Limit | Applied to |
|---|---|---|---|
| `globalLimiter` | 15 min | 1200 requests/IP | All `/api/*` (except `/api/health` and `/api/health/status`) |
| `registerLimiter` | 60 min | 5 successful registrations/IP (failed requests are not counted) | `/auth/register` |
| `loginLimiter` | 15 min | 10 failed attempts/IP (successful logins are not counted) | `/auth/login`, `/auth/wallet/login` |
| `emailFlowLimiter` | 15 min | 8 requests/IP | `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password` |
| `authLimiter` | 15 min | 5 requests/IP | `/auth/wallet/nonce`, `/auth/google`, `/auth/telegram`, `/auth/telegram/widget-state` |
| `financialLimiter` | 60 min | 10 requests/IP | `/bank/deposit`, `/bank/withdraw` |
| `spinLimiter` | 60 sec | 60 requests/IP | `/casino/spin` |
| `adminLimiter` | 15 min | 50 requests/IP | `/auth/2fa/setup`, `/auth/2fa/verify`, `/auth/2fa/disable` |
| `emailTestLimiter` | 15 min | 5 requests/IP | `POST /admin/settings/email/test` |
| `igamesCallbackLimiter`, `chatLimiter`, `bonusLimiter` | — | — | Defined but not currently connected to any route |

Additionally, `/auth/login` returns `429 TOO_MANY_ATTEMPTS` after 5 failed attempts for the same account within 15 minutes (per-user login lockout, constants `LOGIN_LOCKOUT_THRESHOLD`/`LOGIN_LOCKOUT_MINUTES` in `controllers/auth.js` — not configurable by env, independent of the IP limiters).

---

## Endpoint Details

### Authentication — `/api/auth` (`routes/auth.js`)

| Method + Path | Auth | Body schema | Notes / error codes |
|---|---|---|---|
| `POST /register` | Guest (`guestOnly`) + `registerLimiter` | `registerSchema`: `username` (3-30, `[a-zA-Z0-9_]`), `email`, `password` (8-128, ≥1 uppercase + ≥1 digit), `referredBy?`, `phone?` (7-20), `dateOfBirth?` (`YYYY-MM-DD`), **`acceptedTerms: true` (required)**, **`acceptedKvkk: true` (required)**, `consentVersion?`, `turnstileToken?` (verified only when Turnstile is enabled via `TURNSTILE_SECRET_KEY` + `TURNSTILE_SITE_KEY`, off by default — `400 TURNSTILE_REQUIRED`/`TURNSTILE_FAILED`, see [02](02-yapilandirma.md); `GET /api/auth/turnstile-config` returns `{ enabled, siteKey }`) | `409 USER_EXISTS` |
| `POST /login` | Guest + `loginLimiter` | `loginSchema`: `username`, `password`, `turnstileToken?` | `429 TOO_MANY_ATTEMPTS`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_BANNED`, `403 EMAIL_NOT_VERIFIED` |
| `POST /refresh` | Public (refresh cookie) | — | `401 NO_REFRESH_TOKEN` / `USER_NOT_FOUND` / `TOKEN_REVOKED` / `INVALID_REFRESH_TOKEN` |
| `POST /logout` | Public | — | Clears refresh cookie |
| `GET /verify-email` | Public | Query: `token` | `400 INVALID_TOKEN` |
| `POST /verify-email` | Public | `emailVerifySchema`: `token` (10-200) | `400 INVALID_TOKEN` |
| `POST /resend-verification` | `emailFlowLimiter` | `resendVerificationSchema`: `email` | |
| `POST /forgot-password` | Guest + `emailFlowLimiter` | `passwordResetRequestSchema`: `email`, `turnstileToken?` (checked only when Turnstile is enabled) | |
| `POST /reset-password` | Guest + `emailFlowLimiter` | `passwordResetConfirmSchema`: `token`, `newPassword` (8-128, uppercase+digit) | `400 INVALID_TOKEN` |

### Web3 wallet login — `/api/auth/wallet` (`routes/web3Auth.js`)

| Method + Path | Auth | Body schema | Notes |
|---|---|---|---|
| `POST /nonce` | `authLimiter` | `walletNonceSchema`: `address` (`0x` + 40 hex) | Shared for both login and account linking flows, no auth required |
| `POST /login` | Guest + `loginLimiter` | `walletAuthSchema`: `address`, `signature`, `message`, `walletType?` (metamask/walletconnect/coinbase/injected/unknown), `chainId?` | Creates account automatically if new user |
| `POST /link` | User | `walletAuthSchema` (same as above) | Links wallet to existing account |
| `DELETE /` | User | — | Removes wallet link |

### Social login — `/api/auth` (`routes/socialAuth.js`, Google/Telegram)

Setup, flows, account-linking rules and troubleshooting: [`docs/social-login.md`](../social-login.md). Google login is configured from **Modules → Google Login** (DB, secret encrypted, > `.env` `GOOGLE_*`) or from `.env` alone.

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /google/state` | Public | `{ enabled }`: whether the login screen shows the Google button |
| `GET /google` | Guest + `authLimiter` | Redirects to Google OAuth URL; to `/auth/callback?error=google_not_configured` when Google login is off or unconfigured |
| `GET /google/callback` | Public | Query `linkGoogleSchema` (`code`,`state`); redirects to client with `?error=` on failure |
| `POST /google/link` | User | Returns linking URL |
| `GET /google/link/callback` | User | Links Google to account |
| `DELETE /google` | User | Removes Google link |
| `GET /telegram` | Guest + `authLimiter` | Redirects to Telegram OAuth URL |
| `GET /telegram/widget-state` | `authLimiter` | Fresh `state` + bot username for Telegram Login Widget |
| `GET /telegram/callback` | Public | Query `linkTelegramSchema` (`id`,`auth_date`,`hash`,`state`,...) |
| `POST /telegram/link` | User | Returns linking URL |
| `GET /telegram/link/callback` | User | Links Telegram to account |
| `DELETE /telegram` | User | Removes Telegram link |
| `GET /accounts` | User | List of linked social accounts |

### 2FA — `/api/auth/2fa` (`routes/admin2fa.js`)

Only `requireAuth` is applied; admin control is done inside the handler (`403 NOT_ADMIN` if `role !== 'admin'`).

| Method + Path | Auth | Body | Notes |
|---|---|---|---|
| `POST /setup` | User + `adminLimiter` | `{ password }` | Generates QR + 10 backup codes; `400 ALREADY_ENABLED`, `401 WRONG_PASSWORD` |
| `POST /verify` | User + `adminLimiter` | `{ token }` | Accepts TOTP or backup code; `400 NOT_SETUP`, `401 INVALID_TOKEN` |
| `POST /disable` | User + `adminLimiter` | `{ password, token }` | `400 NOT_ENABLED`, `401 WRONG_PASSWORD`/`INVALID_TOKEN` |
| `GET /status` | User | — | `{ enabled, isAdmin }` |

### Events — `/api/events` (`routes/events.js`) — **betting module gate** (data comes from the paid Sports Betting add-on)

If the module is disabled, all these endpoints return `503 { error: { code: 'MODULE_DISABLED', module: 'betting' } }`.

| Method + Path | Auth |
|---|---|
| `GET /` | Public — query `sport`, `status` (`upcoming`/`live`/`all`), `country`, `league`, `search`, `page`, `limit`, `full`; upcoming limited to the next 30 days, first page cached 5 s |
| `GET /summary` | Public — sport → league tree with counts (`{ sports, prioritySport, priorityCountry }`) |
| `GET /countries` | Public — distinct countries, optional `?sport=` |
| `GET /:id` | Public |

Response shapes and payload rules are documented with the Sports Betting add-on.

### Bets — `/api/bets` (`routes/bets.js`) — **betting module gate**

| Method + Path | Auth | Body schema |
|---|---|---|
| `POST /` | User | `placeBetSchema`: `selections[]` (1-10 items, each with `eventId`, `marketType`, `oddId`, `oddLabel`, `oddValue` ≥1.01, `eventLabel`), `type`: `single`|`combo`, `stake` (1-50000) |
| `GET /:id` | User | — |

### Users — `/api/users` (`routes/users.js`) — all require user login

| Method + Path | Body schema | Notes |
|---|---|---|
| `GET /me` | — | Profile |
| `GET /me/bets` | — | |
| `GET /me/transactions` | — | |
| `GET /me/preferences` / `PUT /me/preferences` | — | |
| `GET /me/favorites` | — | |
| `POST /me/favorites/toggle` | `gameActivitySchema`: `gameId` (1-200), `kind`: `igames`|`inhouse` | |
| `GET /me/recently-played` / `POST /me/recently-played` | `gameActivitySchema` (for POST) | |
| `PUT /me/password` | `changePasswordSchema`: `currentPassword`, `newPassword` (8-128, uppercase+digit) | |
| `PUT /me/email` | `changeEmailSchema`: `password`, `newEmail` | |
| `GET /me/data-export` | `dataExportRequestSchema`: `password` | KVKK art.11 self-service data export |
| `DELETE /me` | `accountDeletionRequestSchema`: `password`, `confirm: true` | Account deletion request with 30-day "regret" period |
| `POST /me/cancel-deletion` | — | Cancels deletion request |
| `GET /me/limits` / `PUT /me/limits` | — | Responsible gaming (loss/deposit/session) limits |

### Transactions — `/api/transactions` (`routes/transactions.js`) — requires user login

| Method + Path | Body schema |
|---|---|
| `POST /deposit` | `depositSchema`: `amount` (10-50000) |
| `POST /withdraw` | `withdrawSchema`: `amount` (20-50000), `iban` (TR + 24 digits, mod-97 checksum), `fullName` (3-100), `confirmForfeit?` (default `false`). If `amount` exceeds the withdrawable part while a bonus is active → `409 ACTIVE_BONUS_LOCK`; repeat with `confirmForfeit: true` to forfeit it — see [10 — Bonus and Wagering](10-bonus-ve-cevrim.md) |

### Responsible gaming — `/api/responsible-gaming` (`routes/responsibleGaming.js`) — requires user login

Player page: `/responsible-gaming` (`client/src/pages/ResponsibleGaming.jsx`).

| Method + Path | Body |
|---|---|
| `GET /me/status` | — (limits + daily/weekly/monthly stats, cool-off/exclusion state) |
| `PUT /me/limits/deposit`, `PUT /me/limits/loss`, `PUT /me/limits/wager` | `setLimitSchema`: `amount` (≥0, `0` removes the limit), `limitType?` `daily`\|`weekly`\|`monthly` (default daily) |
| `PUT /me/limits/session` | `setSessionLimitSchema` |
| `POST /me/cool-off` | `activateCoolOffSchema` |
| `POST /me/self-exclusion` | `activateSelfExclusionSchema` |

Admin side: `/api/admin/responsible-gaming` (permission `admin:rg:manage`) — `GET /players` (`admin:rg:read`), `POST /restrict/:userId`, `DELETE /restrict/:userId` (both audited as `RESPONSIBLE_GAMING_RESTRICT`/`_LIFT`), `GET /audit` (`admin:rg:read`).

### Promotions — `/api/promotions` (`routes/promotions.js`)

| Method + Path | Auth |
|---|---|
| `GET /` | Public |
| `GET /referral-settings` | Public — `{ enabled, commissionRate }` |
| `GET /my-wagerings` | User |
| `POST /:id/claim` | User |
| `POST /:id/wagerings/:wid/convert` | User |

### Casino — `/api/casino` (`routes/casino.js`) — **casino-content module gate**

| Method + Path | Auth | Body | Error codes |
|---|---|---|---|
| `POST /spin` | User + `spinLimiter` | `spinSchema`: `{ bet, gameId?, gameTitle?, provider? }` | **Always** `400 USE_PROVIDER_CALLBACK` (after body validation and `INVALID_BET`/`NOT_FOUND` checks) |

Since a 2026 security fix the endpoint no longer accepts client-submitted payouts and does not record spins at all: results arrive only through the aggregator's signed callback (`POST /api/igames/callback`). The route is kept for compatibility; its error message points to the real flows (provider callback for aggregator games, game-host for in-house games).

### Igames (casino aggregator) — `/api/igames` (`server/src/premium/igames/igames.js`, Casino Content add-on) — **no module gate**

If the add-on is absent, every path answers `503 { error: 'MODULE_NOT_INSTALLED' }`. If no casino content provider API token is configured (neither `PALACE_API_TOKEN` nor the panel), all endpoints return `503 { error: 'Igames Casino API henüz yapılandırılmadı' }` — the check accepts a token saved from the admin panel as well as the environment variable (fixed 2026-10-03). Note: This route group is **outside** the `requireCasinoContent` gate — even if the casino-content module is disabled, Igames endpoints continue to work (only the generalized `/api/casino/spin` endpoint and casino catalog page are disabled).

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /agent/info` | User | Agent balance/RTP/currency |
| `POST /agent/rtp` | Admin | `{ rtp }` between 75-95 |
| `POST /agent/callback-test` | Admin | |
| `POST /user/create` | User | `{ name }` 2-50 characters |
| `POST /user/info` | User | `{ user_code }` |
| `POST /user/deposit` | Admin | `{ user_code, amount }` |
| `POST /user/withdraw` | Admin | `{ user_code, amount }` |
| `POST /user/withdraw-all` | Admin | `{ user_code }` |
| `POST /providers` | Public | Static catalog, open to guests |
| `POST /games` | Public | `{ provider_id, lang }` |
| `POST /game/all` | Public | |
| `GET /popular-games` | Public | The operator-selected "Popular Games" `game_code` list (empty array if none selected) |
| `GET /game/popular` | Public | Most played in last 7 days (aggregated) |
| `POST /game/url` | User | `{ user_code, provider_id, game_code|game_symbol, win_ratio?, language?, return_url? }` |
| `POST /game/launch` | User | Transfers local balance to Igames and opens game; `409 SESSION_ACTIVE`, `400 INSUFFICIENT_BALANCE`, `503 IGAMES_BALANCE_UNAVAILABLE`, `400 IGAMES_DEPOSIT_FAILED` |
| `POST /game/close` | User | Closes session and pulls balance back |
| `GET /game/session` | User | Active session check |
| `POST /game/online` | User | |
| `POST /game/call-config` | User | |
| `POST /bonus/start` | Admin | `{ gplay_id, set_point?, type?, memo? }` |
| `POST /bonus/cancel` | Admin | `{ call_id }` |
| `POST /transactions` | User | `{ start_time, end_time, offset, limit }` |
| `POST /round-details` | User | `{ transaction_id }` |
| `POST /statistics/user` | Admin | |
| `POST /callback` | Provider (special `callback-token` header) | Processes Bet/Win/BetCancel/BonusCall/Deposit/Withdraw; round_id-based replay prevention (5min TTL) |

### In-house games

The 13 games' logic no longer lives in the core. The core keeps one public endpoint; everything else belongs to the paid In-house Games add-on (`server/src/premium/inhouse-provider`).

**Core — `/api/inhouse` (`routes/inhouse.js`)**

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /recent-winners` | Public | `{ winners }` — first-load data for the "Last Winners" strip (live updates arrive as the `winners:new` socket event) |

**Add-on — operator side, `/api/inhouse-provider` (`inhouseProviderProxy.js`) — inhouse-games module gate**

| Method + Path | Auth | Notes |
|---|---|---|
| `POST /launch` | User + risk check + responsible-gaming check | Body `{ gameId, currency?, language? }`; proxies to the provider with the server-side API secret and returns `{ url }` (60-second launch token to the game host). `400 INSUFFICIENT_BALANCE` when the balance is 0 |
| `POST /callback` | Provider (HMAC `x-signature` + `x-timestamp` headers; persistent idempotency) | Wallet callback (`debit` / `settle` / `balance`); updates `User.balance`, writes `Transaction` + `CasinoRound` |

**Add-on — provider side, `/api/provider/v1` (`engine/routes/*`) — used by the game host and by operators, no module gate**

| Method + Path | Auth | Notes |
|---|---|---|
| `POST /launch` | Operator API key (`X-Api-Key-Id` + secret) + IP allowlist | Body `{ externalPlayerId, gameId, currency?, language? }` → `{ url }` |
| `POST /session` | Launch token | Exchanges the 60-second launch token (single use) for a ~15-minute session token; origin must be allowed for the operator |
| `POST /session/refresh` | Bearer session token | Token-based refresh, capped at 6 hours since the first session |
| `PUT /settings/:gameId` | Operator API key + IP allowlist | Operator updates its own game settings (house edge, limits, timing) |
| `POST /games/dice/roll`, `/games/limbo/play`, `/games/wheel/spin`, `/games/plinko/drop`, `/games/keno/play`, `/games/baccarat/deal`, `/games/dragontiger/deal` | Provider session | Instant games (one request = bet + result) |
| `GET /games/mines/info`; `POST /games/mines/start`, `/reveal`, `/cashout` | Provider session | Mines |
| `POST /games/hilo/start`, `/guess`, `/cashout` | Provider session | Hi-Lo |
| `POST /games/blackjack/deal`, `/hit`, `/stand`, `/double` | Provider session | Blackjack |
| `POST /games/videopoker/deal`, `/draw` | Provider session | Video Poker |
| `GET /fairness/active`, `POST /fairness/rotate`, `GET /fairness/round/:roundId`, `GET /fairness/rounds` | Provider session | Provably-fair seed state, rotation and round verification |

Crash and Roulette are multiplayer games and run over Socket.IO namespaces, not REST. These paths were `/api/inhouse/<game>/*` in earlier versions and were moved to `/api/provider/v1/games/<game>/*`.

**Provably-fair verification** is served by the in-house provider's own API, not by `/api/inhouse`: `GET/POST /api/provider/v1/fairness/{active,rotate,round/:roundId,rounds}` with the player's game-session token — the protocol is documented with the In-house Games add-on.

### KYC — `/api/kyc` (`routes/kyc.js`) — **kyc-verification module gate**, all require user login

| Method + Path | Notes |
|---|---|
| `GET /status` | User's KYC status plus `provider` (`manual` or `sumsub`) and `enabled`, from the panel's KYC settings |
| `POST /init-session` | Sumsub only (`400 PROVIDER_NOT_SUMSUB` otherwise): creates the applicant and returns an SDK token |
| `POST /documents` | Manual provider: multipart upload, field `documents`, up to 6 files; puts the submission in the admin review queue |

`POST /api/webhook/sumsub` (`routes/sumsubWebhook.js`) receives Sumsub's result; it is mounted outside the module gate and requires the `x-app-timestamp` header (rejected with `401` if missing or older than 5 minutes). KYC approval sets `kycStatus`/`kycVerified` on the user; while the `kyc-verification` module is enabled, player withdrawals (`POST /api/bank/withdraw`, `/api/transactions/withdraw`, `/api/crypto/withdraw-request`) require an approved KYC and otherwise answer `403 KYC_REQUIRED` (`details.kycStatus`); deposits and bets are not gated (`server/src/middleware/kycGate.js`).

### Slikair — `/api/slikair` (`routes/slikair.js`)

| Method + Path | Auth | Notes |
|---|---|---|
| `POST /deposit` | `slikair-payment` module gate + User | `slikairDepositSchema`; starts a deposit and returns the redirect |
| `GET /my-payments` | User | The user's own payment history |
| `POST /webhook/payin`, `POST /webhook/payout` | None (no signature) | Provider notifications. Every `succeeded` notification is cross-checked against Slikair's get-status API before crediting (see [09](09-bilinen-kisitlar.md)) |

### Help — `/api/help` (`routes/help.js`)

| Method + Path | Auth | Body | Notes |
|---|---|---|---|
| `POST /chat` | User | `{ messages: [{role, content}, ...] }` | RAG-grounded AI support assistant; returns a fixed "under maintenance" response if `AI_HELP_API_KEY` is not defined |

### Crypto — `/api/crypto` (`routes/crypto.js`) — all require user login — **crypto-payment module gate**

| Method + Path | Body | Notes |
|---|---|---|
| `GET /deposit-address` | — | User-specific TRC20 USDT address; returns `503` if `CRYPTO_SEED_PHRASE` not set |
| `POST /check-deposit` | — | Queries TronGrid, converts incoming USDT to the site currency at `USDT_TRY_RATE`; small amounts (default under 100 USDT) are credited automatically, larger ones wait for admin approval. Risk and responsible-gaming checks apply |
| `POST /withdraw-request` | `withdrawRequestSchema`: `{ address, usdtAmount, confirmForfeit? }` (min 5 USDT; address `T` + 33 characters) | Creates a withdrawal; small amounts (default under 15 USDT) are processed automatically, larger ones wait for admin approval. `409 ACTIVE_BONUS_LOCK` when an active bonus locks part of the balance and `confirmForfeit` is not sent |
| `GET /withdraw-preview` | — | Withdrawable/locked balance breakdown, hot-wallet balance, `minWithdraw` |
| `GET /settings` | — | **Admin only** — current `CRYPTO_SETTINGS` |
| `GET /hot-wallet-balance` | — | **Admin only** — hot wallet USDT/TRX balance (`503 CRYPTO_WALLET_NOT_CONFIGURED` without wallet keys) |

### Bank — `/api/bank` (`routes/bank.js`)

| Method + Path | Auth | Body schema |
|---|---|---|
| `GET /info` | User | — |
| `POST /deposit` | User + `financialLimiter` | `depositSchema` |
| `POST /withdraw` | User + `financialLimiter` | `withdrawSchema` |
| `GET /requests` | User | — |
| `GET /admin/pending` | Admin (`admin:bank:read`) | — |
| `PATCH /admin/pending/:id/approve` | Admin (`admin:bank:write`) | — |
| `PATCH /admin/pending/:id/reject` | Admin (`admin:bank:write`) | `adminRejectSchema` |

### Support tickets — `/api/tickets` (`routes/ticket.js`) — no module gate

| Method + Path | Auth | Body schema |
|---|---|---|
| `POST /mine` | User | `createTicketSchema`: `subject` (1-200), `message` (1-4000) |
| `GET /mine` | User | — |
| `GET /mine/:id` | User | — |
| `POST /mine/:id/reply` | User | `replySchema`: `message` (1-4000) |
| `GET /` | Admin | — |
| `GET /:id` | Admin | — |
| `POST /:id/reply` | Admin (demo admin blocked) | `replySchema` |
| `PATCH /:id/status` | Admin (demo admin blocked) | `setStatusSchema`: `status`: `open`|`in_progress`|`resolved`|`closed` |

### Chat — `/api/chat` (`routes/chat.js`) — no module gate

| Method + Path | Auth | Body schema |
|---|---|---|
| `GET /rooms` | User | — |
| `GET /rooms/:slug/messages` | User | — |
| `GET /admin/rooms` | Admin | — |
| `POST /admin/rooms` | Admin (demo blocked) | `createRoomSchema`: `name`, `description?`, `icon?`, `color?`, `isPublic?`, `minLevel?`, `maxUsers?`, `slowMode?` (0-300 sec), `rainSettings?` |
| `PATCH /admin/rooms/:id` | Admin (demo blocked) | `updateRoomSchema` (adds `isActive?`, `rain*` flat fields to the above) |
| `DELETE /admin/rooms/:id` | Admin (demo blocked) | — |
| `POST /admin/rooms/:id/ban` | Admin (demo blocked) | `banUserSchema`: `userId` |
| `DELETE /admin/rooms/:id/ban/:userId` | Admin (demo blocked) | — |
| `POST /admin/rooms/:id/mute` | Admin (demo blocked) | `muteUserSchema`: `userId`, `duration` (1-86400 sec), `reason?` |
| `DELETE /admin/rooms/:id/mute/:userId` | Admin (demo blocked) | — |
| `DELETE /admin/messages/:id` | Admin (demo blocked) | — |
| `GET /admin/rooms/:id/moderation` | Admin | — |

### Visual/static endpoints (all public, `Cache-Control: public, max-age=30`)

| Method + Path | Route file | Returns |
|---|---|---|
| `GET /api/theme` | `theme.js` | `{ vars }` — CSS tokens |
| `GET /api/branding` | `branding.js` | `{ values }` — logo/favicon/site name/font |
| `GET /api/pages/home` | `pages.js` | `{ content }` — homepage section order + banner overrides |
| `GET /api/static-pages` | `staticPages.js` | `{ pages }` — footer page list |
| `GET /api/static-pages/:slug` | `staticPages.js` | `{ page }` — `404 NOT_FOUND` if disabled/missing |
| `GET /api/games/featured` | `games.js` | `{ codes }` — featured game codes |
| `GET /api/currency` | `currency.js` | `{ active, supported }` |
| `GET /api/locale-config` | `localeConfig.js` | `{ timezone, defaultLocale }` — operator timezone and default visitor language |
| `GET /api/modules` | `modules.js` | `{ modules: [{ id, title, description, available }] }` — license source doesn't leak |
| `GET /api/seo` | `seo/http.js` | Public SEO configuration |
| `GET /robots.txt`, `GET /sitemap.xml` | `seo/http.js` | Generated from Settings → SEO; sitemap is 404 while `noindex` is on |
| `GET /api/demo/showcase` | `demo/showcase.js` | "Requires module" badge data |

### SPA rotaları (API dışı) — gerçek 404

Non-API `GET` istekleri `app.get('*')` içinde ele alınır (`server/src/seo/http.js`).

| Request | Response |
|---|---|
| Existing route (`/`, `/bahis`, `/events/:id`, `/admin/users`, …) | `200` + `index.html` (SEO tags injected per Settings → SEO). Deep links keep working on refresh |
| Unknown route | `404` + `X-Robots-Tag: noindex` + `Cache-Control: no-cache` + `index.html` — the SPA renders its own 404 page (`client/src/pages/NotFound.jsx`). No canonical/SEO tags are injected |
| Anything, when the route manifest is missing/unreadable | `200` + `index.html` (fail-open; the server logs the reason once, on the first request) |
| Anything, with `ROUTE_404_REPORT_ONLY=1` | `200` + `index.html`, unknown paths only logged |

The route list is **not** written by hand: the client build parses
`client/src/App.jsx` and writes `client/dist/routes.json`
(`client/scripts/emit-route-manifest.mjs`); the server matches `req.path`
against it (`shared/route-matcher.js`). Adding a page to `App.jsx` is
therefore enough — no manifest edit, no server restart for the list.

### VIP — `/api/vip` (`routes/vip.js`)

| Method + Path | Auth |
|---|---|
| `GET /status` | User — current VIP level/progress |
| `GET /cashback` | User — paged history of the user's cashback transactions (`page`, `limit` ≤ 50) |

### Admin — `/api/admin` (`routes/admin.js`) — all require `requireAuth` + `requireAdmin` + a per-route `requirePermission(...)` + audit log

Destructive/financial endpoints additionally apply `blockDemoAdmin` (marked below as **[demo blocked]**) — `isDemoAdmin: true` accounts get `403 DEMO_ADMIN_READONLY` on these endpoints. Permission keys are in parentheses where one key covers an area.

**Users** (`admin:users:read` / `write` / `balance`)
- `GET /users`, `GET /users/facets`, `GET /users/kpis` (filter options and KPI figures of the Users page), `POST /users` (`createUserSchema`; an `admin` created without `roles` gets the built-in `admin` role — all permissions except role management)
- `PATCH /users/:id` (`updateUserAdminSchema`: `isActive`, `kycVerified`, ...)
- `DELETE /users/:id` **[demo blocked]**
- `PATCH /users/:id/balance` **[demo blocked]** (`updateBalanceSchema`: `amount` (positive), `type`: `credit`|`debit`|`bonus`, `note?`, `requestId?` (UUID; a repeated request with the same id returns the first result with `duplicate: true` and does not change the balance))
- `GET /users/:id/referrals`, `GET /users/:id/referral-tree` (3-level read-only tree), `GET /users/:id/transactions`

**Events** (`admin:events:*`; Sports Betting add-on data)
- `GET /events/archived`
- `POST /events` (`createEventSchema`: `sport`,`league`,`homeTeam`,`awayTeam`,`startTime`,`markets[]`)
- `PATCH /events/:id`
- `POST /events/:id/settle` **[demo blocked]** (`settleEventSchema`: `results` — oddId or array of oddIds, `score?`)

**Statistics / activity / demo data**
- `GET /stats`, `GET /activity`, `GET /queues/counts`
- `GET /queues/pending-finance` (`admin:transactions:read`, `limit` default 5, max 50) → `{ items: [{ ref, kind: crypto_deposit|crypto_withdraw|bank_deposit|bank_withdraw, userId, username, amount, usdtAmount, risk: high|vip|medium|low, status, createdAt }] }`, longest waiting first — feeds the Dashboard "Pending finance" card
- `GET /demo-data/status`, `POST /demo-data/:category/load`, `POST /demo-data/:category/clear`, `POST /demo-data/live/start`, `POST /demo-data/live/stop` (`admin:demo-data:manage`)
- `GET /tasks`, `PATCH /tasks/:id` (Game Tasks; the page is no longer in the menu)

**Casino** (`admin:casino:*`)
- `GET /casino/stats`, `GET /users/:id/casino-rounds`
- Igames (admin): `GET /igames/agent/info`, `POST /igames/user/create`, `POST /igames/game/launch`, `POST /igames/game/list`, `GET /igames/test-users`, `POST /igames/withdraw-test-users`, `POST /igames/rtp` **[demo blocked]**, `GET /igames/online-plays`, `GET /igames/summary`
- Bonus & Freeround (`admin:casino:bonus`, every grant/cancel is audit-logged as `CASINO_PROMO_GRANT`/`CASINO_PROMO_CANCEL`): `GET /igames/promo/config`, `GET /igames/promo/grants`, `POST /igames/bonus/start` **[demo blocked]** (`gplay_id`, `set_point`, `memo?`), `POST /igames/bonus/cancel` **[demo blocked]** (by the recorded grant id), `POST /igames/freeround/create` **[demo blocked]** (`user_id`, `provider_id`, `game_code`, `rounds`, `bet`, ...), `POST /igames/freeround/cancel` **[demo blocked]**, `GET /igames/bonus/config`
- Per-module settings (`server/src/routes/adminModuleSettings.js`, mounted under `/api/admin`): `GET/PATCH /igames/module-settings`, `GET/PATCH /igames/credentials`, `GET/PATCH /inhouse-provider/settings`, `POST /inhouse-provider/rotate-key`, `GET/PATCH /odds-provider/settings`, `POST /odds-provider/suggest-token`, `POST /odds-provider/token`, `POST /odds-provider/token/retry-push` — each answers `503 MODULE_NOT_INSTALLED` when its add-on is absent

**Error log** (`admin:audit:read`)
- `GET /errors/recent`, `GET /errors/status`, `POST /errors/clear` **[demo blocked]**

**Theme / Branding / Pages / Game showcase**
- `GET /theme`, `PATCH /theme` (`updateThemeSchema`: `id`, `value`)
- `GET /theme/presets`, `POST /theme/apply-preset` (`applyThemePresetSchema`: `id`)
- `GET /branding`, `PATCH /branding` (`updateBrandingSchema`: `id`, `value` — image/font fields `data:` URL, size limit varies by definition)
- `GET /pages/home`, `PATCH /pages/home` (`updateHomeContentSchema`: `sectionOrder[]`, `banners[]`)
- `GET /games/featured`, `PATCH /games/featured` (`updateFeaturedGamesSchema`: `codes[]`, max 60)

**Game settings (RTP/limit/house edge — the 13 in-house games)**
- `GET /game-settings`
- `PATCH /game-settings/:gameId` **[demo blocked]** (`updateGameSettingsSchema` — game-dependent `*MinBet`/`*MaxBet`/`*HouseEdgePercent`/`*PayoutFactor`/`*Mult` fields, `isActive?`, `reason?`)
- `POST /game-settings/:gameId/simulate-rtp` (`simulateRtpSchema` — only blackjack/video poker fields + `hands?` 20000-500000)

**Settings** (`admin:settings:read` / `write`)
- Alerts: `GET /settings/alerts`, `PUT /settings/alerts`, `POST /settings/alerts/test`
- Email Gateway (SMTP/Mailgun; UI: Settings → Modules → Email Gateway): `GET /settings/email`, `PUT /settings/email` (password stored encrypted, needs `OPERATOR_SECRET_ENCRYPTION_KEY`; `gatewayEnabled` selects panel values vs. `.env` SMTP), `POST /settings/email/test` (rate limited, sends a real mail; optional `to`)
- System email templates — `/mail-templates`: `GET /`, `GET /stats`, `GET /events`, `GET /logs`, `POST /preview`, `GET /:id` (read); `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/send` (write; only `scheduled` templates can be sent from the panel, event templates are sent by the platform). Details: [`docs/mail-templates.md`](../mail-templates.md)
- SMS Gateway — `/sms`: provider `GET /settings`, `PATCH /settings`, `POST /settings/test` (dry connection test, sends nothing), `POST /test-send` (`{ to, message }`, sends a real SMS); senders `GET /senders`, `GET /senders/gate`, `POST /senders`, `PATCH /senders/:id`, `DELETE /senders/:id`; `GET /logs`; templates `GET /templates`, `POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`, `POST /templates/:id/send`. Details: [`docs/sms-gateway/README.md`](../sms-gateway/README.md)
- Slikair credentials: `GET /slikair/settings`, `PUT /slikair/settings`
- Google login (UI: Settings → Modules → Google Login): `GET /settings/google-auth`, `PUT /settings/google-auth` (`enabled`, `clientId`, `clientSecret` stored encrypted, `redirectUri`; the response adds `defaultRedirectUri` and `active`)
- SEO: `GET /settings/seo`, `PUT /settings/seo` (`seoSettingsSchema`)
- Timezone / default language: `GET`/`PUT /settings/timezone`, `GET`/`PUT /settings/default-locale`
- Currency: `GET /currency`, `PUT /currency` **[demo blocked]** (`updateCurrencySchema`: `code` — only defined currencies)

**Roles / Permissions** (`admin:roles:*`)
- `GET /roles`
- `POST /roles` **[demo blocked]** (`createRoleSchema`: `name` (lowercase/digit/_), `displayName`, `description?`, `permissions[]?`, `priority?` 0-99)
- `PUT /roles/:id` **[demo blocked]** (`updateRoleSchema`)
- `DELETE /roles/:id` **[demo blocked]**
- `GET /permissions`, `GET /me/permissions` (the caller's own permissions)
- `POST /users/:id/roles` **[demo blocked]** (`assignRoleSchema`: `roleId`)
- `DELETE /users/:id/roles/:roleId` **[demo blocked]**

**Promotions** (`admin:settings:*`)
- `GET /promotions`, `POST /promotions` **[demo blocked]** (`upsertPromotionSchema`), `DELETE /promotions/:id` **[demo blocked]**

**VIP levels**
- `GET /vip-levels`
- `POST /vip-levels` **[demo blocked]** (`upsertVipLevelSchema`: `level` 1-20, `name`, `xpRequired`, `cashbackPercent?`, `rewardAmount?`, `rewardType?`, `benefits[]?`, `color?`, `icon?`, `isActive?`)
- `DELETE /vip-levels/:level` **[demo blocked]**

**Bot players**
- `GET /bots`
- `POST /bots` **[demo blocked]** (`createBotSchema`: `username`,`email`,`password?`,`botType?`,`behavior?`,`limits?`,`notes?`)
- `GET /bots/:id`
- `PATCH /bots/:id` **[demo blocked]** (`updateBotSchema`)
- `DELETE /bots/:id` **[demo blocked]**
- `POST /bots/start-all` **[demo blocked]**, `POST /bots/stop-all` **[demo blocked]**

**Fake winners (cosmetic, uses no real balance)**
- `GET /fake-winners`
- `PUT /fake-winners` **[demo blocked]** (`updateFakeWinnersSchema`: `enabled?`,`poolMin?`,`poolMax?`,`intervalMinMs?`,`intervalMaxMs?`,`amountMin?`,`amountMax?`,`includeCasinoWins?`,`includeBettingWins?` — min/max pairs are cross-validated)

**Static pages (footer)**
- `GET /static-pages`
- `PUT /static-pages/:slug` **[demo blocked]** (`upsertStaticPageSchema`: `title`,`intro?`,`sections[]`)
- `PATCH /static-pages/:slug/toggle` **[demo blocked]** (`toggleStaticPageSchema`: `isEnabled`)

**KYC** (`admin:kyc:read` / `approve`)
- `GET /kyc-settings`, `PUT /kyc-settings`, `POST /kyc-settings/test` (provider choice and Sumsub credentials, connection test)
- `GET /kyc/submissions`, `GET /kyc/stats`, `GET /kyc/submissions/:id`
- `POST /kyc/submissions/:id/approve`, `/reject`, `/under-review`

**Wallet — crypto, bank, Slikair, referral** (`admin:transactions:*`)
- `GET /crypto/pending-deposits`, `/crypto/pending-withdrawals`, `/crypto/all-deposits`, `/crypto/all-withdrawals`, `/crypto/stats`, `/crypto/tx-detail/:id`, `/crypto/tx-verify/:txHash`, `GET /bank/stats`
- `PUT /crypto/settings` (`updateCryptoSettingsSchema`)
- `POST /crypto/deposits/:id/approve`, `/reject`; `POST /crypto/withdrawals/:id/approve`, `/reject`
- `GET /slikair/payments`, `/slikair/payments/:id`, `/slikair/payouts`, `/slikair/payouts/:id`, `/slikair/stats`; `POST /slikair/payouts` (also behind the `slikair-payment` module gate)
- `GET /referral/settings`, `PUT /referral/settings` (`admin:referral:*`)

**Sub-routers mounted under `/api/admin`**
- `/modules` — `GET /` (module list: status + licence combined), `PATCH /:id` (toggle with `{ enabled: boolean }`), `POST /refresh` (refreshes module + licence cache) (`controllers/modules.js`)
- `/agents` — agent (reseller) CRUD, player assignment, fund transfer (`admin:agent:read` / `write`)
- `/audit` — `GET /logs`, `/stats`, `/export`, `/target/:targetType/:targetId`
- `/reconciliation` — `GET /jobs`, `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/start`, `GET /jobs/:id/items`, `POST /items/:itemId/resolve`, `GET /stats`
- `/segments` — player segments: CRUD, `POST /:id/compute`, `GET /:id/players`, `GET /:id/stats`, `POST /update-stats`
- `/currencies`, `/brands`, `/jurisdictions` — CRUD managers of the multi-currency (incl. `POST /convert`, rate updates), multi-brand (incl. domains) and multi-jurisdiction (incl. `POST /eligibility`) subsystems; the Settings tabs use them
- `/health` — `GET /` (overview), `/services`, `/system`, `/metrics`, `POST /check`
- `/api/admin/risk` (separate mount) — risk dashboard, findings, player risk, rules CRUD (`admin:risk:*`)

### Admin analytics — `/api/admin/analytics` (`routes/analytics.js`) — admin

| Method + Path |
|---|
| `GET /overview` |
| `GET /revenue-overview` |
| `GET /users` |
| `GET /casino` |
| `GET /finance` |
| `GET /sports` |

### Setup — `/install` (`routes/install.js`) — not under `/api`

| Method + Path | Notes |
|---|---|
| `GET /install` | Build-free single-page setup form; `404` `{"error":"Kurulum zaten tamamlanmış"}` once an admin exists |
| `GET /install/api/status` | DB connection + setup status (`{ dbConnected, adminExists, needsInstall }`), always answers |
| `POST /install/api/run` | Creates first admin + site settings, generates `.env` content; `409 ALREADY_INSTALLED` once an admin exists (the `GET /install` page answers `404`), `400` on validation error |

### Health / utility endpoints (inside `app.js`, no route file)

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /api/health` | Public | `{ ok: true, env }` — uptime monitoring |
| `GET /api/health/status` | Public | `{ api, db, igames, oddsSource, payment, onlineCount, sync }` — deep health, not cached |
| `GET /api/health/risk` | Public | Non-sensitive risk-engine counters (`statusStats`, `levelStats`, `evaluationStats`) |
| `GET /api/img?url=` | Public | Hotlink-protected CDN image proxy (only accepts `image/*` content-type) |