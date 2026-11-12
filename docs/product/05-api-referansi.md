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
| In-house games (core) | `/api/inhouse` | Only `GET /recent-winners` (public) — the 15 games' own endpoints moved out of the core |
| In-house provider proxy | `/api/inhouse-provider` | Launch and wallet callback of the In-house Games add-on — **inhouse-games module gate**; `503 MODULE_NOT_INSTALLED` if the add-on is absent |
| In-house provider API | `/api/provider/v1` | The game host's own API (launch token, session, the 15 games, fairness) — add-on, no module gate |
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
- Admin endpoints require three-layer control: `requireAuth` (valid JWT) + `requireAdmin` (`role: 'admin'`) + `requirePermission('<key>')` per route (role-based permissions such as `admin:users:read`, `admin:users:balance`, `admin:casino:rtp`, `admin:settings:write`, `admin:kyc:approve`, `admin:transactions:write` — managed under **Roles** in the admin panel). `requireAdmin` means "staff" only; since PR-3 (V5) every route that uses it also carries a specific `requirePermission` (the static test `server/test/security/admin-route-permissions.test.js` enforces this), with one exception: `POST /api/auth/2fa/{setup,verify,disable}` use `requireAuth` + `requireAdmin` without a specific permission (2FA enrolment is for any staff member); `GET /api/auth/2fa/status` is `requireAuth` only. When `ADMIN_ALLOWED_IPS` is set, `requireAdmin` also applies the IP allowlist, so every staff endpoint (not just `/api/admin/*`) answers `403 ADMIN_IP_NOT_ALLOWED` to other addresses.
- **CORS:** in `TENANCY_MODE=single` the platform API accepts the static origin list (`CLIENT_URL`, `GAME_HOST_URL`, Railway). In `TENANCY_MODE=multi` the list is generated from the `Domain` collection — every **verified** host plus its `www` ↔ apex twin — together with `GAME_HOST_URL` and `RAILWAY_PUBLIC_DOMAIN`; an unverified domain is never allowed. The list is cached in-process for 30 s. Operator origins (`Operator.allowedOrigins`) are accepted only on `/api/provider/v1/*` and Socket.IO, in both modes. See [Multi-tenant settings, site URL and CORS](#multi-tenant-settings-site-url-and-cors).
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

## Multi-tenant settings, site URL and CORS

Under `TENANCY_MODE=multi` (İP-4) the API resolves settings per tenant and generates links and CORS from the `Domain` collection. Single-mode installs are unaffected.

**Settings and credentials are per tenant.** A request's tenant comes from its verified domain or staff session; the admin settings endpoints — the panel-managed settings under **Settings**, **Modules**, **Personalization** and the crypto/Slikair/Google/KYC/SMS cards listed in the [Admin](#admin--apiadmin) section — read and write that tenant's rows in the `Setting` collection, with an optional brand layer for brand-scoped stores (branding, theme, pages). Precedence is brand → tenant → platform → legacy unscoped row; platform rows and ops-alert channels (`/settings/alerts`) stay global. In multi mode an unset credential never falls back to the server `.env`, so an endpoint backed by an unconfigured credential fails or reports it as unconfigured rather than using another party's account. Store view responses report each field's `source` (`db`, `env`, `default` or `unset`); saved secrets are returned masked. Details: [02 — Configuration § Multi-tenant settings resolution](02-yapilandirma.md#multi-tenant-settings-resolution).

**Site URL comes from `Domain`.** Verification e-mails (`/auth/register`, `/auth/resend-verification`, `/auth/forgot-password`), OAuth returns (`/auth/google/callback`, `/auth/telegram/callback`), the Slikair webhook/redirect URLs and the AI support assistant's referer all use the tenant's `getTenantBaseUrl`: the tenant's primary **verified** `Domain`, `http://` for `localhost`/`127.0.0.1` and `https://` otherwise. In multi mode a tenant without a verified primary domain makes these fail with `TenantScopeError` — the API never emits a `localhost` link for a live tenant. In single mode the first `CLIENT_URL` origin is used, exactly as before; the start-up/healthcheck configuration check requires `CLIENT_URL` only in single mode, so a multi install without it passes a go-live check.

**CORS is generated from `Domain`.** In multi mode the allowlist is every verified domain host (expanded with its `www`/apex twin, `http` for local hosts) plus `GAME_HOST_URL` and `RAILWAY_PUBLIC_DOMAIN`, cached for 30 s. A domain that is added but not verified is not allowed. Provider CORS (`/api/provider/v1/*`, Socket.IO) still uses `Operator.allowedOrigins`.

---

## Endpoint Details

### Authentication — `/api/auth` (`routes/auth.js`)

| Method + Path | Auth | Body schema | Notes / error codes |
|---|---|---|---|
| `POST /register` | Guest (`guestOnly`) + `registerLimiter` | `registerSchema`: `username` (3-30, `[a-zA-Z0-9_]`; may not start with `tg_`, `google_` or `web3_`, case-insensitive: those prefixes are reserved for social-login and wallet accounts, `400 VALIDATION_ERROR`), `email`, `password` (8-128, ≥1 uppercase + ≥1 digit), `referredBy?`, `phone?` (7-20), `dateOfBirth?` (`YYYY-MM-DD`), **`acceptedTerms: true` (required)**, **`acceptedKvkk: true` (required)**, `ageConfirmed?` (boolean; `true` writes `ageConfirmedAt`, omitted = account registers but cannot open casino games until `POST /auth/age-confirm`), `consentVersion?`, `turnstileToken?` (verified only when Turnstile is enabled via `TURNSTILE_SECRET_KEY` + `TURNSTILE_SITE_KEY`, off by default — `400 TURNSTILE_REQUIRED`/`TURNSTILE_FAILED`, see [02](02-yapilandirma.md); `GET /api/auth/turnstile-config` returns `{ enabled, siteKey }`) | `409 USER_EXISTS`, `422 AGE_NOT_ELIGIBLE` (`dateOfBirth` is under 18) |
| `POST /login` | Guest + `loginLimiter` | `loginSchema`: `username`, `password`, `turnstileToken?` | For an account with 2FA enabled the response is `{ requires2fa: true, challengeToken }` only (no token, cookie or user); finish with `POST /2fa/login`. Other accounts get `{ accessToken, user, amr }`. A successful login invalidates the user's other sessions. `429 TOO_MANY_ATTEMPTS`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_BANNED`, `403 EMAIL_NOT_VERIFIED` |
| `POST /refresh` | Public (refresh cookie) | — | `401 NO_REFRESH_TOKEN` / `USER_NOT_FOUND` / `TOKEN_REVOKED` / `INVALID_REFRESH_TOKEN` |
| `POST /logout` | Public | — | Clears refresh cookie |
| `GET /verify-email` | Public | Query: `token` | `400 INVALID_TOKEN` |
| `POST /verify-email` | Public | `emailVerifySchema`: `token` (10-200) | `400 INVALID_TOKEN` |
| `POST /resend-verification` | `emailFlowLimiter` | `resendVerificationSchema`: `email` | |
| `POST /forgot-password` | Guest + `emailFlowLimiter` | `passwordResetRequestSchema`: `email`, `turnstileToken?` (checked only when Turnstile is enabled) | |
| `POST /reset-password` | Guest + `emailFlowLimiter` | `passwordResetConfirmSchema`: `token`, `newPassword` (8-128, uppercase+digit) | `400 INVALID_TOKEN` (the DB keeps only a SHA-256 hash of the e-mailed token) |
| `POST /2fa/login` | `loginLimiter` (no `guestOnly`) | `twoFactorLoginSchema`: `challengeToken` (from a login response with `requires2fa`), `token` (TOTP or backup code, 6-20 chars) | Second step of login for 2FA accounts. Success: `{ accessToken, user, amr }` + refresh cookie. `401 INVALID_CHALLENGE`, `409`/`401 CHALLENGE_USED`, `401 INVALID_2FA`, `403 ACCOUNT_BANNED`, `429 TOO_MANY_ATTEMPTS` (challenge: 5 guesses, 5 min, single use; account: 10 wrong codes / 15 min) |
| `POST /age-confirm` | User login | `ageConfirmSchema`: `confirmed: true` (required), `dateOfBirth?` (`YYYY-MM-DD`) | Writes `ageConfirmedAt`, and `ageVerifiedAt` as well when `dateOfBirth` proves 18+. `422 AGE_NOT_ELIGIBLE` when `dateOfBirth` is under 18 (nothing is written). Response: `{ message, ageConfirmedAt, ageVerifiedAt, verified, ageConsent }`. Until this succeeds, `POST /api/igames/game/launch` and `POST /api/inhouse-provider/launch` return `403 AGE_CONFIRMATION_REQUIRED` (see [09](09-bilinen-kisitlar.md)) |

### Web3 wallet login — `/api/auth/wallet` (`routes/web3Auth.js`)

| Method + Path | Auth | Body schema | Notes |
|---|---|---|---|
| `POST /nonce` | `authLimiter` | `walletNonceSchema`: `address` (`0x` + 40 hex) | Shared for both login and account linking flows, no auth required |
| `POST /login` | Guest + `loginLimiter` | `walletAuthSchema`: `address`, `signature`, `message`, `walletType?` (metamask/walletconnect/coinbase/injected/unknown), `chainId?` | Creates account automatically if new user. 2FA accounts get `{ requires2fa: true, challengeToken }` (finish with `POST /api/auth/2fa/login`); otherwise the session invalidates the user's other sessions |
| `POST /link` | User | `walletAuthSchema` (same as above) | Links wallet to existing account |
| `DELETE /` | User | — | Removes wallet link |

### Social login — `/api/auth` (`routes/socialAuth.js`, Google/Telegram)

Setup, flows, account-linking rules and troubleshooting: [`docs/social-login.md`](../social-login.md). Google login is configured from **Modules → Google Login** (DB, secret encrypted, > `.env` `GOOGLE_*`) or from `.env` alone.

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /google/state` | Public | `{ enabled }`: whether the login screen shows the Google button |
| `GET /google` | Guest + `authLimiter` | Redirects to Google OAuth URL; to `/auth/callback?error=google_not_configured` when Google login is off or unconfigured |
| `GET /google/callback` | Public | Query `linkGoogleSchema` (`code`,`state`); redirects to client with `?error=` on failure: `google_email_unverified` (Google did not verify the e-mail, `403 GOOGLE_EMAIL_UNVERIFIED`), `google_link_required` (a local account with that e-mail exists and is not already linked to this Google id, or either side's e-mail is unverified: `409 GOOGLE_LINK_REQUIRED`; sign in with the password and link from the profile). 2FA accounts redirect to `/auth/callback?requires2fa=1#challenge=<token>` |
| `POST /google/link` | User | Returns linking URL |
| `GET /google/link/callback` | User | Links Google to account; marks the account e-mail verified only when the (Google-verified) e-mail equals the account e-mail |
| `DELETE /google` | User | Removes Google link |
| `GET /telegram` | Guest + `authLimiter` | Redirects to Telegram OAuth URL |
| `GET /telegram/widget-state` | `authLimiter` | Fresh `state` + bot username for Telegram Login Widget |
| `GET /telegram/callback` | Public | Query `linkTelegramSchema` (`id`,`auth_date`,`hash`,`state`,...); `hash` must be 64 hex characters (constant-time HMAC check), `auth_date` numeric, at most 24 h old and at most 5 min in the future (`400 INVALID_TELEGRAM_DATA` / `EXPIRED_TELEGRAM_AUTH`). Finds the account by `telegramId` only (never by username); no match → a new account `tg_<username>`, or `tg_<username>_<last 6 of the id>` / a random suffix when taken. 2FA accounts redirect with `requires2fa=1#challenge=<token>` like Google |
| `POST /telegram/link` | User | Returns linking URL (the `state` is bound to the caller) |
| `GET /telegram/link/callback` | User | Links Telegram to account; same widget and `auth_date` checks; a `state` bound to another user → `400 INVALID_STATE`. Needs a Bearer token, which the Telegram widget redirect does not carry, and there is no client screen: linking an existing account is a support task today |
| `DELETE /telegram` | User | Removes Telegram link |
| `GET /accounts` | User | List of linked social accounts |

### 2FA — `/api/auth/2fa` (`routes/admin2fa.js`)

`POST /setup`, `/verify` and `/disable` require `requireAuth` + `requireAdmin` (staff only, `403 FORBIDDEN` for players; IP allowlist applies); `GET /status` only `requireAuth`. The TOTP secret and backup codes are stored encrypted (`enc:v1:`, `OPERATOR_SECRET_ENCRYPTION_KEY`); setup fails closed without the key. The login-time second step is `POST /api/auth/2fa/login` (see Authentication above).

| Method + Path | Auth | Body | Notes |
|---|---|---|---|
| `POST /setup` | Staff + `adminLimiter` | `{ password }` | Generates QR + 10 backup codes; `400 ALREADY_ENABLED`, `401 WRONG_PASSWORD` |
| `POST /verify` | Staff + `adminLimiter` | `{ token }` | Accepts TOTP or backup code; `400 NOT_SETUP`, `401 INVALID_TOKEN` |
| `POST /disable` | Staff + `adminLimiter` | `{ password, token }` | `400 NOT_ENABLED`, `401 WRONG_PASSWORD`/`INVALID_TOKEN` |
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
| `POST /deposit` | `depositSchema`: `amount` (10-50000). **Demo only:** credits the balance without a payment, so it answers `404 DEMO_FEATURE_DISABLED` unless `DEMO_INSTANT_DEPOSIT=true` and `TENANCY_MODE` is not `multi` |
| `POST /withdraw` | `withdrawSchema`: `amount` (20-50000), `iban` (TR + 24 digits, mod-97 checksum), `fullName` (3-100), `confirmForfeit?` (default `false`). If `amount` exceeds the withdrawable part while a bonus is active → `409 ACTIVE_BONUS_LOCK`; repeat with `confirmForfeit: true` to forfeit it — see [10 — Bonus and Wagering](10-bonus-ve-cevrim.md). `409 IGAMES_SESSION_OPEN` while the user has an open (`active`/`closing`) Igames session, `409 IGAMES_SESSION_REVIEW` while that session is under staff review |

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
| `POST /:id/claim` | User — credit, `bonus` ledger row (key `promo_claim_<promo>_<user>`), wagering record and `claimedBy` are written in one transaction; `404 NOT_FOUND` for a missing/inactive promotion, `409 ALREADY_CLAIMED` (standard error body) when already claimed |
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
| `GET /agent/info` | Staff (`admin:casino:read`) | Agent balance/RTP/currency |
| `POST /agent/rtp` | Staff (`admin:casino:rtp`) | `{ rtp }` between 75-95 |
| `POST /agent/callback-test` | Staff (`admin:casino:write`) | |
| `POST /user/create` | Staff (`admin:casino:write`) | `{ name }` 2-50 characters; players get their provider account through `/game/launch` |
| `POST /user/info` | User | The caller's own provider account (`400` if the caller has none); a body `user_code` other than the caller's gets `403 FORBIDDEN` |
| `POST /user/deposit` | Staff (`admin:users:balance`) | `{ user_code, amount }` (amount > 0). Provider-side only: moves no platform balance and writes no ledger row. Audited (`igames_provider_deposit`, every call incl. refusals). `409 IGAMES_SESSION_OPEN` while the user has an open (`active`/`closing`) session; `400` on invalid input |
| `POST /user/withdraw` | Staff (`admin:users:balance`) | `{ user_code, amount }`. Provider-side only, audited (`igames_provider_withdraw`). `409 IGAMES_SESSION_OPEN` with an open session, except a flagged `closing` session whose withdrawal is already stored: then allowed and the confirmed amount is recorded on the session (`metadata.staffProviderWithdrawals`, counted into the settle cap) |
| `POST /user/withdraw-all` | Staff (`admin:users:balance`) | `{ user_code }`. Same rules as `/user/withdraw` (audited as `igames_provider_withdraw_all`) |
| `POST /session/:id/resolve` | Staff (`admin:users:balance`) | Resolves a session flagged `needsReconciliation`: `{ action: 'retry'\|'settle'\|'mark_stray_recovered', amount?, confirm?, override?, note }` (note 3-500 characters, `400 NOTE_REQUIRED` / `NOTE_TOO_LONG`; `amount` a finite JSON number or absent, else `400 INVALID_AMOUNT`). Reads the provider balance first (`409 IGAMES_PROVIDER_BALANCE_UNAVAILABLE`); provider > 0 → only `retry` (`409 IGAMES_PROVIDER_HOLDS_BALANCE` for settle, `409 IGAMES_RETRY_NOT_POSSIBLE` once a withdrawal is stored); provider 0 → only `settle` with the total withdrawn as `amount` (`409 IGAMES_PROVIDER_EMPTY` for retry, `400 CONFIRM_REQUIRED` above `expectedAmount` without `confirm: true`); `409 IGAMES_SESSION_NOT_FLAGGED`. Settle cap: transfer + max(Σ winning round nets since the launch, provider-confirmed withdrawn amount incl. recorded staff withdrawals) + 0.01; above it `400 AMOUNT_ABOVE_CAP`, unless a super_admin sends `override: true` with a note of ≥ 10 characters (`403 CAP_OVERRIDE_FORBIDDEN` for others, `400 OVERRIDE_NOTE_REQUIRED`); these three carry `error.details.cap`. Reason-specific rules: `deposit_uncertain` retry withdraws but keeps the session flagged (`finalBalance: null`) and a later settle below the withdrawn amount is `400 AMOUNT_BELOW_WITHDRAWN`; `stray_deposit` settles only with `amount: 0` (`400 STRAY_DEPOSIT_SETTLE_ZERO`) and the settle marks the stray deposit recovered. `mark_stray_recovered` targets a closed, reconcile-refunded launch (no provider read, no money moved, note ≥ 10 characters else `400 NOTE_REQUIRED`, other sessions `409 IGAMES_NOT_A_STRAY_RISK`): sets `strayDepositRecoveredAt` so later closes and the sweep stop treating it as a possible stray deposit. Credit: `balance + amount` (provider-model session) or `max(balance, amount)` (legacy session). Every attempt is audited as `igames_session_resolve` with its outcome |
| `POST /providers` | Public | Static catalog, open to guests |
| `POST /games` | Public | `{ provider_id, lang }` |
| `POST /game/all` | Public | |
| `GET /popular-games` | Public | The operator-selected "Popular Games" `game_code` list (empty array if none selected) |
| `GET /game/popular` | Public | Most played in last 7 days (aggregated) |
| `POST /game/url` | Staff (`admin:casino:read`) | `{ provider_id, game_code|game_symbol, language?, return_url?, user_code? }` — opens a game on the caller's own provider account without a session or transfer (a different `user_code` gets `403`); a client `win_ratio` is ignored. Players use `/game/launch` |
| `POST /game/launch` | User | Moves the whole local balance to the provider and opens the game. One transaction debits the balance, writes a `casino_transfer` row (key `igames_launch_<sessionId>`) and creates the session; then the provider deposit is called. Answers: `409 SESSION_ACTIVE` (previous session could not be closed, also while it is flagged or its deposit is undecided), `400 INSUFFICIENT_BALANCE`, `409 BALANCE_CHANGED` (balance changed while launching), `400 IGAMES_DEPOSIT_FAILED` / `503 IGAMES_BALANCE_UNAVAILABLE` (provider refused; refunded with a `reversal` row), `502 IGAMES_DEPOSIT_PENDING` (deposit outcome unknown; not refunded, decided automatically within minutes), `409 SESSION_CHANGED` (the deposit arrived after the session was decided elsewhere; contact support) |
| `POST /game/close` | User | Closes the session in two durable phases (`active → closing`, provider withdraw-all, then one credit with one `casino_return` row keyed `igames_close_<sessionId>`): `balance + withdrawn` for sessions opened after the F3 update (`balanceModel: 'provider'`, row amount = withdrawn), `max(balance, withdrawn)` for older ones. `409 IGAMES_CLOSE_IN_PROGRESS` while another close holds the lease or the launch deposit is still undecided |
| `GET /game/session` | User | Open session check (`active` or `closing`) |
| `POST /game/online` | Staff (`admin:casino:read`) | Agent-wide |
| `POST /game/call-config` | Staff (`admin:casino:read`) | Agent-wide |
| `POST /bonus/start` | Staff (`admin:casino:bonus`) | `{ gplay_id, set_point?, type?, memo? }` |
| `POST /bonus/cancel` | Staff (`admin:casino:bonus`) | `{ call_id }` |
| `POST /transactions` | Staff (`admin:casino:read`) | `{ start_time, end_time, offset, limit }` — agent-wide |
| `POST /round-details` | Staff (`admin:casino:read`) | `{ transaction_id }` |
| `POST /statistics/user` | Staff (`admin:reports:read`) | |
| `POST /callback` | Provider (special `callback-token` header; source IP restricted when `IGAMES_CALLBACK_ALLOWED_IPS` is set, see [02](02-yapilandirma.md)) | A source outside the allowlist gets `401 {code:1001}` before the token check, nothing written. `authenticate` reports the open session's provider balance (transfer + Σ round net), `0` without an open session. During a session opened after the F3 update (and for a user with no open session) money callbacks do **not** change the platform balance: the ledger row goes on `walletId: 'igames'` with the provider balances, and the `balance:update` socket event carries `{ balance, activeIgamesBalance }` (`null` without a session). Sessions opened before it still move the balance. Callbacks with no open session earn no bonus wagering, XP or responsible-gaming stats. Bet (1), Win (2), BetCancel (16) and BonusCall (32) write `CasinoRound`, a ledger row (`casino_bet`/`casino_win`/`casino_cancel`, key `igames_<user_code>_<round_id>_<trans_type>`) and a durable receipt (`<user_code>:<round_id>:<trans_type>`, 30-day TTL; legacy `<round_id>:<trans_type>` receipts still count) in one transaction; a duplicate gets the stored answer and moves nothing. Deposit (4) / Withdraw (8) and unknown types answer `{code:0}` and move nothing. Refusals: `400 {code:1002}` missing `user_code`, `{code:1005}` negative/zero/non-decimal amount, `{code:1003}` amount > 100000, `{code:1004}` negative pre/post balance (no receipt is written for a refusal); `500 {code:1000}` when the transaction fails. Unknown `user_code`: `{code:0}`, nothing written |

### In-house games

The 15 games' logic no longer lives in the core. The core keeps one public endpoint; everything else belongs to the paid In-house Games add-on (`server/src/premium/inhouse-provider`).

**Core — `/api/inhouse` (`routes/inhouse.js`)**

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /recent-winners` | Public | `{ winners }` — each entry has a random `id`, a masked `username` (first 2 characters + `***`) and no `userId`; first-load data for the "Last Winners" strip (live updates arrive as the `winners:new` socket event) |

**Add-on — operator side, `/api/inhouse-provider` (`inhouseProviderProxy.js`) — inhouse-games module gate**

| Method + Path | Auth | Notes |
|---|---|---|
| `POST /launch` | User + age gate + risk check + responsible-gaming check | Body `{ gameId, currency?, language? }`; proxies to the provider with the server-side API secret and returns `{ url }` (60-second launch token to the game host). `400 INSUFFICIENT_BALANCE` when the balance is 0. `403 AGE_CONFIRMATION_REQUIRED` when the account has no age consent yet (open it with `POST /api/auth/age-confirm`). Also opens or continues the play session and sets `req.inhouseSessionRestarted` when the session cap was reached |
| `POST /callback` | Provider (HMAC `x-signature` + `x-timestamp` headers; persistent idempotency) | Wallet callback (`debit` / `settle` / `balance`); updates `User.balance`, writes `Transaction` + `CasinoRound`. A `debit` also runs the **session cap** and the **per-round responsible-gaming** check before the money moves: `403 { approved: false, reason: 'SESSION_LIMIT_REACHED' \| 'RESPONSIBLE_GAMING_LIMIT' \| 'ACCOUNT_RESTRICTED' }` (`settle` and `balance` are never blocked). The provider turns these into `400 BET_REJECTED`; there is no retry, so no retry storm |

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
| `GET /fairness/active`, `POST /fairness/rotate`, `GET /fairness/round/:roundId`, `GET /fairness/rounds` | Provider session | Provably-fair seed state, rotation and round verification (`/fairness/rounds` lists `roundId, gameId, bet, payout, nonce, seedHash, createdAt, verifiable`, plus `mode` and `x` for King of Money) |

Crash and Roulette are multiplayer games and run over Socket.IO namespaces, not REST. These paths were `/api/inhouse/<game>/*` in earlier versions and were moved to `/api/provider/v1/games/<game>/*`.

**Provably-fair verification** is served by the in-house provider's own API, not by `/api/inhouse`: `GET/POST /api/provider/v1/fairness/{active,rotate,round/:roundId,rounds}` with the player's game-session token — the protocol is documented with the In-house Games add-on.

### KYC — `/api/kyc` (`routes/kyc.js`) — **kyc-verification module gate**, all require user login

| Method + Path | Notes |
|---|---|
| `GET /status` | User's KYC status plus `provider` (`manual` or `sumsub`) and `enabled`, from the panel's KYC settings |
| `POST /init-session` | Sumsub only (`400 PROVIDER_NOT_SUMSUB` otherwise): creates the applicant and returns an SDK token |
| `POST /documents` | Manual provider: multipart upload, field `documents`, up to 6 files; puts the submission in the admin review queue |
| `GET /documents/:id` | Streams one uploaded document (`inline`, `Cache-Control: private, no-store`, `nosniff`, `Content-Security-Policy: sandbox`). Allowed for the document's owner, or an admin with `admin:kyc:read` from an allowed IP; anyone else gets `403` whether or not the document exists. `400 INVALID_DOCUMENT_ID`, `404` when the record or file is missing. Files live in `KYC_UPLOAD_DIR`; the old `/uploads/kyc/*` static URLs no longer exist |

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
| `POST /withdraw-request` | `withdrawRequestSchema`: `{ address, usdtAmount, confirmForfeit? }` (min 5 USDT; address `T` + 33 characters) | Creates a withdrawal; small amounts (default under 15 USDT) are processed automatically, larger ones wait for admin approval. The balance is deducted atomically before any USDT leaves the hot wallet. `409 ACTIVE_BONUS_LOCK` when an active bonus locks part of the balance and `confirmForfeit` is not sent; `400 INSUFFICIENT_BALANCE` when concurrent requests already used the balance; `500` when the transfer could not be sent (balance refunded); `502` when the broadcast result is unknown (`txHash` returned, the request stays `processing` and is reconciled against the chain). A successful automatic withdrawal answers with `status: 'processing'`; it becomes `completed` once the transaction is confirmed on chain. `409 IGAMES_SESSION_OPEN` / `IGAMES_SESSION_REVIEW` while an Igames session is open or under review |
| `GET /withdraw-preview` | — | Withdrawable/locked balance breakdown, hot-wallet balance, `minWithdraw` |
| `GET /settings` | — | **Staff** (`admin:settings:read`) — current `CRYPTO_SETTINGS` (refreshed from the stored settings, 30 s TTL) |
| `GET /hot-wallet-balance` | — | **Staff** (`admin:settings:read`) — hot wallet USDT/TRX balance (`503 CRYPTO_WALLET_NOT_CONFIGURED` without wallet keys) |

### Bank — `/api/bank` (`routes/bank.js`)

| Method + Path | Auth | Body schema |
|---|---|---|
| `GET /info` | User | — |
| `POST /deposit` | User + `financialLimiter` | `depositSchema` |
| `POST /withdraw` | User + `financialLimiter` | `withdrawSchema`; `409 IGAMES_SESSION_OPEN` / `IGAMES_SESSION_REVIEW` while an Igames session is open or under review |
| `GET /requests` | User | — |
| `GET /admin/pending` | Admin (`admin:bank:read`) | — |
| `PATCH /admin/pending/:id/approve` | Admin (`admin:bank:write`) | — (`409 INSUFFICIENT_BALANCE` when approving a withdrawal the player's balance no longer covers; `409 ALREADY_PROCESSED` when a parallel approve/reject won) |
| `PATCH /admin/pending/:id/reject` | Admin (`admin:bank:write`) | `adminRejectSchema` |

### Support tickets — `/api/tickets` (`routes/ticket.js`) — no module gate

| Method + Path | Auth | Body schema |
|---|---|---|
| `POST /mine` | User | `createTicketSchema`: `subject` (1-200), `message` (1-4000) |
| `GET /mine` | User | — |
| `GET /mine/:id` | User | — |
| `POST /mine/:id/reply` | User | `replySchema`: `message` (1-4000) |
| `GET /` | Admin (`admin:support:read`) | — |
| `GET /:id` | Admin (`admin:support:read`) | — |
| `POST /:id/reply` | Admin (`admin:support:write`, demo admin blocked) | `replySchema` |
| `PATCH /:id/status` | Admin (`admin:support:write`, demo admin blocked) | `setStatusSchema`: `status`: `open`|`in_progress`|`resolved`|`closed` |

### Chat — `/api/chat` (`routes/chat.js`) — no module gate

| Method + Path | Auth | Body schema |
|---|---|---|
| `GET /rooms` | User | — |
| `GET /rooms/:slug/messages` | User | — |
| `GET /admin/rooms` | Admin (`admin:support:read`) | — |
| `POST /admin/rooms` | Admin (demo blocked) | `createRoomSchema`: `name`, `description?`, `icon?`, `color?`, `isPublic?`, `minLevel?`, `maxUsers?`, `slowMode?` (0-300 sec), `rainSettings?` |
| `PATCH /admin/rooms/:id` | Admin (demo blocked) | `updateRoomSchema` (adds `isActive?`, `rain*` flat fields to the above) |
| `DELETE /admin/rooms/:id` | Admin (demo blocked) | — |
| `POST /admin/rooms/:id/ban` | Admin (demo blocked) | `banUserSchema`: `userId` |
| `DELETE /admin/rooms/:id/ban/:userId` | Admin (demo blocked) | — |
| `POST /admin/rooms/:id/mute` | Admin (demo blocked) | `muteUserSchema`: `userId`, `duration` (1-86400 sec), `reason?` |
| `DELETE /admin/rooms/:id/mute/:userId` | Admin (demo blocked) | — |
| `DELETE /admin/messages/:id` | Admin (demo blocked) | — |
| `GET /admin/rooms/:id/moderation` | Admin (`admin:support:read`) | — |

Every other `/admin/*` chat route requires `admin:support:write`. `DELETE /admin/messages/:id` is the only way to delete another user's message; over the socket (`chat:delete`) a user can delete only their own (`403 FORBIDDEN`).

Socket events `chat:tip` and `chat:rain` require a client `requestId` (≤ 128 characters, `REQUEST_ID_REQUIRED`), scoped to the sender; a repeat returns the first record and moves no money (`chat:tipSent` / `chat:rainCreated` echo it). Tip: one transaction; the sender passes the withdrawal gates (KYC `KYC_REQUIRED`/`KYC_CHECK_UNAVAILABLE`, risk `RISK_BLOCKED`/`RISK_RESTRICTED`, responsible gaming `ACCOUNT_RESTRICTED`/`LIMIT_EXCEEDED`, `WITHDRAWAL_LOCKED`), cannot spend bonus money under active wagering (`INSUFFICIENT_BALANCE`) and is refused when banned, muted or the room is inactive (`BANNED`, `MUTED`, `ROOM_INACTIVE`). Rain: staff only (DB `role: 'admin'` + `admin:users:balance`; players get `chat:error`), funded from the creator's withdrawable balance, split in cents among unique active users in the room (creator excluded, at most 50), room limits and cooldown (`RAIN_COOLDOWN`) applied inside the transaction.

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

**Demo feature flags.** `GET /api/admin/demo-flags` returns the effective `{ bots, fakeWinners, instantDeposit, data }` switches the admin client reads to show or hide its demo entries (any authenticated admin, no permission key). The `/demo-data/*`, `/bots*` and `/fake-winners` routes are gated by their own `DEMO_*` flag **before** `requirePermission`: with the flag off — the default, and always while `TENANCY_MODE=multi` — they answer `404 DEMO_FEATURE_DISABLED` to everyone. Source: `server/src/config/tenancy.js`.

**Users** (`admin:users:read` / `write` / `balance`)
- `GET /users`, `GET /users/facets`, `GET /users/kpis` (filter options and KPI figures of the Users page), `POST /users` (`createUserSchema`; usernames starting with `tg_` / `google_` / `web3_` are refused like in registration; an `admin` created without `roles` gets the built-in `admin` role — all permissions except role management; creating an `admin` needs `admin:roles:write` and the caller must hold every permission of the role being granted, else `403 ROLE_GRANT_FORBIDDEN`; `500 DEFAULT_ADMIN_ROLE_MISSING` when the built-in role is missing; `GET /users` never returns tokens, 2FA secrets or backup codes)
- `PATCH /users/:id` (`updateUserAdminSchema`: `isActive`, `kycVerified`, ...)
- `DELETE /users/:id` **[demo blocked]**
- `PATCH /users/:id/balance` **[demo blocked]** (`updateBalanceSchema`: `amount` (positive), `type`: `credit`|`debit`|`bonus`, `note?`, `requestId?` (UUID; a repeated request with the same id returns the first result with `duplicate: true` and does not change the balance))
- `GET /users/:id/referrals`, `GET /users/:id/referral-tree` (3-level read-only tree), `GET /users/:id/transactions` (`admin:transactions:read`; last 20 rows with `walletId`: Casino Content rows on `igames` record provider-side money and do not change `balance`)

**Events** (`admin:events:*`; Sports Betting add-on data)
- `GET /events/archived`
- `POST /events` (`createEventSchema`: `sport`,`league`,`homeTeam`,`awayTeam`,`startTime`,`markets[]`)
- `PATCH /events/:id`
- `POST /events/:id/settle` **[demo blocked]** (`settleEventSchema`: `results` — oddId or array of oddIds, `score?`)

**Statistics / activity / demo data**
- `GET /stats`, `GET /activity`, `GET /queues/counts`
- `GET /demo-flags` — effective `{ bots, fakeWinners, instantDeposit, data }` switches; any authenticated admin, no permission key, the admin client hides its demo entries from it
- `GET /queues/pending-finance` (`admin:transactions:read`, `limit` default 5, max 50) → `{ items: [{ ref, kind: crypto_deposit|crypto_withdraw|bank_deposit|bank_withdraw, userId, username, amount, usdtAmount, risk: high|vip|medium|low, status, createdAt }] }`, longest waiting first — feeds the Dashboard "Pending finance" card
- `GET /demo-data/status`, `POST /demo-data/:category/load`, `POST /demo-data/:category/clear`, `POST /demo-data/live/start`, `POST /demo-data/live/stop` (`admin:demo-data:manage`; first gated by **`DEMO_DATA=true`**, else `404 DEMO_FEATURE_DISABLED`)
- `GET /tasks`, `PATCH /tasks/:id` (Game Tasks; the page is no longer in the menu)

**Casino** (`admin:casino:*`)
- `GET /casino/stats`, `GET /users/:id/casino-rounds`
- Igames (admin): `GET /igames/agent/info`, `POST /igames/user/create`, `POST /igames/game/launch`, `POST /igames/game/list`, `GET /igames/test-users`, `POST /igames/withdraw-test-users` (**`admin:users:balance`**, not a casino permission: it credits platform balances; body `requestId?` (8-64 `[A-Za-z0-9_-]`, else `400 INVALID_REQUEST_ID`; generated when absent) — credits exactly the provider-confirmed withdrawn amount per user as one `casino_return` row keyed `igames_sweep_<requestId>_<userId>`, skips users with an open session, answers `{ requestId, totalUsersChecked, successCount, errorCount, totalWithdrawn, needsReview, results }` with per-user `status` `success` / `skipped` / `error` / `already_credited` / `needs_review`; every user is audited as `igames_test_user_sweep`), `POST /igames/rtp` **[demo blocked]**, `GET /igames/online-plays`, `GET /igames/summary`
- Bonus & Freeround (`admin:casino:bonus`, every grant/cancel is audit-logged as `CASINO_PROMO_GRANT`/`CASINO_PROMO_CANCEL`): `GET /igames/promo/config`, `GET /igames/promo/grants`, `POST /igames/bonus/start` **[demo blocked]** (`gplay_id`, `set_point`, `memo?`), `POST /igames/bonus/cancel` **[demo blocked]** (by the recorded grant id), `POST /igames/freeround/create` **[demo blocked]** (`user_id`, `provider_id`, `game_code`, `rounds`, `bet`, ...), `POST /igames/freeround/cancel` **[demo blocked]**, `GET /igames/bonus/config`
- Per-module settings (`server/src/routes/adminModuleSettings.js`, mounted under `/api/admin`): `GET/PATCH /igames/module-settings`, `GET/PATCH /igames/credentials`, `GET/PATCH /inhouse-provider/settings`, `POST /inhouse-provider/rotate-key`, `GET/PATCH /odds-provider/settings`, `POST /odds-provider/suggest-token`, `POST /odds-provider/token`, `POST /odds-provider/token/retry-push` — each answers `503 MODULE_NOT_INSTALLED` when its add-on is absent. Permissions: `igames/module-settings` `admin:settings:read` / `:write`; credentials, provider settings, key rotation and tokens `admin:integrations:read` / `:write`

**Error log** (`admin:audit:read`)
- `GET /errors/recent`, `GET /errors/status`, `POST /errors/clear` **[demo blocked]**

**Theme / Branding / Pages / Game showcase**
- `GET /theme`, `PATCH /theme` (`updateThemeSchema`: `id`, `value`)
- `GET /theme/presets`, `POST /theme/apply-preset` (`applyThemePresetSchema`: `id`)
- `GET /branding`, `PATCH /branding` (`updateBrandingSchema`: `id`, `value` — image/font fields `data:` URL, size limit varies by definition)
- `GET /pages/home`, `PATCH /pages/home` (`updateHomeContentSchema`: `sectionOrder[]`, `banners[]`)
- `GET /games/featured`, `PATCH /games/featured` (`updateFeaturedGamesSchema`: `codes[]`, max 60)

**Game settings (RTP/limit/house edge — the 15 in-house games; the King of Money slot accepts only `*MinBet`/`*MaxBet` and `isActive`)**
- `GET /game-settings`
- `PATCH /game-settings/:gameId` **[demo blocked]** (`updateGameSettingsSchema` — game-dependent `*MinBet`/`*MaxBet`/`*HouseEdgePercent`/`*PayoutFactor`/`*Mult` fields, `isActive?`, `reason?`)
- `POST /game-settings/:gameId/simulate-rtp` (`simulateRtpSchema` — only blackjack/video poker fields + `hands?` 20000-500000)

**Settings** (`admin:settings:read` / `write`)
- Alerts: `GET /settings/alerts`, `PUT /settings/alerts`, `POST /settings/alerts/test`
- Email Gateway (Mailtrap Email API or SMTP; UI: Settings → Modules → Email Gateway): `GET /settings/email`, `PUT /settings/email` (`pass` and `token` are stored encrypted and need `OPERATOR_SECRET_ENCRYPTION_KEY`; `gatewayEnabled` selects panel values vs. `.env`; `provider` accepts `mailtrap`/`mailgun`/`ses`/`postmark`/`custom`; `clear` accepts `pass` and `token`; `useSandbox` + `sandboxInboxId` control Mailtrap sandbox sending), `POST /settings/email/test` (rate limited, sends a real mail; optional `to`; `400 MAIL_PROVIDER_NOT_CONFIGURED` when neither a token nor an SMTP host is set, `400 MAILTRAP_SANDBOX_INBOX_MISSING` when sandbox is on without an inbox ID, `502 MAIL_SEND_FAILED` when the provider rejects the send)
- System email templates — `/mail-templates`: `GET /`, `GET /stats`, `GET /events`, `GET /logs`, `POST /preview`, `GET /:id` (read); `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/send` (write; only `scheduled` templates can be sent from the panel, event templates are sent by the platform). Details: [`docs/mail-templates.md`](../mail-templates.md)
- SMS Gateway — `/sms`: provider `GET /settings`, `PATCH /settings`, `POST /settings/test` (dry connection test, sends nothing), `POST /test-send` (`{ to, message }`, sends a real SMS); senders `GET /senders`, `GET /senders/gate`, `POST /senders`, `PATCH /senders/:id`, `DELETE /senders/:id`; `GET /logs`; templates `GET /templates`, `POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`, `POST /templates/:id/send`. Details: [`docs/sms-gateway/README.md`](../sms-gateway/README.md)
- Slikair credentials: `GET /slikair/settings`, `PUT /slikair/settings`
- Google login (UI: Settings → Modules → Google Login): `GET /settings/google-auth`, `PUT /settings/google-auth` (`enabled`, `clientId`, `clientSecret` stored encrypted, `redirectUri`; the response adds `defaultRedirectUri` and `active`)
- SEO: `GET /settings/seo`, `PUT /settings/seo` (`seoSettingsSchema`)
- Timezone / default language: `GET`/`PUT /settings/timezone`, `GET`/`PUT /settings/default-locale`
- Currency: `GET /currency`, `PUT /currency` **[demo blocked]** (`updateCurrencySchema`: `code` — only defined currencies)

**Roles / Permissions** (`admin:roles:*`)
- `GET /roles`
- `POST /roles` **[demo blocked]** (`createRoleSchema`: `name` (lowercase/digit/_), `displayName`, `description?`, `permissions[]?`, `priority?` 0-99; the caller must hold every listed permission, `403 ROLE_GRANT_FORBIDDEN`; `PUT /roles/:id` follows the same rule and system roles cannot be changed)
- `PUT /roles/:id` **[demo blocked]** (`updateRoleSchema`)
- `DELETE /roles/:id` **[demo blocked]**
- `GET /permissions`, `GET /me/permissions` (the caller's own permissions)
- `POST /users/:id/roles` **[demo blocked]** (`assignRoleSchema`: `roleId`; `403 ROLE_GRANT_FORBIDDEN` when the role holds a permission the caller lacks)
- `DELETE /users/:id/roles/:roleId` **[demo blocked]**

**Promotions** (`admin:settings:*`)
- `GET /promotions`, `POST /promotions` **[demo blocked]** (`upsertPromotionSchema`), `DELETE /promotions/:id` **[demo blocked]**

**VIP levels**
- `GET /vip-levels`
- `POST /vip-levels` **[demo blocked]** (`upsertVipLevelSchema`: `level` 1-20, `name`, `xpRequired`, `cashbackPercent?`, `rewardAmount?`, `rewardType?`, `benefits[]?`, `color?`, `icon?`, `isActive?`)
- `DELETE /vip-levels/:level` **[demo blocked]**

**Bot players** — all seven routes are gated by **`DEMO_BOTS=true`** first, else `404 DEMO_FEATURE_DISABLED` (the permission check is never reached)
- `GET /bots`
- `POST /bots` **[demo blocked]** (`createBotSchema`: `username`,`email`,`password?`,`botType?`,`behavior?`,`limits?`,`notes?`)
- `GET /bots/:id`
- `PATCH /bots/:id` **[demo blocked]** (`updateBotSchema`)
- `DELETE /bots/:id` **[demo blocked]**
- `POST /bots/start-all` **[demo blocked]**, `POST /bots/stop-all` **[demo blocked]**

**Fake winners (cosmetic, uses no real balance)** — both routes are gated by **`DEMO_FAKE_WINNERS=true`** first, else `404 DEMO_FEATURE_DISABLED`
- `GET /fake-winners`
- `PUT /fake-winners` **[demo blocked]** (`updateFakeWinnersSchema`: `enabled?`,`poolMin?`,`poolMax?`,`intervalMinMs?`,`intervalMaxMs?`,`amountMin?`,`amountMax?`,`includeCasinoWins?`,`includeBettingWins?` — min/max pairs are cross-validated)

**Static pages (footer)**
- `GET /static-pages`
- `PUT /static-pages/:slug` **[demo blocked]** (`upsertStaticPageSchema`: `title`,`intro?`,`sections[]`)
- `PATCH /static-pages/:slug/toggle` **[demo blocked]** (`toggleStaticPageSchema`: `isEnabled`)

**KYC** (`admin:kyc:read` / `approve`)
- `GET /kyc-settings`, `PUT /kyc-settings`, `POST /kyc-settings/test` (provider choice and Sumsub credentials, connection test). Sumsub secrets (`SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET`) are stored encrypted and returned masked only (`rawValue: null`); a masked value sent back in `PUT` leaves the stored secret unchanged
- `GET /kyc/submissions`, `GET /kyc/stats`, `GET /kyc/submissions/:id`
- `POST /kyc/submissions/:id/approve`, `/reject`, `/under-review`

**Wallet — crypto, bank, Slikair, referral** (`admin:transactions:*`)
- `GET /crypto/pending-deposits`, `/crypto/pending-withdrawals`, `/crypto/all-deposits`, `/crypto/all-withdrawals`, `/crypto/stats`, `/crypto/tx-detail/:id`, `/crypto/tx-verify/:txHash`, `GET /bank/stats`
- `PUT /crypto/settings` (`admin:settings:write`, `updateCryptoSettingsSchema`): `{ deposit?: { autoCreditLimit?, requireApprovalAbove? }, withdraw?: { autoProcessLimit?, requireApprovalAbove? }, usdtTryRate?, network? }`, strict at both levels (unknown keys `400`), limits 0–1e9, rate > 0 and ≤ 1e6, network `mainnet`\|`shasta`\|`nile`. Only the keys sent are stored (`Setting` `crypto.settings`, merged onto the previous row) and they win over `USDT_TRY_RATE` / `TRON_NETWORK`; unsent keys keep following the env
- `POST /crypto/deposits/:id/approve`, `/reject`; `POST /crypto/withdrawals/:id/approve`, `/reject`, `/reconcile` (check a `processing` withdrawal against the chain now), `/resolve` (`{ sent, txHash? }` — only for a `processing` withdrawal without a recorded transaction ID)
- `GET /slikair/payments`, `/slikair/payments/:id`, `/slikair/payouts`, `/slikair/payouts/:id`, `/slikair/stats`; `POST /slikair/payouts` (also behind the `slikair-payment` module gate)
- `GET /referral/settings`, `PUT /referral/settings` (`admin:referral:*`)

**Sub-routers mounted under `/api/admin`**
- `/modules` — `GET /` (module list: status + licence combined; `admin:settings:read`), `PATCH /:id` (toggle with `{ enabled: boolean }`), `POST /refresh` (refreshes module + licence cache) (both `admin:settings:write`) (`controllers/modules.js`)
- `/agents` — agent (reseller) CRUD, player assignment, fund transfer (`admin:agent:read` / `write`)
- `/audit` — `GET /logs`, `/stats`, `/export`, `/target/:targetType/:targetId`; the whole router needs `admin:audit:read`, and `/export` additionally `admin:reports:export` (CSV: UTF-8 BOM, CRLF rows, RFC 4180 quoting, cells starting with `= + - @ TAB CR` prefixed with `'`)
- `/reconciliation` — `GET /jobs`, `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/start`, `GET /jobs/:id/items`, `POST /items/:itemId/resolve`, `GET /stats` (`admin:reconciliation:read`; the POSTs `admin:reconciliation:write`)
- `/segments` — player segments: CRUD, `POST /:id/compute`, `GET /:id/players`, `GET /:id/stats`, `POST /update-stats`
- `/currencies`, `/brands`, `/jurisdictions` — CRUD managers of the multi-currency (incl. `POST /convert`, rate updates), multi-brand (incl. domains) and multi-jurisdiction (incl. `POST /eligibility`) subsystems; the Settings tabs use them
- `/health` — `GET /` (overview), `/services`, `/system`, `/metrics`, `POST /check`, `GET /risk` (risk-engine counters `statusStats`, `levelStats`, `evaluationStats`; `admin:risk:read`, `Cache-Control: no-store`)
- `/api/admin/risk` (separate mount) — risk dashboard, findings, player risk, rules CRUD (`admin:risk:*`)

### Admin analytics — `/api/admin/analytics` (`routes/analytics.js`) — admin, `admin:reports:read`

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
| `GET /api/img?url=` | Public | Hotlink-protected CDN image proxy (only accepts `image/*` content-type) |