# API Reference

All endpoints are grouped under `/api` (except the setup wizard, which is under `/install`). This document first summarizes the endpoint **groups**, then provides the **endpoint list** extracted from the real route files for each group. The ultimate source for full parameter/return types is the code itself (`server/src/routes/`), this document is a detailed map leading there.

| Group | Base path | What it contains |
|---|---|---|
| Authentication | `/api/auth` | Registration, login, session refresh, email verification, password reset |
| Web3 wallet login | `/api/auth/wallet` | Login via MetaMask/WalletConnect etc., linking wallet to account |
| Social login | `/api/auth` (google/telegram) | Login/account linking via Google and Telegram OAuth |
| 2FA | `/api/auth/2fa` | Two-factor authentication for admin accounts |
| Events | `/api/events` | Sports betting event list, details — **betting module gate** |
| Bets | `/api/bets` | Coupon creation, bet details — **betting module gate** |
| Users | `/api/users` | Profile, balance, favorites/recently played, password/email change, KVKK data export, account deletion, responsible gaming limits |
| Transactions | `/api/transactions` | Simple deposit/withdrawal records |
| Promotions | `/api/promotions` | Bonus claiming, active promotions, wagering conversion |
| Casino | `/api/casino` | Aggregator-agnostic spin/balance endpoint — **casino-content module gate** |
| Igames | `/api/igames` | Only mounted when the licensed Igames Casino package is installed — not present in this repo |
| In-house games | `/api/inhouse-provider`, `/api/provider/v1` | Only mounted when the licensed In-house Games package is installed — not present in this repo. `/api/inhouse` (`routes/inhouse.js`, always in core) exposes just the public "recent winners" feed, no game logic |
| Help | `/api/help` | AI support assistant (chatbot) |
| Crypto | `/api/crypto` | USDT-TRC20 deposit address/tracking + withdrawal request |
| Bank | `/api/bank` | Bank transfer deposit/withdrawal requests + admin approval flow |
| Support tickets | `/api/tickets` | User support tickets + admin reply/status |
| Chat | `/api/chat` | Live chat rooms + admin moderation |
| Theme | `/api/theme` | Panel-managed visual tokens (public) |
| Branding | `/api/branding` | Logo, favicon, site name, font (public) |
| Page content | `/api/pages` | Homepage section order + banners (public) |
| Static pages | `/api/static-pages` | About/Careers/Legal etc. footer pages (public) |
| Games | `/api/games` | Featured game code list (public) |
| Currency | `/api/currency` | Active/supported currencies (public) |
| Locale | `/api/locale-config` | Operator timezone (public) |
| Modules | `/api/modules` | Module on/off status for client menu (public) |
| VIP | `/api/vip` | User's VIP level/progress |
| Admin | `/api/admin` | User/event/game/theme/brand/role/VIP/bot management — requires admin privileges |
| Admin analytics | `/api/admin/analytics` | Dashboard statistics |
| Setup | `/install` | Single-page setup wizard (first deploy, no terminal needed) |

## Authentication model

- Access token: short-lived JWT, in the `Authorization: Bearer <token>` header.
- Refresh token: `httpOnly` cookie, new access token obtained via `/api/auth/refresh`.
- **Guest endpoints** (`/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/wallet/login`, `/auth/google`, `/auth/telegram`) go through `guestOnly` middleware — return `403 ALREADY_AUTHENTICATED` if there's an active session, a user with an open session can't call these endpoints.
- Admin endpoints require two-layer control: `requireAuth` (valid JWT) + `requireAdmin` (`role: 'admin'`). `/api/auth/2fa/*` is the exception — it only has `requireAuth` middleware, admin control is done manually inside the handler (`NOT_ADMIN` 403).
- **Demo admin restriction**: admin accounts marked with `isDemoAdmin: true` are rejected by the `blockDemoAdmin` middleware on destructive endpoints (user/balance deletion, event settlement, role/VIP/bot deletion, chat/ticket moderation, etc.) — prevents irreversible damage in a showcase/demo environment.

## Error format

Standard errors return in the same envelope:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Username or password is incorrect" } }
```

The `code` field is for programmatic checking, `message` is user-facing text (Turkish in the current codebase).

**Note (important for operators):** This envelope is consistently applied only in newer-generation routes using `createError()` (auth, users, admin, ticket, chat, module gate). Older/simpler routes (`inhouse.js`, `casino.js`, `crypto.js`, `igames.js`, some endpoints of `bank.js`) may still return flat `{ "error": "message text" }` string errors. When writing a client/integration, you need to handle both formats (`error` string or `error.code`/`error.message` object).

## Rate limiting

The following limiters are defined with `express-rate-limit` (disabled in test mode — `NODE_ENV=test` or `E2E_TEST=true`):

| Limiter | Window | Limit | Applied to |
|---|---|---|---|
| `globalLimiter` | 15 min | 1200 requests/IP | All `/api/*` (except health endpoints) |
| `authLimiter` | 15 min | 5 requests/IP | `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/resend-verification`, `/auth/wallet/nonce`, `/auth/wallet/login`, `/auth/google`, `/auth/telegram`, `/auth/telegram/widget-state` |
| `financialLimiter` | 60 min | 10 requests/IP | `/bank/deposit`, `/bank/withdraw` |
| `spinLimiter` | 60 sec | 60 requests/IP | `/casino/spin` |
| `adminLimiter` | 15 min | 50 requests/IP | `/auth/2fa/setup`, `/auth/2fa/verify`, `/auth/2fa/disable` |
| `igamesCallbackLimiter`, `chatLimiter`, `bonusLimiter` | — | — | Defined but not currently connected to any route (ready in codebase, unused) |

Additionally, on authentication endpoints, `/auth/login` returns `429 TOO_MANY_ATTEMPTS` after consecutive failed attempts (login lockout, configurable with `LOGIN_LOCKOUT_MINUTES` env — independent of the auth limiter, per-user lockout).

---

## Endpoint Details

### Authentication — `/api/auth` (`routes/auth.js`)

| Method + Path | Auth | Body schema | Notes / error codes |
|---|---|---|---|
| `POST /register` | Guest (`guestOnly`) + `authLimiter` | `registerSchema`: `username` (3-30, `[a-zA-Z0-9_]`), `email`, `password` (8-128, ≥1 uppercase + ≥1 digit), `referredBy?`, **`acceptedTerms: true` (required)**, **`acceptedKvkk: true` (required)**, `consentVersion?`, `turnstileToken?` | `409 USER_EXISTS` |
| `POST /login` | Guest + `authLimiter` | `loginSchema`: `username`, `password`, `turnstileToken?` | `429 TOO_MANY_ATTEMPTS`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_BANNED`, `403 EMAIL_NOT_VERIFIED` |
| `POST /refresh` | Public (refresh cookie) | — | `401 NO_REFRESH_TOKEN` / `USER_NOT_FOUND` / `TOKEN_REVOKED` / `INVALID_REFRESH_TOKEN` |
| `POST /logout` | Public | — | Clears refresh cookie |
| `GET /verify-email` | Public | Query: `token` | `400 INVALID_TOKEN` |
| `POST /verify-email` | Public | `emailVerifySchema`: `token` (10-200) | `400 INVALID_TOKEN` |
| `POST /resend-verification` | `authLimiter` | `resendVerificationSchema`: `email` | |
| `POST /forgot-password` | Guest + `authLimiter` | `passwordResetRequestSchema`: `email`, `turnstileToken?` | |
| `POST /reset-password` | Guest + `authLimiter` | `passwordResetConfirmSchema`: `token`, `newPassword` (8-128, uppercase+digit) | `400 INVALID_TOKEN` |

### Web3 wallet login — `/api/auth/wallet` (`routes/web3Auth.js`)

| Method + Path | Auth | Body schema | Notes |
|---|---|---|---|
| `POST /nonce` | `authLimiter` | `walletNonceSchema`: `address` (`0x` + 40 hex) | Shared for both login and account linking flows, no auth required |
| `POST /login` | Guest + `authLimiter` | `walletAuthSchema`: `address`, `signature`, `message`, `walletType?` (metamask/walletconnect/coinbase/injected/unknown), `chainId?` | Creates account automatically if new user |
| `POST /link` | User | `walletAuthSchema` (same as above) | Links wallet to existing account |
| `DELETE /` | User | — | Removes wallet link |

### Social login — `/api/auth` (`routes/socialAuth.js`, Google/Telegram)

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /google` | Guest + `authLimiter` | Redirects to Google OAuth URL |
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

### Events — `/api/events` (`routes/events.js`) — **betting module gate**

If the module is disabled, all these endpoints return `503 { error: { code: 'MODULE_DISABLED', module: 'betting' } }`.

| Method + Path | Auth |
|---|---|
| `GET /` | Public |
| `GET /summary` | Public |
| `GET /:id` | Public |

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
| `POST /withdraw` | `withdrawSchema`: `amount` (20-50000), `iban` (TR + 24 digits, mod-97 checksum), `fullName` (3-100), `confirmForfeit?` (default `false`) |

### Promotions — `/api/promotions` (`routes/promotions.js`)

| Method + Path | Auth |
|---|---|
| `GET /` | Public |
| `GET /my-wagerings` | User |
| `POST /:id/claim` | User |
| `POST /:id/wagerings/:wid/convert` | User |

### Casino — `/api/casino` (`routes/casino.js`) — **casino-content module gate**

| Method + Path | Auth | Body | Error codes |
|---|---|---|---|
| `POST /spin` | User + `spinLimiter` | `{ bet, payout, gameId?, gameTitle?, provider? }` | `400 INVALID_BET`, `400 INVALID_PAYOUT`, `404 NOT_FOUND`, `400 INSUFFICIENT_BALANCE` |

### Igames (casino aggregator) — `/api/igames`

Only mounted when the licensed Igames Casino package is installed
(`server/src/premium/igames/`) — its routes and full API reference live in
that package, not in this repo. Core only defines the generic aggregator
contract (`server/src/services/casinoAggregators/registry.js`) that any
casino-content vendor — Igames or otherwise — plugs into.

### In-house games — `/api/inhouse` (`routes/inhouse.js`) — core platform, no module gate

Core only exposes `GET /recent-winners` (public) — the "recent winners" social-proof
ticker's initial load data. All 13 games' actual play endpoints
(start/spin/deal/cashout etc.) are part of the licensed In-house Games
module, mounted separately under `/api/inhouse-provider` and
`/api/provider/v1` when installed — they are not in this repo.

### Help — `/api/help` (`routes/help.js`)

| Method + Path | Auth | Body | Notes |
|---|---|---|---|
| `POST /chat` | User | `{ messages: [{role, content}, ...] }` | RAG-grounded AI support assistant; returns a fixed "under maintenance" response if `AI_HELP_API_KEY` is not defined |

### Crypto — `/api/crypto` (`routes/crypto.js`) — all require user login

| Method + Path | Body | Notes |
|---|---|---|
| `GET /deposit-address` | — | User-specific TRC20 USDT address; returns `503` if `CRYPTO_SEED_PHRASE` not set |
| `POST /check-deposit` | — | Queries TronGrid, converts incoming USDT to TRY at `USDT_TRY_RATE` and adds to balance |
| `POST /withdraw-request` | `{ address, usdtAmount }` (min 5, `T` + 33 character TRC20 address) | Creates manual/admin-approved withdrawal request |

### Bank — `/api/bank` (`routes/bank.js`)

| Method + Path | Auth | Body schema |
|---|---|---|
| `GET /info` | Public | — |
| `POST /deposit` | User + `financialLimiter` | `depositSchema` |
| `POST /withdraw` | User + `financialLimiter` | `withdrawSchema` |
| `GET /requests` | User | — |
| `GET /admin/pending` | Admin | — |
| `PATCH /admin/pending/:id/approve` | Admin | — |
| `PATCH /admin/pending/:id/reject` | Admin | — |

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
| `GET /api/locale-config` | `localeConfig.js` | `{ timezone }` |
| `GET /api/modules` | `modules.js` | `{ modules: [{ id, title, description, available }] }` — license source doesn't leak |

### VIP — `/api/vip` (`routes/vip.js`)

| Method + Path | Auth |
|---|---|
| `GET /status` | User — current VIP level/progress |

### Admin — `/api/admin` (`routes/admin.js`) — all require `requireAuth` + `requireAdmin` + audit log

Destructive/financial endpoints additionally apply `blockDemoAdmin` (marked below as **[demo blocked]**) — `isDemoAdmin: true` accounts get `403` on these endpoints.

**Users**
- `GET /users`, `POST /users` (`createUserSchema`: `username`,`email`,`password`,`role?`,`referredBy?`)
- `PATCH /users/:id`
- `DELETE /users/:id` **[demo blocked]**
- `PATCH /users/:id/balance` **[demo blocked]** (`updateBalanceSchema`: `amount` (positive), `type`: `credit`|`debit`|`bonus`, `note?`)
- `GET /users/:id/referrals`, `GET /users/:id/referral-tree`, `GET /users/:id/transactions`

**Events**
- `GET /events/archived`
- `POST /events` (`createEventSchema`: `sport`,`league`,`homeTeam`,`awayTeam`,`startTime`,`markets[]`)
- `PATCH /events/:id`
- `POST /events/:id/settle` **[demo blocked]** (`settleEventSchema`: `results` — oddId or array of oddIds, `score?`)

**Statistics / Tasks**
- `GET /stats`, `GET /tasks`, `PATCH /tasks/:id`

**Casino**
- `GET /casino/stats`, `GET /users/:id/casino-rounds`

**Igames (admin)**
- `GET /igames/agent/info`, `POST /igames/user/create`, `POST /igames/game/launch`, `POST /igames/game/list`
- `GET /igames/test-users`, `POST /igames/withdraw-test-users`, `POST /igames/rtp`, `POST /igames/bonus/start`, `POST /igames/bonus/cancel`, `GET /igames/bonus/config`, `GET /igames/summary`

**Error log**
- `GET /errors/recent`, `GET /errors/status`, `POST /errors/clear` **[demo blocked]**

**Theme / Branding / Pages / Game showcase**
- `GET /theme`, `PATCH /theme` (`updateThemeSchema`: `id`, `value`)
- `GET /theme/presets`, `POST /theme/apply-preset` (`applyThemePresetSchema`: `id`)
- `GET /branding`, `PATCH /branding` (`updateBrandingSchema`: `id`, `value` — image/font fields `data:` URL, size limit varies by definition)
- `GET /pages/home`, `PATCH /pages/home` (`updateHomeContentSchema`: `sectionOrder[]`, `banners[]`)
- `GET /games/featured`, `PATCH /games/featured` (`updateFeaturedGamesSchema`: `codes[]`, max 60)

**Game settings (RTP/limit/house edge — consumed by the licensed In-house Games module)**
- `GET /game-settings`
- `PATCH /game-settings/:gameId` **[demo blocked]** (`updateGameSettingsSchema` — game-dependent `*MinBet`/`*MaxBet`/`*HouseEdgePercent`/`*PayoutFactor`/`*Mult` fields, `isActive?`, `reason?`)
- `POST /game-settings/:gameId/simulate-rtp` (`simulateRtpSchema` — only blackjack/video poker fields + `hands?` 20000-500000)

**Alert settings**
- `GET /settings/alerts`, `PUT /settings/alerts`, `POST /settings/alerts/test`

**Timezone / Currency**
- `GET /settings/timezone`, `PUT /settings/timezone` (`updateTimezoneSchema`: `timezone`)
- `GET /currency`, `PUT /currency` **[demo blocked]** (`updateCurrencySchema`: `code` — only defined currencies)

**Roles / Permissions**
- `GET /roles`
- `POST /roles` **[demo blocked]** (`createRoleSchema`: `name` (lowercase/digit/_), `displayName`, `description?`, `permissions[]?`, `priority?` 0-99)
- `PUT /roles/:id` **[demo blocked]** (`updateRoleSchema`)
- `DELETE /roles/:id` **[demo blocked]**
- `GET /permissions`
- `POST /users/:id/roles` **[demo blocked]** (`assignRoleSchema`: `roleId`)
- `DELETE /users/:id/roles/:roleId` **[demo blocked]**

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

**Modules** (`/api/admin/modules` — separate sub-router, `controllers/modules.js`)
- `GET /` — module list (status + license combined)
- `PATCH /:id` — toggle with `{ enabled: boolean }`
- `POST /refresh` — refreshes module + license cache

### Admin analytics — `/api/admin/analytics` (`routes/analytics.js`) — admin

| Method + Path |
|---|
| `GET /overview` |
| `GET /users` |
| `GET /casino` |
| `GET /finance` |
| `GET /sports` |

### Setup — `/install` (`routes/install.js`) — not under `/api`

| Method + Path | Notes |
|---|---|
| `GET /install` | Build-free single-page setup form |
| `GET /install/api/status` | DB connection + setup status |
| `POST /install/api/run` | Creates first admin + site settings, generates `.env` content; returns `409` if already installed, `400` on validation error |

### Health / utility endpoints (inside `app.js`, no route file)

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /api/health` | Public | `{ ok: true, env }` — uptime monitoring |
| `GET /api/health/status` | Public | `{ api, db, igames, oddsSource, payment, onlineCount, sync }` — deep health, not cached |
| `GET /api/img?url=` | Public | Hotlink-protected CDN image proxy (only accepts `image/*` content-type) |